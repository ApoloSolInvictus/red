const { allowCors, requireMethod, sendError, sendJson } = require("./_lib/http");
const { getDb, verifyRequest } = require("./_lib/firebaseAdmin");

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) {
    return;
  }

  if (!requireMethod(req, res, ["GET"])) {
    return;
  }

  try {
    const token = await verifyRequest(req);
    const snapshot = await getDb()
      .collection("students")
      .doc(token.uid)
      .collection("courses")
      .where("status", "==", "active")
      .get();

    sendJson(res, 200, {
      user: {
        uid: token.uid,
        email: token.email || "",
        name: token.name || ""
      },
      access: snapshot.docs.map((doc) => ({
        courseId: doc.id,
        ...doc.data()
      }))
    });
  } catch (error) {
    sendError(res, error.statusCode || 500, error.message);
  }
};
