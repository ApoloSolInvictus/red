const admin = require("firebase-admin");
const { allowCors, readJson, requireMethod, sendError, sendJson } = require("./_lib/http");
const { hasFullCourseAccess } = require("./_lib/adminAccess");
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

function findCourse(catalog, courseId) {
  return catalog.courses.find((item) => item.id === courseId);
}

async function hasCourseAccess(token, course) {
  if (hasFullCourseAccess(token.email)) {
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

async function canTrackProgress({ token, course, lesson }) {
  if (lesson.preview) {
    return true;
  }

  return hasCourseAccess(token, course);
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

async function listExamResults(token) {
  const snapshot = await getDb()
    .collection("students")
    .doc(token.uid)
    .collection("progress")
    .get();

  return snapshot.docs
    .map((doc) => {
      const examResult = normalizeStoredExamResult(doc.data().examResult);
      return examResult ? { courseId: doc.id, ...examResult } : null;
    })
    .filter(Boolean);
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

async function saveExamResult(token, courseId, result) {
  await getDb()
    .collection("students")
    .doc(token.uid)
    .collection("progress")
    .doc(courseId)
    .set({
      courseId,
      examResult: result,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

async function hasCompletedAllLessons(token, course) {
  const progressDoc = await getDb()
    .collection("students")
    .doc(token.uid)
    .collection("progress")
    .doc(course.id)
    .get();

  const completed = new Set(progressDoc.exists && Array.isArray(progressDoc.data().completedLessonIds)
    ? progressDoc.data().completedLessonIds
    : []);

  return course.lessons.every((lesson) => completed.has(lesson.id));
}

function gradeExam(course, answers) {
  const questions = course.exam && Array.isArray(course.exam.questions)
    ? course.exam.questions
    : [];
  const score = questions.reduce((sum, question) => {
    return sum + (Number(answers[question.id]) === question.correctOption ? 1 : 0);
  }, 0);
  const questionCount = questions.length;
  const passingScore = course.exam.passingScore || Math.ceil(questionCount * 0.7);

  return {
    score,
    questionCount,
    passingScore,
    passed: score >= passingScore,
    answers,
    submittedAt: new Date().toISOString()
  };
}

function normalizeAnswers(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== "object" || Array.isArray(rawAnswers)) {
    return null;
  }

  return Object.entries(rawAnswers).reduce((answers, [questionId, value]) => {
    answers[String(questionId)] = Number(value);
    return answers;
  }, {});
}

function normalizeStoredExamResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  return {
    score: Number(result.score || 0),
    questionCount: Number(result.questionCount || 0),
    passingScore: Number(result.passingScore || 0),
    passed: Boolean(result.passed),
    answers: result.answers || {},
    submittedAt: result.submittedAt || ""
  };
}

function hasValidExamAnswers(course, answers) {
  return course.exam.questions.every((question) => {
    const value = answers[question.id];
    return Number.isInteger(value) && value >= 0 && value < question.translations.en.options.length;
  });
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
        progress: await listProgress(token),
        examResults: await listExamResults(token)
      });
      return;
    }

    const body = await readJson(req);
    const courseId = String(body.courseId || "");
    const catalog = readCatalog();

    if (body.examAnswers) {
      const course = findCourse(catalog, courseId);
      const answers = normalizeAnswers(body.examAnswers);

      if (!course || !course.exam) {
        sendError(res, 404, "Course exam not found.");
        return;
      }

      if (!answers || Object.keys(answers).length !== course.exam.questions.length) {
        sendError(res, 400, "All exam questions must be answered.");
        return;
      }

      if (!hasValidExamAnswers(course, answers)) {
        sendError(res, 400, "Invalid exam answers.");
        return;
      }

      if (!await hasCourseAccess(token, course)) {
        sendError(res, 403, "Course access is required to submit this exam.");
        return;
      }

      if (!await hasCompletedAllLessons(token, course)) {
        sendError(res, 403, "Complete all lessons before submitting the exam.");
        return;
      }

      const examResult = gradeExam(course, answers);
      await saveExamResult(token, course.id, examResult);

      sendJson(res, 200, {
        ok: true,
        courseId: course.id,
        examResult
      });
      return;
    }

    const lessonId = String(body.lessonId || "");
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
