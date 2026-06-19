const admin = require("firebase-admin");
const { allowCors, readJson, requireMethod, sendError, sendJson } = require("./_lib/http");
const { isAdminEmail } = require("./_lib/adminAccess");
const { readCatalog } = require("./_lib/courses");
const { getDb, verifyRequest } = require("./_lib/firebaseAdmin");

function findLesson(catalog, courseId, lessonId) {
  const course = catalog.courses.find((item) => item.id === courseId);
  if (!course) {
    return {};
  }

  return {
    course,
    lesson: course.lessons.find((item) => item.id === lessonId)
  };
}

async function canTrackProgress({ token, course, lesson }) {
  if (isAdminEmail(token.email) || lesson.preview) {
    return true;
  }

  const accessDoc = await getDb()
    .collection("students")
    .doc(token.uid)
    .collection("courses")
    .doc(course.id)
    .get();

  return accessDoc.exists && accessDoc.data().status === "active";
}

async function listProgress(token) {
  const snapshot = await getDb()
    .collection("students")
    .doc(token.uid)
    .collection("progress")
    .get();

  return snapshot.docs.map((doc) => ({
    courseId: doc.id,
    completedLessonIds: Array.isArray(doc.data().completedLessonIds)
      ? doc.data().completedLessonIds
      : []
  }));
}

async function saveProgress(token, courseId, lessonId) {
  await getDb()
    .collection("students")
    .doc(token.uid)
    .collection("progress")
    .doc(courseId)
    .set({
      courseId,
      completedLessonIds: admin.firestore.FieldValue.arrayUnion(lessonId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) {
    return;
  }

  if (!requireMethod(req, res, ["GET", "POST"])) {
    return;
  }

  try {
    const token = await verifyRequest(req);

    if (req.method === "GET") {
      sendJson(res, 200, {
        progress: await listProgress(token)
      });
      return;
    }

    const body = await readJson(req);
    const courseId = String(body.courseId || "");
    const lessonId = String(body.lessonId || "");
    const catalog = readCatalog();
    const { course, lesson } = findLesson(catalog, courseId, lessonId);

    if (!course || !lesson) {
      sendError(res, 404, "Course lesson not found.");
      return;
    }

    if (!await canTrackProgress({ token, course, lesson })) {
      sendError(res, 403, "Course access is required to track this lesson.");
      return;
    }

    await saveProgress(token, course.id, lesson.id);

    sendJson(res, 200, {
      ok: true,
      courseId: course.id,
      lessonId: lesson.id
    });
  } catch (error) {
    sendError(res, error.statusCode || 500, error.publicMessage || error.message);
  }
};
