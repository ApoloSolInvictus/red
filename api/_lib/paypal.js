const { randomUUID } = require("crypto");

function getPayPalBaseUrl() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in Vercel.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Unable to authenticate with PayPal.");
  }

  return payload.access_token;
}

async function paypalRequest(path, options = {}) {
  const accessToken = await getPayPalAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = payload.message || payload.error_description || payload.name || "PayPal request failed.";
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function createOrder({ course, amount, uid }) {
  const requestId = randomUUID();
  const customId = `uid:${uid}|course:${course.id}`;

  return paypalRequest("/v2/checkout/orders", {
    method: "POST",
    headers: {
      "PayPal-Request-Id": requestId
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: course.id,
          custom_id: customId.slice(0, 127),
          description: course.translations.en.title,
          amount: {
            currency_code: amount.currency_code,
            value: amount.value
          }
        }
      ],
      application_context: {
        brand_name: "W Studio Learn",
        landing_page: "LOGIN",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW"
      }
    })
  });
}

async function captureOrder(orderId) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      "PayPal-Request-Id": randomUUID()
    }
  });
}

module.exports = {
  captureOrder,
  createOrder
};
