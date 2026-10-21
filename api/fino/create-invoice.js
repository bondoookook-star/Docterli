/**
 * FinoPay dynamic QR invoice endpoint
 * File: api/fino/create-invoice.js
 */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  const apiKey = (process.env.FINO_API_KEY || "").trim();
  const terminalNo = (process.env.FINO_TERMINAL_NO || "").trim();

  const apiKey = (process.env.FINO_API_KEY || "").replace(/\s/g, "");
    console.error("FinoPay configuration missing", {
      apiKeyPresent: Boolean(apiKey),
      terminalPresent: Boolean(terminalNo),
    });

    return res.status(500).json({
      success: false,
      error: "FinoPay server settings are missing",
    });
  }

  const { amount, orderId } = req.body || {};
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid amount",
    });
  }

  const externalRef = String(orderId || `DL-${Date.now()}`).slice(0, 64);

  try {
    const response = await fetch(
      "https://qr-api.finovation.mn/api/v1/merchant-api/dynamic-qr/invoices?terminal_no=" +
        encodeURIComponent(terminalNo),
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          amount: numericAmount.toFixed(2),
          terminal_no: terminalNo,
          description: `Doctor Li order ${externalRef}`.slice(0, 100),
          external_ref: externalRef,
          currency: "MNT",
          ttl_seconds: 900,
        }),
      }
    );

    let data;

    try {
      data = await response.json();
    } catch {
      console.error("FinoPay returned a non-JSON response", {
        httpStatus: response.status,
      });

      return res.status(502).json({
        success: false,
        error: "Invalid response from FinoPay",
      });
    }

    // Log only status and a sanitized message, never credentials.
    if (!response.ok || data?.success !== true || !data?.data) {
      const providerMessage =
        typeof data?.message === "string"
          ? data.message.slice(0, 300)
          : "No provider message";

      console.error("FinoPay invoice request failed", {
        httpStatus: response.status,
        keyPrefixOk: apiKey.startsWith("fino_live_"),
        keyHasSpace: /\s/.test(apiKey),
        keyLength: apiKey.length,
        providerMessage,
      });

      return res.status(response.status >= 400 ? response.status : 502).json({
        success: false,
        error: response.status === 401 || response.status === 403
          ? "FinoPay rejected the API credentials or access"
          : providerMessage,
      });
    }

    const invoice = data.data;

    if (!invoice.invoice_no || (!invoice.qr_payload && !invoice.payment_options?.qr_image)) {
      console.error("FinoPay response missing invoice or QR data", {
        hasInvoiceNo: Boolean(invoice.invoice_no),
        hasQrPayload: Boolean(invoice.qr_payload),
        hasQrImage: Boolean(invoice.payment_options?.qr_image),
      });

      return res.status(502).json({
        success: false,
        error: "FinoPay response did not contain usable QR information",
      });
    }

    return res.status(200).json({
      success: true,
      invoice_no: invoice.invoice_no,
      invoice_uuid: invoice.invoice_uuid ?? null,
      amount: invoice.amount ?? numericAmount,
      qr_image: invoice.payment_options?.qr_image ?? null,
      qr_payload: invoice.qr_payload ?? null,
      deep_links: invoice.payment_options?.deep_links ?? [],
      expires_at: invoice.expires_at ?? null,
      status: invoice.status ?? null,
    });
  } catch (error) {
    console.error("FinoPay connection error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });

    return res.status(502).json({
      success: false,
      error: "Unable to connect to FinoPay",
    });
  }
}
