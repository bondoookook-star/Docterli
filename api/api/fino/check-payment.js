export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.FINO_API_KEY;
  const terminalNo = process.env.FINO_TERMINAL_NO;
  if (!apiKey || !terminalNo) return res.status(500).json({ error: 'FinoPay server settings are missing' });
  const invoiceNo = String(req.query.invoice_no || '');
  if (!/^INV[A-Za-z0-9_-]+$/.test(invoiceNo)) return res.status(400).json({ error: 'Invalid invoice number' });
  try {
    const response = await fetch(`https://qr-api.finovation.mn/api/v1/merchant-api/dynamic-qr/invoices/${encodeURIComponent(invoiceNo)}`, {
      method: 'GET',
      headers: { 'X-API-Key': apiKey }
    });
    const result = await response.json();
    if (!response.ok || !result.success) return res.status(response.status || 502).json({ error: result.message || 'Unable to check payment' });
    return res.status(200).json({ invoice_no: result.data.invoice_no, status: result.data.status, is_paid: result.data.is_paid === true, amount: result.data.amount, expires_at: result.data.expires_at, paid_at: result.data.paid_at || null });
  } catch (error) {
    return res.status(502).json({ error: 'Unable to connect to FinoPay' });
  }
}
