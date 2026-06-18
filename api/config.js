const { allowCors, requireMethod, sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) {
    return;
  }

  if (!requireMethod(req, res, ["GET"])) {
    return;
  }

  sendJson(res, 200, {
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      projectId: process.env.FIREBASE_PROJECT_ID || "",
      appId: process.env.FIREBASE_APP_ID || "",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
      measurementId: process.env.FIREBASE_MEASUREMENT_ID || ""
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID || "",
      currency: "USD",
      environment: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox"
    }
  });
};
