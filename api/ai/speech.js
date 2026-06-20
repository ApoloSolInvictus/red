const { allowCors, readJson, requireMethod, sendError } = require("../_lib/http");

const MAX_TEXT_LENGTH = 1200;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
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

function getDefaultInstructions(language) {
  const languageName = {
    en: "English",
    de: "German",
    es: "Spanish"
  }[language] || "English";

  return `Speak in ${languageName} with a warm, friendly, feminine voice. Keep the tone clear, calm, and helpful for an online course student.`;
}

async function createSpeech({ text, language }) {
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const voice = process.env.OPENAI_TTS_VOICE || "nova";
  const instructions = process.env.OPENAI_TTS_INSTRUCTIONS || getDefaultInstructions(language);

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      voice,
      input: text,
      instructions,
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error && payload.error.message
      ? payload.error.message
      : "OpenAI speech request failed.");
    error.statusCode = response.status;
    throw error;
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    model,
    voice
  };
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
    sendError(res, 429, "Too many voice requests. Please wait a moment and try again.");
    return;
  }

  try {
    const body = await readJson(req);
    const language = normalizeLanguage(body.language);
    const text = String(body.text || "").trim().slice(0, MAX_TEXT_LENGTH);

    if (!text) {
      sendError(res, 400, "Text is required.");
      return;
    }

    const speech = await createSpeech({ text, language });
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-OpenAI-TTS-Model", speech.model);
    res.setHeader("X-OpenAI-TTS-Voice", speech.voice);
    res.end(speech.buffer);
  } catch (error) {
    sendError(res, error.statusCode || 500, error.message);
  }
};
