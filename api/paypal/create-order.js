const { allowCors, readJson, requireMethod, sendError, sendJson } = require("../_lib/http");
const { getCourse, toPayPalAmount } = require("../_lib/courses");
const { verifyRequest } = require("../_lib/firebaseAdmin");
const { createOrder } = require("../_lib/paypal");

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) {
    return;
  }

  if (!requireMethod(req, res, ["POST"])) {
    return;
  }

  try {
    const token = await verifyRequest(req);
    const body = await readJson(req);
    const course = getCourse(body.courseId);

    if (!course) {
      sendError(res, 404, "Course not found.");
      return;
    }

    const amount = toPayPalAmount(course);
    const order = await createOrder({ course, amount, uid: token.uid });

    sendJson(res, 200, {
      orderId: order.id
    });
  } catch (error) {
    sendError(res, error.statusCode || 500, error.message, error.details);
  }
};
