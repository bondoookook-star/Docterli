async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const sbUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/\s/g, "");
  const apiKey = (process.env.FINO_API_KEY || "").replace(/\s/g, "");
  const terminalNo = (process.env.FINO_TERMINAL_NO || "").trim();
  if (!sbUrl || !sbKey || !apiKey || !terminalNo) {
    return res.status(500).json({ success: false, error: "Server settings are missing" });
  }

  const body = req.body || {};
  const name = String(body.name || "").trim().slice(0, 100);
  const phone = String(body.phone || "").trim().slice(0, 30);
  const address = String(body.address || "").trim().slice(0, 300);
  if (!name || !phone || !address) {
    return res.status(400).json({ success: false, error: "Нэр, утас, хаягаа бүрэн оруулна уу" });
  }

  const qtyById = {};
  for (const it of (Array.isArray(body.items) ? body.items : []).slice(0, 50)) {
    const id = String((it && it.id) || "").replace(/\D/g, "");
    const q = Math.floor(Number(it && it.qty));
    if (!id || !(q > 0) || q > 99) continue;
    qtyById[id] = (qtyById[id] || 0) + q;
  }
  const ids = Object.keys(qtyById);
  if (!ids.length) return res.status(400).json({ success: false, error: "Сагс хоосон байна" });

  const sb = { apikey: sbKey, "Content-Type": "application/json" };

  try {
    // 1. Үнийг хүснэгтээс авах
    const pr = await fetch(`${sbUrl}/rest/v1/products?id=in.(${ids.join(",")})&select=*`, { headers: sb });
    const prods = await pr.json();
    if (!pr.ok || !Array.isArray(prods)) {
      console.error("products fetch failed", pr.status);
      return res.status(502).json({ success: false, error: "Барааны мэдээлэл авч чадсангүй" });
    }
    const items = [];
    for (const id of ids) {
      const p = prods.find((x) => String(x.id) === id);
      if (!p) return res.status(400).json({ success: false, error: "Бараа олдсонгүй, сагсаа шинэчилнэ үү" });
      items.push({ id, name: p.title || p.name || "", price: Number(p.price) || 0, qty: qtyById[id] });
    }
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const deliveryFee = subtotal === 0 || subtotal >= 150000 ? 0 : 7000;
    const total = subtotal + deliveryFee;
    if (!(total > 0)) return res.status(400).json({ success: false, error: "Invalid amount" });

    // 2. Захиалга хадгалах
    const ir = await fetch(`${sbUrl}/rest/v1/orders`, {
      method: "POST",
      headers: { ...sb, Prefer: "return=representation" },
      body: JSON.stringify({
        name, customer_name: name, phone, address,
        items: JSON.stringify(items),
        subtotal, delivery_fee: deliveryFee, total, total_price: total,
        paid: false, status: "Шинэ",
      }),
    });
    const irData = await ir.json();
    if (!ir.ok || !Array.isArray(irData) || !irData[0]) {
      console.error("order insert failed", ir.status, JSON.stringify(irData).slice(0, 300));
      return res.status(502).json({ success: false, error: "Захиалга хадгалж чадсангүй" });
    }
    const orderId = irData[0].id;

    // 3. Нэхэмжлэх үүсгэх
    const ref = String(orderId).slice(0, 64);
    const fr = await fetch(
      "https://qr-api.finovation.mn/api/v1/merchant-api/dynamic-qr/invoices?terminal_no=" +
        encodeURIComponent(terminalNo),
      {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          amount: total.toFixed(2),
          terminal_no: terminalNo,
          description: `Doctor Li order ${ref}`.slice(0, 100),
          external_ref: ref,
          currency: "MNT",
          ttl_seconds: 900,
        }),
      }
    );
    let fd;
    try { fd = await fr.json(); } catch { fd = null; }
    if (!fr.ok || !fd || fd.success !== true || !fd.data) {
      console.error("FinoPay failed", fr.status, typeof (fd && fd.message) === "string" ? fd.message.slice(0, 200) : "");
      return res.status(502).json({ success: false, error: "Төлбөрийн QR үүсгэж чадсангүй" });
    }
    const inv = fd.data;

    // 4. invoice_no хадгалах
    await fetch(`${sbUrl}/rest/v1/orders?id=eq.${orderId}`, {
      method: "PATCH",
      headers: sb,
      body: JSON.stringify({ invoice_no: inv.invoice_no || null }),
    });

    return res.status(200).json({
      success: true,
      order_id: orderId,
      total,
      invoice_no: inv.invoice_no,
      qr_image: inv.payment_options?.qr_image ?? null,
      qr_payload: inv.qr_payload ?? null,
      deep_links: inv.payment_options?.deep_links ?? [],
      expires_at: inv.expires_at ?? null,
    });
  } catch (e) {
    console.error("create-order error", e instanceof Error ? e.message : "unknown");
    return res.status(502).json({ success: false, error: "Серверийн алдаа гарлаа" });
  }
}

module.exports = handler;
