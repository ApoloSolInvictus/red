const admin = require("firebase-admin");

function normalizePrivateKey(privateKey) {
  return privateKey ? privateKey.replace(/\\n/g, "\n") : privateKey;
}

function getCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
    const json = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    return admin.credential.cert(JSON.parse(json));
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT or split admin variables in Vercel.");
  }

  return admin.credential.cert({
    projectId,
    clientEmail,
    privateKey
  });
}

function getAdminApp() {
  if (admin.apps.length) {
    return admin.app();
  }

  return admin.initializeApp({
    credential: getCredential(),
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
  });
}

function getAuth() {
  getAdminApp();
  return admin.auth();
}

function getDb() {
  getAdminApp();
  return admin.firestore();
}

async function verifyRequest(req) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    const error = new Error("Missing Firebase ID token.");
    error.statusCode = 401;
    throw error;
  }

  const decodedToken = await getAuth().verifyIdToken(match[1]);
  return decodedToken;
}

module.exports = {
  getAuth,
  getDb,
  verifyRequest
};
