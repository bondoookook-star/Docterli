/* FinoPay invoice endpoint - backend only */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.FINO_API_KEY;
  const terminalNo = process.env.FINO_TERMINAL_NO;
  if (!apiKey || !terminalNo) return res.status(500).json({ error: 'FinoPay server settings are missing' });
  const { amount, orderId } = req.body || {};
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  try {
    const response = await fetch('https://qr-api.finovation.mn/api/v1/merchant-api/dynamic-qr/invoices', {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: numericAmount.toFixed(2), terminal_no: terminalNo, description: `Doctor Li order ${String(orderId || '').slice(0, 40)}`, external_ref: String(orderId || `DL-${Date.now()}`), currency: 'MNT', ttl_seconds: 900 })
    });
    const data = await response.json();
    if (!response.ok || !data.success) return res.status(response.status || 502).json({ error: data.message || 'Invoice creation failed' });
    return res.status(200).json({ invoice_no: data.data.invoice_no, invoice_uuid: data.data.invoice_uuid, amount: data.data.amount, qr_image: data.data.payment_options?.qr_image || null, qr_payload: data.data.qr_payload, deep_links: data.data.payment_options?.deep_links || [], expires_at: data.data.expires_at, status: data.data.status });
  } catch (error) {
    return res.status(502).json({ error: 'Unable to connect to FinoPay' });
  }
}
