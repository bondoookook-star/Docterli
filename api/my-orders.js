const ANON = "sb_publishable_bQNdfGZZvs-lldXhGhVpaA_UlofuWZ5";

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const sbUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/\s/g, "");
  if (!sbUrl || !sbKey) {
    return res.status(500).json({ success: false, error: "Server settings are missing" });
  }

  const body = req.body || {};
  const tokens = (Array.isArray(body.tokens) ? body.tokens : [])
    .map(String)
    .filter((t) => /^[0-9a-f-]{36}$/i.test(t))
    .slice(0, 30);

  let userId = null;
  const auth = String(req.headers.authorization || "");
  if (auth.startsWith("Bearer ")) {
    try {
      const ur = await fetch(`${sbUrl}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
      if (ur.ok) { const u = await ur.json(); userId = u && u.id ? u.id : null; }
    } catch {}
  }

  const sb = { apikey: sbKey, "Content-Type": "application/json" };

  try {
    // Нэвтэрсэн хүний төхөөрөмж дээрх захиалгыг аккаунтад нь холбох
    if (userId && tokens.length) {
      await fetch(`${sbUrl}/rest/v1/orders?lookup_token=in.(${tokens.join(",")})&user_id=is.null`, {
        method: "PATCH",
        headers: sb,
        body: JSON.stringify({ user_id: userId }),
      });
    }

    const parts = [];
    if (tokens.length) parts.push(`lookup_token.in.(${tokens.join(",")})`);
    if (userId) parts.push(`user_id.eq.${userId}`);
    if (!parts.length) return res.status(200).json({ success: true, orders: [] });

    const url =
      `${sbUrl}/rest/v1/orders?or=(${parts.join(",")})` +
      `&select=id,created_at,items,total,total_price,paid,status,delivery_status` +
      `&order=created_at.desc&limit=50`;
    const r = await fetch(url, { headers: sb });
    const rows = await r.json();
    if (!r.ok || !Array.isArray(rows)) {
      console.error("my-orders failed", r.status);
      return res.status(502).json({ success: false, error: "Захиалга татаж чадсангүй" });
    }
    return res.status(200).json({ success: true, orders: rows });
  } catch (e) {
    console.error("my-orders error", e instanceof Error ? e.message : "unknown");
    return res.status(502).json({ success: false, error: "Серверийн алдаа" });
  }
}

module.exports = handler;
