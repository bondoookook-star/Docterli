/**
 * FinoPay payment status endpoint
 * File: api/fino/check-payment.js
 * Server-side only
 */

export default async function handler(req, res) {
  // Allow GET requests only
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  // Read credentials from Vercel Environment Variables
  const apiKey = process.env.FINO_API_KEY;
  const terminalNo = process.env.FINO_TERMINAL_NO;

  if (!apiKey || !terminalNo) {
    return res.status(500).json({
      success: false,
      error: "FinoPay server settings are missing",
    });
  }

  // Validate invoice number
  const rawInvoiceNo = req.query?.invoice_no;

  if (
    typeof rawInvoiceNo !== "string" ||
    !/^INV[A-Za-z0-9_-]+$/.test(rawInvoiceNo)
  ) {
    return res.status(400).json({
      success: false,
      error: "Invalid invoice number",
    });
  }

  const invoiceNo = rawInvoiceNo;

  try {
    // IMPORTANT: Backticks allow invoiceNo to be inserted into the URL.
    const url =
      `https://qr-api.finovation.mn/api/v1/merchant-api/dynamic-qr/invoices/${encodeURIComponent(invoiceNo)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
    });

    // Safely parse the provider response
    let result;

    try {
      result = await response.json();
    } catch {
      return res.status(502).json({
        success: false,
        error: "Invalid response from FinoPay",
      });
    }

    if (!response.ok || result?.success !== true || !result?.data) {
      return res.status(response.ok ? 502 : response.status).json({
        success: false,
        error:
          result?.message ||
          result?.error ||
          "Unable to check payment",
      });
    }

    const invoice = result.data;

    // Return only the fields needed by the shop
    return res.status(200).json({
      success: true,
      invoice_no: invoice.invoice_no ?? invoiceNo,
      status: invoice.status ?? null,
      is_paid: invoice.is_paid === true,
      amount: invoice.amount ?? null,
      expires_at: invoice.expires_at ?? null,
      paid_at: invoice.paid_at ?? null,
    });
  } catch {
    return res.status(502).json({
      success: false,
      error: "Unable to connect to FinoPay",
    });
  }
}
