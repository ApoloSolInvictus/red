const crypto = require("crypto");
const admin = require("firebase-admin");
const { allowCors, requireMethod, sendError, sendJson } = require("./_lib/http");
const { isAdminEmail } = require("./_lib/adminAccess");
const { readCatalog } = require("./_lib/courses");
const { getDb, verifyRequest } = require("./_lib/firebaseAdmin");

const PROGRAM_ID = "pro-ai-business";
const PROGRAM_TITLE = "Pro Level in AI and Business";
const PROGRAM_TITLE_ES = "Nivel Pro de IA y Negocios";
const CERTIFICATE_COLLECTION = "certificates";
const SITE_URL = "https://learn.wstudio3d.com";

function getRequestUrl(req) {
  return new URL(req.url || "/api/certificate", SITE_URL);
}

function publicCertificate(certificate) {
  if (!certificate) {
    return null;
  }

  return {
    certificateId: certificate.certificateId,
    programId: certificate.programId,
    programTitle: certificate.programTitle,
    programTitleEs: certificate.programTitleEs,
    studentName: certificate.studentName,
    studentEmail: certificate.studentEmail,
    courseCount: Number(certificate.courseCount || 0),
    averageScore: Number(certificate.averageScore || 0),
    passingScore: Number(certificate.passingScore || 70),
    issuedAt: certificate.issuedAt,
    status: certificate.status || "valid",
    issuer: certificate.issuer || "W Studio Learn",
    verificationUrl: certificate.verificationUrl
  };
}

function getStudentName(token) {
  const name = String(token.name || "").trim();
  if (name) {
    return name;
  }

  const email = String(token.email || "").trim();
  return email ? email.split("@")[0] : "W Studio Student";
}

async function hasCourseAccess(token, course) {
  if (isAdminEmail(token.email)) {
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

async function readProgressMap(token) {
  const snapshot = await getDb()
    .collection("students")
    .doc(token.uid)
    .collection("progress")
    .get();

  return new Map(snapshot.docs.map((doc) => [doc.id, doc.data() || {}]));
}

function normalizeExamResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  return {
    score: Number(result.score || 0),
    questionCount: Number(result.questionCount || 0),
    passingScore: Number(result.passingScore || 0),
    passed: Boolean(result.passed),
    submittedAt: result.submittedAt || ""
  };
}

function courseIsComplete(course, progress) {
  const completed = new Set(Array.isArray(progress.completedLessonIds)
    ? progress.completedLessonIds
    : []);

  if (!course.lessons.every((lesson) => completed.has(lesson.id))) {
    return false;
  }

  const examResult = normalizeExamResult(progress.examResult);
  const passingScore = course.exam && course.exam.passingScore
    ? course.exam.passingScore
    : Math.ceil((course.exam && course.exam.questions ? course.exam.questions.length : 10) * 0.7);

  return Boolean(examResult && examResult.passed && examResult.score >= passingScore);
}

async function buildEligibility(token) {
  const catalog = readCatalog();
  const progressMap = await readProgressMap(token);
  const courseStatuses = [];

  for (const course of catalog.courses) {
    const progress = progressMap.get(course.id) || {};
    const access = await hasCourseAccess(token, course);
    const completed = access && courseIsComplete(course, progress);
    const examResult = normalizeExamResult(progress.examResult);

    courseStatuses.push({
      courseId: course.id,
      completed,
      score: examResult ? examResult.score : 0,
      questionCount: examResult ? examResult.questionCount : 0,
      submittedAt: examResult ? examResult.submittedAt : ""
    });
  }

  const completedCourses = courseStatuses.filter((course) => course.completed);
  const averageScore = completedCourses.length
    ? Math.round((completedCourses.reduce((sum, course) => {
      return sum + (course.questionCount ? (course.score / course.questionCount) * 100 : 0);
    }, 0) / completedCourses.length) * 10) / 10
    : 0;

  return {
    eligible: completedCourses.length === catalog.courses.length,
    courseCount: catalog.courses.length,
    completedCount: completedCourses.length,
    averageScore,
    latestSubmittedAt: completedCourses
      .map((course) => course.submittedAt)
      .filter(Boolean)
      .sort()
      .pop() || ""
  };
}

function makeCertificateId(token, issuedAt) {
  const year = new Date(issuedAt).getUTCFullYear();
  const digest = crypto
    .createHash("sha256")
    .update(`${token.uid}:${token.email || ""}:${PROGRAM_ID}:${issuedAt}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();

  return `WST-AIBIZ-${year}-${digest}`;
}

async function getStudentCertificate(token) {
  const doc = await getDb()
    .collection("students")
    .doc(token.uid)
    .collection("certificates")
    .doc(PROGRAM_ID)
    .get();

  return doc.exists ? doc.data() : null;
}

async function issueCertificate(token) {
  const existing = await getStudentCertificate(token);
  if (existing) {
    return existing;
  }

  const eligibility = await buildEligibility(token);
  if (!eligibility.eligible) {
    const error = new Error("All courses and final exams must be completed before issuing this certificate.");
    error.statusCode = 403;
    error.details = eligibility;
    throw error;
  }

  const issuedAt = new Date().toISOString();
  const certificateId = makeCertificateId(token, issuedAt);
  const verificationUrl = `${SITE_URL}/certificate?id=${encodeURIComponent(certificateId)}`;
  const certificate = {
    certificateId,
    programId: PROGRAM_ID,
    programTitle: PROGRAM_TITLE,
    programTitleEs: PROGRAM_TITLE_ES,
    studentName: getStudentName(token),
    studentEmail: String(token.email || ""),
    uid: token.uid,
    courseCount: eligibility.courseCount,
    averageScore: eligibility.averageScore,
    passingScore: 70,
    issuedAt,
    status: "valid",
    issuer: "W Studio Learn",
    verificationUrl
  };

  const db = getDb();
  await db.collection(CERTIFICATE_COLLECTION).doc(certificateId).set({
    ...certificate,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  await db.collection("students").doc(token.uid).collection("certificates").doc(PROGRAM_ID).set({
    ...certificate,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return certificate;
}

async function verifyCertificate(certificateId) {
  const normalizedId = String(certificateId || "").trim().toUpperCase();
  if (!normalizedId) {
    return null;
  }

  const doc = await getDb().collection(CERTIFICATE_COLLECTION).doc(normalizedId).get();
  return doc.exists ? doc.data() : null;
}

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) {
    return;
  }

  if (!requireMethod(req, res, ["GET", "POST"])) {
    return;
  }

  try {
    if (req.method === "GET") {
      const certificateId = getRequestUrl(req).searchParams.get("id");

      if (certificateId) {
        const certificate = await verifyCertificate(certificateId);
        if (!certificate) {
          sendError(res, 404, "Certificate not found.");
          return;
        }

        sendJson(res, 200, {
          valid: certificate.status === "valid",
          certificate: publicCertificate(certificate)
        });
        return;
      }

      const token = await verifyRequest(req);
      sendJson(res, 200, {
        certificate: publicCertificate(await getStudentCertificate(token))
      });
      return;
    }

    const token = await verifyRequest(req);
    const certificate = await issueCertificate(token);
    sendJson(res, 200, {
      certificate: publicCertificate(certificate)
    });
  } catch (error) {
    sendError(res, error.statusCode || 500, error.message, error.details);
  }
};
