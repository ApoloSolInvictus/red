const { allowCors, readJson, requireMethod, sendError, sendJson } = require("../_lib/http");
const { readCatalog } = require("../_lib/courses");

const MAX_HISTORY_ITEMS = 8;
const MAX_MESSAGE_LENGTH = 900;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 14;
const rateLimitBuckets = new Map();

function getClientId(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
}

function checkRateLimit(req) {
  const now = Date.now();
  const clientId = getClientId(req);
  const bucket = rateLimitBuckets.get(clientId) || [];
  const recent = bucket.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) {
    return false;
  }

  recent.push(now);
  rateLimitBuckets.set(clientId, recent);
  return true;
}

function normalizeLanguage(language) {
  return ["en", "de", "es"].includes(language) ? language : "en";
}

function localize(item, language) {
  const fallback = item.translations && item.translations.en ? item.translations.en : {};
  const localized = item.translations && item.translations[language] ? item.translations[language] : {};
  return { ...fallback, ...localized };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildCatalogContext(language) {
  const catalog = readCatalog();
  const resources = catalog.resources || {};

  return catalog.courses.map((course) => {
    const copy = localize(course, language);
    const lessons = course.lessons.map((lesson, index) => {
      const lessonCopy = localize(lesson, language);
      const lessonResources = unique((lesson.resourceIds || [])
        .map((resourceId) => resources[resourceId] && resources[resourceId].name));

      return `${index + 1}. ${lessonCopy.title}: ${lessonCopy.description}. Tools: ${lessonResources.join(", ") || "none"}.`;
    }).join(" ");

    return [
      `Course ${course.order}: ${copy.title}`,
      `Level: ${course.level}. Phase: ${course.phase}. Duration: ${course.duration}. Price: ${course.price} ${catalog.currency}.`,
      `Summary: ${copy.summary}`,
      `Outcomes: ${(copy.outcomes || []).join("; ")}`,
      `Lessons: ${lessons}`
    ].join("\n");
  }).join("\n\n");
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item && item.role === "assistant" ? "assistant" : "user",
      content: String(item && item.content ? item.content : "").slice(0, MAX_MESSAGE_LENGTH)
    }))
    .filter((item) => item.content.trim());
}

function buildInstructions(language, catalogContext) {
  const languageLabel = {
    en: "English",
    de: "German",
    es: "Spanish"
  }[language] || "English";

  return `
You are the free W Studio Learn course guide on learn.wstudio3d.com.
Answer in ${languageLabel}, matching the student's language when possible.
Use only the course catalog below. Do not invent courses, prices, tools, access rules, or private student data.
Stay focused on W Studio Learn classes: digital business, branding, Canva, AI content, copywriting, social video, Envato, ThemeForest, SEO, email/CRM, GitHub, Vercel, ChatGPT, Codex, Firebase, PayPal, web apps, and chatbots.
If the student asks about a topic outside these classes, politely say you can only help with W Studio Learn courses and guide them back to the closest relevant class.
Give practical step-by-step guidance. Keep answers concise, warm, and useful. When helpful, recommend specific course names and lesson themes.
Never ask the student to pay or log in just to receive guidance here. You may mention that full lessons, progress, exams, and paid access are inside the course platform.

COURSE CATALOG:
${catalogContext}
`.trim();
}

function extractResponseText(payload) {
  if (payload && typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const chunks = [];
  for (const item of payload && Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (typeof content.text === "string") {
        chunks.push(content.text);
      } else if (typeof content.output_text === "string") {
        chunks.push(content.output_text);
      }
    }
  }

  return chunks.join("\n").trim();
}

async function createCourseGuideAnswer({ message, history, language }) {
  const catalogContext = buildCatalogContext(language);
  const model = process.env.OPENAI_COURSE_GUIDE_MODEL || "gpt-5.4";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions: buildInstructions(language, catalogContext),
      input: [
        ...normalizeHistory(history),
        {
          role: "user",
          content: message
        }
      ],
      max_output_tokens: 700
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error && payload.error.message
      ? payload.error.message
      : "OpenAI course guide request failed.");
    error.statusCode = response.status;
    throw error;
  }

  const answer = extractResponseText(payload);
  if (!answer) {
    throw new Error("OpenAI returned an empty answer.");
  }

  return { answer, model };
}

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) {
    return;
  }

  if (!requireMethod(req, res, ["POST"])) {
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    sendError(res, 503, "OpenAI API key is not configured.");
    return;
  }

  if (!checkRateLimit(req)) {
    sendError(res, 429, "Too many questions. Please wait a moment and try again.");
    return;
  }

  try {
    const body = await readJson(req);
    const message = String(body.message || "").trim().slice(0, MAX_MESSAGE_LENGTH);
    const language = normalizeLanguage(body.language);

    if (!message) {
      sendError(res, 400, "Message is required.");
      return;
    }

    const result = await createCourseGuideAnswer({
      message,
      history: body.history,
      language
    });

    sendJson(res, 200, {
      answer: result.answer,
      model: result.model
    });
  } catch (error) {
    sendError(res, error.statusCode || 500, error.message);
  }
};
