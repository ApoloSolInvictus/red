const { FieldValue } = require("firebase-admin/firestore");
const { allowCors, readJson, requireMethod, sendError, sendJson } = require("../_lib/http");
const { getCourse, toPayPalAmount } = require("../_lib/courses");
const { getDb, verifyRequest } = require("../_lib/firebaseAdmin");
const { captureOrder } = require("../_lib/paypal");

function getCapture(capturedOrder) {
  const unit = capturedOrder.purchase_units && capturedOrder.purchase_units[0];
  const capture = unit && unit.payments && unit.payments.captures && unit.payments.captures[0];

  return {
    unit,
    capture
  };
}

function validateCapture({ capturedOrder, course, amount, uid }) {
  const { unit, capture } = getCapture(capturedOrder);

  if (capturedOrder.status !== "COMPLETED" || !capture || capture.status !== "COMPLETED") {
    throw new Error("Payment was not completed.");
  }

  const paidAmount = capture.amount || unit.amount;
  if (paidAmount.currency_code !== amount.currency_code || paidAmount.value !== amount.value) {
    throw new Error("Payment amount does not match the selected course.");
  }

  const customId = unit.custom_id || "";
  if (!customId.includes(`uid:${uid}`) || !customId.includes(`course:${course.id}`)) {
    throw new Error("Payment does not match this student and course.");
  }

  return capture;
}

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

    if (!body.orderId) {
      sendError(res, 400, "Missing PayPal order ID.");
      return;
    }

    const amount = toPayPalAmount(course);
    const capturedOrder = await captureOrder(body.orderId);
    const capture = validateCapture({
      capturedOrder,
      course,
      amount,
      uid: token.uid
    });

    await getDb()
      .collection("students")
      .doc(token.uid)
      .collection("courses")
      .doc(course.id)
      .set(
        {
          courseId: course.id,
          status: "active",
          source: "paypal",
          amount,
          orderId: capturedOrder.id,
          captureId: capture.id,
          purchasedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    sendJson(res, 200, {
      ok: true,
      courseId: course.id,
      orderId: capturedOrder.id,
      captureId: capture.id
    });
  } catch (error) {
    sendError(res, error.statusCode || 500, error.message, error.details);
  }
};
