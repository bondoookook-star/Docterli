async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const sbUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/\s/g, "");
  const apiKey = (process.env.FINO_API_KEY || "").replace(/\s/g, "");
  if (!sbUrl || !sbKey || !apiKey) {
    return res.status(500).json({ success: false, error: "Server settings are missing" });
  }

  const id = String(req.query.order_id || "").replace(/\D/g, "");
  if (!id) return res.status(400).json({ success: false, error: "Invalid order" });

  const sb = { apikey: sbKey, "Content-Type": "application/json" };

  try {
    const or = await fetch(`${sbUrl}/rest/v1/orders?id=eq.${id}&select=id,paid,invoice_no`, { headers: sb });
    const rows = await or.json();
    if (!or.ok || !Array.isArray(rows) || !rows[0]) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    const order = rows[0];
    if (order.paid) return res.status(200).json({ success: true, paid: true });
    if (!order.invoice_no) return res.status(200).json({ success: true, paid: false });

    const fr = await fetch(
      "https://qr-api.finovation.mn/api/v1/merchant-api/dynamic-qr/invoices/" +
        encodeURIComponent(order.invoice_no),
      { headers: { "X-API-Key": apiKey, Accept: "application/json" } }
    );
    let fd = null;
    try { fd = await fr.json(); } catch {}
    if (!fr.ok || !fd || fd.success !== true || !fd.data) {
      console.error("status check failed", fr.status);
      return res.status(200).json({ success: true, paid: false });
    }

    const d = fd.data;
    const paid = d.is_paid === true && d.status === "PAID";
    if (paid) {
      await fetch(`${sbUrl}/rest/v1/orders?id=eq.${id}`, {
        method: "PATCH",
        headers: sb,
        body: JSON.stringify({ paid: true, status: "Төлсөн" }),
      });
    }
    return res.status(200).json({ success: true, paid, status: d.status });
  } catch (e) {
    console.error("check-payment error", e instanceof Error ? e.message : "unknown");
    return res.status(200).json({ success: true, paid: false });
  }
}

module.exports = handler;
