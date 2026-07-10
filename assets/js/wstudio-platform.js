const state = {
  access: new Set(),
  aiGuideBusy: false,
  aiGuideMessages: [],
  aiGuideVoiceEnabled: true,
  authReady: false,
  catalog: null,
  certificate: null,
  config: null,
  examResults: {},
  firebase: null,
  firebaseFns: null,
  progress: {},
  selectedLessonId: null,
  user: null
};

const i18n = window.WStudioI18n;
const page = document.body.dataset.page || "home";
const phaseOrder = ["foundation", "creative", "marketing", "automation", "web", "pro-ai"];
const siteUrl = "https://learn.wstudio3d.com";
const socialImageUrl = `${siteUrl}/images/social/learn-social-preview.jpg`;

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("wstudio:language-changed", () => {
  renderHeader();
  renderPage();
});

async function init() {
  renderHeader();
  setStatus(i18n.t("status.loading"));

  const [catalog, config] = await Promise.all([
    loadCatalog(),
    loadConfig()
  ]);

  state.catalog = catalog;
  state.config = config;
  state.progress = readLocalProgress();
  state.examResults = readLocalExamResults();

  renderPage();
  await initFirebase();
  setStatus(i18n.t("status.ready"));
}

async function loadCatalog() {
  const response = await fetch("data/courses.json", { cache: "no-store" });
  return response.json();
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Config API unavailable.");
    }
    return response.json();
  } catch (error) {
    return {
      firebase: {},
      paypal: {},
      localOnly: true
    };
  }
}

function hasFirebaseConfig() {
  const firebase = state.config && state.config.firebase;
  return Boolean(firebase && firebase.apiKey && firebase.authDomain && firebase.projectId && firebase.appId);
}

async function initFirebase() {
  if (!hasFirebaseConfig()) {
    state.authReady = true;
    showNotice("auth", i18n.t("auth.configMissing"));
    renderHeader();
    renderPage();
    return;
  }

  const [
    appModule,
    authModule
  ] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js")
  ]);

  const app = appModule.initializeApp(state.config.firebase);
  const auth = authModule.getAuth(app);

  state.firebase = { app, auth };
  state.firebaseFns = authModule;

  if (page === "login" && typeof authModule.getRedirectResult === "function") {
    authModule.getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          goToNext();
        }
      })
      .catch((error) => {
        setFormMessage(formatAuthError(error), true);
      });
  }

  authModule.onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.authReady = true;

    if (user) {
      state.progress = readLocalProgress();
      state.examResults = readLocalExamResults();
      await loadStudentAccess();
      await loadStudentProgress();
    } else {
      state.access = new Set();
      state.certificate = null;
      state.progress = readLocalProgress();
      state.examResults = readLocalExamResults();
    }

    renderHeader();
    renderPage();
  });
}

async function loadStudentAccess() {
  try {
    const token = await state.user.getIdToken();
    const response = await fetch("/api/me", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error("Student API unavailable.");
    }

    const payload = await response.json();
    state.access = new Set((payload.access || []).map((item) => item.courseId));
  } catch (error) {
    state.access = new Set();
    showNotice("api", i18n.t("status.apiIssue"));
  }
}

async function loadStudentProgress() {
  if (!state.user) {
    return;
  }

  try {
    const token = await state.user.getIdToken();
    const response = await fetch("/api/progress", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error("Progress API unavailable.");
    }

    const payload = await response.json();
    state.progress = mergeProgress(state.progress, normalizeProgress(payload.progress || []));
    state.examResults = mergeExamResults(state.examResults, normalizeExamResults(payload.examResults || []));
    saveLocalProgress();
    saveLocalExamResults();
    await loadStudentCertificate();
  } catch (error) {
    showNotice("progress", i18n.t("progress.localOnly"));
  }
}

async function loadStudentCertificate() {
  if (!state.user) {
    state.certificate = null;
    return;
  }

  try {
    const token = await state.user.getIdToken();
    const response = await fetch("/api/certificate", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error("Certificate API unavailable.");
    }

    const payload = await response.json();
    state.certificate = payload.certificate || null;
  } catch (error) {
    state.certificate = null;
  }
}

function renderHeader() {
  const header = document.querySelector("[data-wstudio-header]");
  if (!header) {
    return;
  }

  const authLabel = state.user ? i18n.t("nav.logout") : i18n.t("nav.login");
  const authHref = state.user ? "#" : "login.html";
  const languageButtons = Object.entries(i18n.languages).map(([code, language]) => {
    const active = code === i18n.language ? " is-active" : "";
    return `<button class="language-option${active}" type="button" data-language="${code}">${language.short}</button>`;
  }).join("");

  header.innerHTML = `
    <div class="site-shell nav-shell">
      <a class="brand" href="index.html" aria-label="W Studio Learn">
        <img class="brand-mark" src="images/w-studio-logo.png" alt="W Studio">
        <span class="brand-text">W Studio Learn</span>
      </a>
      <nav class="nav-links" aria-label="Primary">
        <a href="courses.html">${i18n.t("nav.courses")}</a>
        <a href="student.html">${i18n.t("nav.dashboard")}</a>
      </nav>
      <div class="nav-actions">
        <div class="language-switcher" aria-label="Language">
          ${languageButtons}
        </div>
        <a class="button button-ghost" href="${authHref}" data-auth-action="${state.user ? "logout" : "login"}">${authLabel}</a>
      </div>
    </div>
  `;

  header.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => i18n.setLanguage(button.dataset.language));
  });

  const authAction = header.querySelector("[data-auth-action='logout']");
  if (authAction) {
    authAction.addEventListener("click", async (event) => {
      event.preventDefault();
      await signOut();
    });
  }
}

function renderPage() {
  if (!state.catalog) {
    return;
  }

  if (page === "home") {
    renderHome();
  }

  if (page === "courses") {
    renderCoursesPage();
  }

  if (page === "course") {
    renderCoursePage();
  }

  if (page === "login") {
    renderLoginPage();
  }

  if (page === "dashboard") {
    renderDashboardPage();
  }

  i18n.translate(document);
  updateRuntimeSeo();
}

function renderHome() {
  const target = document.querySelector("[data-home]");
  if (!target) {
    return;
  }

  target.innerHTML = `
    <section class="hero">
      <div class="site-shell hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">${i18n.t("hero.eyebrow")}</p>
          <h1>${i18n.t("hero.title")}</h1>
          <p>${i18n.t("hero.copy")}</p>
          <div class="hero-actions">
            <a class="button button-primary" href="courses.html">${i18n.t("hero.primary")}</a>
            <a class="button button-secondary" href="login.html">${i18n.t("hero.secondary")}</a>
          </div>
        </div>
        <div class="hero-panel" aria-label="W Studio course stats">
          <div class="hero-photo">
            <img src="images/landing-futuristic-workstation.png" alt="">
          </div>
          <img src="images/w-studio-logo.png" alt="" class="hero-logo">
          <div class="hero-stat"><strong>${state.catalog.courses.length}</strong><span>${i18n.t("hero.statCourses")}</span></div>
          <div class="hero-stat"><strong>EN / DE / ES</strong><span>${i18n.t("hero.statLanguages")}</span></div>
          <div class="hero-stat"><strong>1:1</strong><span>${i18n.t("hero.statCheckout")}</span></div>
        </div>
      </div>
    </section>
    ${renderLandingLevels()}
    ${renderAiGuideSection()}
    <section class="site-shell section">
      <div class="section-head">
        <p class="eyebrow">${i18n.t("section.featured")}</p>
        <h2>${i18n.t("section.allCourses")}</h2>
      </div>
      <div class="course-grid">
        ${getCourses().slice(0, 4).map(renderCourseCard).join("")}
      </div>
    </section>
    <section class="section section-band">
      <div class="site-shell">
        <div class="section-head">
          <p class="eyebrow">Firebase + Vercel + PayPal</p>
          <h2>${i18n.t("section.how")}</h2>
        </div>
        <div class="steps-grid">
          ${renderStep("01", i18n.t("how.auth.title"), i18n.t("how.auth.copy"))}
          ${renderStep("02", i18n.t("how.pay.title"), i18n.t("how.pay.copy"))}
          ${renderStep("03", i18n.t("how.access.title"), i18n.t("how.access.copy"))}
        </div>
      </div>
    </section>
  `;

  bindAiGuideControls(target);
}

function renderLandingLevels() {
  const levels = [
    {
      key: "beginner",
      className: "level-white",
      image: "images/landing-level-beginner.png",
      courseIds: [
        "digital-business-foundations",
        "brand-identity-systems",
        "canva-for-entrepreneurs",
        "ai-content-systems",
        "copywriting-offer-design"
      ]
    },
    {
      key: "intermediate",
      className: "level-yellow is-reversed",
      image: "images/landing-level-intermediate.png",
      courseIds: [
        "social-video-content-machine",
        "envato-creative-assets",
        "themeforest-website-blueprint",
        "seo-analytics-conversion",
        "email-automation-crm"
      ]
    },
    {
      key: "advanced",
      className: "level-black",
      image: "images/landing-level-advanced.png",
      courseIds: [
        "github-vercel-deployment",
        "chatgpt-business-systems",
        "codex-web-builder",
        "ai-web-apps-chatbots"
      ]
    }
  ];

  return `
    <section class="level-intro site-shell section">
      <p class="eyebrow">${i18n.t("levels.eyebrow")}</p>
      <h2>${i18n.t("levels.title")}</h2>
      <p>${i18n.t("levels.copy")}</p>
    </section>
    ${levels.map(renderLandingLevel).join("")}
  `;
}

function renderLandingLevel(level) {
  const courses = level.courseIds
    .map((courseId) => state.catalog.courses.find((course) => course.id === courseId))
    .filter(Boolean);

  return `
    <section class="level-band ${level.className}">
      <div class="site-shell level-grid">
        <div class="level-copy">
          <p class="eyebrow">${i18n.t(`level.${level.key}.eyebrow`)}</p>
          <h2>${i18n.t(`level.${level.key}.title`)}</h2>
          <p>${i18n.t(`level.${level.key}.copy`)}</p>
          <ul class="level-points">
            <li>${i18n.t(`level.${level.key}.point1`)}</li>
            <li>${i18n.t(`level.${level.key}.point2`)}</li>
            <li>${i18n.t(`level.${level.key}.point3`)}</li>
          </ul>
          <div class="level-course-list" aria-label="${escapeAttribute(i18n.t("levels.includes"))}">
            <span>${i18n.t("levels.includes")}</span>
            ${courses.map((course) => `<a href="course.html?id=${encodeURIComponent(course.id)}">${escapeHtml(localize(course).title)}</a>`).join("")}
          </div>
        </div>
        <div class="level-visual">
          <img src="${escapeAttribute(level.image)}" alt="">
        </div>
      </div>
    </section>
  `;
}

function renderAiGuideSection() {
  const voiceLabel = state.aiGuideVoiceEnabled ? i18n.t("aiGuide.voiceOn") : i18n.t("aiGuide.voiceOff");
  const disabled = state.aiGuideBusy ? " disabled" : "";

  return `
    <section class="ai-guide-band" data-ai-guide-section>
      <div class="site-shell ai-guide-grid">
        <div class="ai-guide-copy">
          <p class="eyebrow">${i18n.t("aiGuide.eyebrow")}</p>
          <h2>${i18n.t("aiGuide.title")}</h2>
          <p>${i18n.t("aiGuide.copy")}</p>
          <div class="ai-guide-prompt">
            <span>${i18n.t("aiGuide.promptLabel")}</span>
            <strong>${i18n.t("aiGuide.prompt")}</strong>
          </div>
        </div>
        <div class="ai-guide-console" aria-label="OpenAI API course assistant">
          <div class="ai-chat-log" data-ai-chat-log>
            ${renderAiGuideMessages()}
          </div>
          <div class="voice-wave" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <form class="ai-guide-form" data-ai-guide-form>
            <textarea class="ai-guide-input" data-ai-guide-input rows="3" maxlength="900" placeholder="${escapeAttribute(i18n.t("aiGuide.inputPlaceholder"))}"${disabled}></textarea>
            <div class="ai-guide-actions">
              <button class="voice-button" type="button" data-ai-mic${disabled}>${i18n.t("aiGuide.micStart")}</button>
              <button class="voice-button voice-button-dark" type="button" data-ai-voice-toggle aria-pressed="${state.aiGuideVoiceEnabled ? "true" : "false"}">${voiceLabel}</button>
              <button class="button button-primary" type="submit"${disabled}>${state.aiGuideBusy ? i18n.t("aiGuide.thinking") : i18n.t("aiGuide.send")}</button>
            </div>
          </form>
          <p class="ai-guide-status" data-ai-status>${state.aiGuideBusy ? i18n.t("aiGuide.thinking") : i18n.t("aiGuide.status")}</p>
        </div>
      </div>
    </section>
  `;
}

function renderAiGuideMessages() {
  const messages = state.aiGuideMessages.length
    ? state.aiGuideMessages
    : [{ role: "assistant", content: i18n.t("aiGuide.greeting") }];

  return messages.map(renderAiGuideMessage).join("");
}

function renderAiGuideMessage(message) {
  const role = message.role === "user" ? "user" : "assistant";
  const label = role === "user" ? i18n.t("aiGuide.student") : i18n.t("aiGuide.ai");

  return `
    <article class="ai-message ai-message-${role}">
      <span>${label}</span>
      <p>${formatAiMessage(message.content)}</p>
    </article>
  `;
}

function formatAiMessage(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function bindAiGuideControls(root) {
  const form = root.querySelector("[data-ai-guide-form]");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAiGuideQuestion(form);
  });

  const micButton = form.querySelector("[data-ai-mic]");
  if (micButton) {
    micButton.addEventListener("click", () => startAiGuideRecognition(form));
  }

  const voiceButton = form.querySelector("[data-ai-voice-toggle]");
  if (voiceButton) {
    voiceButton.addEventListener("click", () => {
      state.aiGuideVoiceEnabled = !state.aiGuideVoiceEnabled;
      rerenderAiGuide();
    });
  }

  scrollAiGuideLog();
}

async function submitAiGuideQuestion(form) {
  if (state.aiGuideBusy) {
    return;
  }

  const input = form.querySelector("[data-ai-guide-input]");
  const message = input ? input.value.trim() : "";
  if (!message) {
    setAiGuideStatus(i18n.t("aiGuide.empty"));
    return;
  }

  const history = state.aiGuideMessages.slice(-8);
  state.aiGuideMessages.push({ role: "user", content: message });
  state.aiGuideBusy = true;
  rerenderAiGuide();

  try {
    const answer = await requestAiGuideAnswer(message, history);
    state.aiGuideMessages.push({ role: "assistant", content: answer });
    state.aiGuideBusy = false;
    rerenderAiGuide();

    if (state.aiGuideVoiceEnabled) {
      await playAiGuideSpeech(answer);
    }
  } catch (error) {
    state.aiGuideBusy = false;
    state.aiGuideMessages.push({
      role: "assistant",
      content: error.message || i18n.t("aiGuide.error")
    });
    rerenderAiGuide();
  }
}

async function requestAiGuideAnswer(message, history) {
  const response = await fetch("/api/ai/course-guide", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      history,
      language: i18n.language
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || i18n.t("aiGuide.error"));
  }

  const answer = String(payload.answer || "").trim();
  if (!answer) {
    throw new Error(i18n.t("aiGuide.error"));
  }

  return answer;
}

function startAiGuideRecognition(form) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    setAiGuideStatus(i18n.t("aiGuide.unsupportedMic"));
    return;
  }

  const recognition = new Recognition();
  recognition.lang = getSpeechLanguage();
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => setAiGuideStatus(i18n.t("aiGuide.listening"));
  recognition.onerror = () => setAiGuideStatus(i18n.t("aiGuide.error"));
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results || [])
      .map((result) => result[0] && result[0].transcript)
      .filter(Boolean)
      .join(" ")
      .trim();

    const input = form.querySelector("[data-ai-guide-input]");
    if (input) {
      input.value = transcript;
    }

    if (transcript) {
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else {
        submitAiGuideQuestion(form);
      }
    }
  };

  recognition.start();
}

async function playAiGuideSpeech(text) {
  setAiGuideStatus(i18n.t("aiGuide.voiceLoading"));

  try {
    const response = await fetch("/api/ai/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        language: i18n.language
      })
    });

    if (!response.ok) {
      throw new Error("Speech API unavailable.");
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.addEventListener("ended", () => URL.revokeObjectURL(audioUrl), { once: true });
    await audio.play();
    setAiGuideStatus(i18n.t("aiGuide.status"));
  } catch (error) {
    fallbackSpeak(text);
  }
}

function fallbackSpeak(text) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    setAiGuideStatus(i18n.t("aiGuide.voiceFallback"));
    return;
  }

  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = getSpeechLanguage();
  utterance.voice = chooseSpeechVoice(utterance.lang);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  setAiGuideStatus(i18n.t("aiGuide.voiceFallback"));
}

function chooseSpeechVoice(language) {
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.find((voice) => voice.lang === language && isLikelyFemaleVoice(voice.name));
  const sameLanguage = voices.find((voice) => voice.lang && voice.lang.startsWith(language.slice(0, 2)) && isLikelyFemaleVoice(voice.name));
  return exact || sameLanguage || voices.find((voice) => voice.lang && voice.lang.startsWith(language.slice(0, 2))) || null;
}

function isLikelyFemaleVoice(name) {
  return /female|woman|samantha|monica|paulina|helena|google us english|nova|shimmer/i.test(name || "");
}

function getSpeechLanguage() {
  return {
    de: "de-DE",
    es: "es-ES",
    en: "en-US"
  }[i18n.language] || "en-US";
}

function setAiGuideStatus(message) {
  const target = document.querySelector("[data-ai-status]");
  if (target) {
    target.textContent = message;
  }
}

function rerenderAiGuide() {
  const section = document.querySelector("[data-ai-guide-section]");
  if (!section) {
    return;
  }

  section.outerHTML = renderAiGuideSection();
  bindAiGuideControls(document);
}

function scrollAiGuideLog() {
  const log = document.querySelector("[data-ai-chat-log]");
  if (log) {
    log.scrollTop = log.scrollHeight;
  }
}

function renderCoursesPage() {
  const target = document.querySelector("[data-courses]");
  if (!target) {
    return;
  }

  target.innerHTML = `
    <section class="page-hero site-shell">
      <p class="eyebrow">${i18n.t("section.allCourses")}</p>
      <h1>${i18n.t("section.allCourses")}</h1>
      <p>${i18n.t("section.allCoursesCopy")}</p>
    </section>
    <section class="site-shell roadmap-section">
      <div class="section-head">
        <div>
          <p class="eyebrow">${i18n.t("section.roadmap")}</p>
          <h2>${i18n.t("section.roadmap")}</h2>
        </div>
        <p>${i18n.t("section.roadmapCopy")}</p>
      </div>
      ${renderRoadmap()}
    </section>
    <section class="site-shell section">
      <div class="course-grid">
        ${getCourses().map(renderCourseCard).join("")}
      </div>
    </section>
  `;
}

function renderCourseCard(course) {
  const copy = localize(course);
  const owned = state.access.has(course.id);
  const tagList = course.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const phase = getPhaseLabel(course.phase);

  return `
    <article class="course-card">
      <a class="course-image course-image-photo" href="course.html?id=${encodeURIComponent(course.id)}" style="--course-accent: ${course.accent}">
        ${renderCoursePicture(course)}
      </a>
      <div class="course-card-body">
        <div class="course-card-top">
          <span class="phase-pill">${escapeHtml(phase)}</span>
          <span class="course-order">${String(course.order || "").padStart(2, "0")}</span>
        </div>
        <div class="tag-row">${tagList}</div>
        <h3>${escapeHtml(copy.title)}</h3>
        <p>${escapeHtml(copy.subtitle)}</p>
        <dl class="meta-grid">
          <div><dt>${i18n.t("card.level")}</dt><dd>${escapeHtml(course.level)}</dd></div>
          <div><dt>${i18n.t("card.duration")}</dt><dd>${escapeHtml(course.duration)}</dd></div>
        </dl>
        <div class="card-bottom">
          <strong>${formatPrice(course)}</strong>
          <a class="button button-small" href="course.html?id=${encodeURIComponent(course.id)}">${owned ? i18n.t("card.enter") : i18n.t("card.view")}</a>
        </div>
      </div>
    </article>
  `;
}

function renderCoursePicture(course) {
  return `
    <picture>
      <source media="(max-width: 640px)" srcset="${getCoursePhotoImage(course, "square")}">
      <img src="${getCoursePhotoImage(course, "wide")}" alt="">
    </picture>
  `;
}

function getCoursePhotoImage(course, variant) {
  if (variant === "wide") {
    return `images/course-photos/${course.id}-wide.jpg`;
  }

  return course.image || `images/course-photos/${course.id}-square.jpg`;
}

function renderCoursePage() {
  const target = document.querySelector("[data-course]");
  if (!target) {
    return;
  }

  const course = getCurrentCourse();
  if (!course) {
    target.innerHTML = `<section class="site-shell page-hero"><h1>Course not found</h1><a class="button button-primary" href="courses.html">${i18n.t("course.back")}</a></section>`;
    return;
  }

  const copy = localize(course);
  const owned = state.access.has(course.id);
  const requestedLesson = course.lessons.find((lesson) => lesson.id === state.selectedLessonId);
  const firstPlayable = getResumeLesson(course, owned);
  const selectedLesson = requestedLesson && isLessonUnlocked(course, requestedLesson, owned)
    ? requestedLesson
    : firstPlayable || course.lessons[0];

  target.innerHTML = `
    <section class="course-hero">
      <div class="site-shell course-hero-grid">
        <div>
          <a class="back-link" href="courses.html">${i18n.t("course.back")}</a>
          <p class="eyebrow">${getPhaseLabel(course.phase)} / ${course.tags.map(escapeHtml).join(" / ")}</p>
          <h1>${escapeHtml(copy.title)}</h1>
          <p>${escapeHtml(copy.subtitle)}</p>
          <div class="course-hero-meta">
            <span>${escapeHtml(course.level)}</span>
            <span>${escapeHtml(course.duration)}</span>
            <span>${formatPrice(course)}</span>
          </div>
        </div>
        <aside class="checkout-panel">
          <div class="course-detail-image">
            ${renderCoursePicture(course)}
          </div>
          <h2>${owned ? i18n.t("course.owned") : i18n.t("course.buy")}</h2>
          <p>${escapeHtml(copy.summary)}</p>
          <div data-purchase-panel>${renderPurchasePanel(course, owned)}</div>
        </aside>
      </div>
    </section>
    <section id="curriculum" class="site-shell section course-layout">
      <div class="lesson-player">
        ${renderLessonPlayer(course, selectedLesson, owned)}
      </div>
      <aside class="curriculum">
        <h2>${i18n.t("course.curriculum")}</h2>
        <div class="lesson-list">
          ${course.lessons.map((lesson) => renderLessonButton(course, lesson, owned, selectedLesson)).join("")}
        </div>
      </aside>
    </section>
    ${renderCourseExam(course, owned)}
    <section class="site-shell section">
      <div class="outcome-panel">
        <div>
          <p class="eyebrow">${i18n.t("course.outcomes")}</p>
          <h2>${escapeHtml(copy.title)}</h2>
        </div>
        <ul>
          ${copy.outcomes.map((outcome) => `<li>${escapeHtml(outcome)}</li>`).join("")}
        </ul>
      </div>
    </section>
  `;

  target.querySelectorAll("[data-lesson-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedLessonId = button.dataset.lessonId;
      renderCoursePage();
    });
  });

  target.querySelectorAll("[data-complete-lesson-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const lesson = course.lessons.find((item) => item.id === button.dataset.completeLessonId);
      if (lesson) {
        await markLessonComplete(course, lesson);
      }
    });
  });

  const examForm = target.querySelector("[data-exam-form]");
  if (examForm) {
    examForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitCourseExam(course, examForm);
    });
  }

  renderPayPalButtons(course, owned);
}

function renderPurchasePanel(course, owned) {
  if (owned) {
    return `<a class="button button-primary button-full" href="#curriculum">${i18n.t("course.enter")}</a>`;
  }

  if (!state.user) {
    return `<a class="button button-primary button-full" href="login.html?next=course.html?id=${encodeURIComponent(course.id)}">${i18n.t("course.signIn")}</a>`;
  }

  if (!state.config || !state.config.paypal || !state.config.paypal.clientId || !hasFirebaseConfig()) {
    return `<div class="notice">${i18n.t("course.configMissing")}</div>`;
  }

  return `<div id="paypal-buttons" class="paypal-buttons"></div><div class="payment-message" data-payment-message></div>`;
}

async function renderPayPalButtons(course, owned) {
  const container = document.getElementById("paypal-buttons");
  if (!container || owned || !state.user || !state.config.paypal.clientId) {
    return;
  }

  try {
    await loadPayPalScript();
    window.paypal.Buttons({
      style: {
        layout: "vertical",
        color: "gold",
        shape: "rect",
        label: "pay"
      },
      createOrder: async () => {
        const token = await state.user.getIdToken();
        const response = await fetch("/api/paypal/create-order", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ courseId: course.id })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || i18n.t("course.paymentError"));
        }
        return payload.orderId;
      },
      onApprove: async (data) => {
        const token = await state.user.getIdToken(true);
        const response = await fetch("/api/paypal/capture-order", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            orderId: data.orderID,
            courseId: course.id
          })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || i18n.t("course.paymentError"));
        }
        state.access.add(course.id);
        setPaymentMessage(i18n.t("course.paymentSuccess"), "success");
        renderCoursePage();
      },
      onError: (error) => {
        setPaymentMessage(error.message || i18n.t("course.paymentError"), "error");
      }
    }).render(container);
  } catch (error) {
    setPaymentMessage(error.message || i18n.t("course.paymentError"), "error");
  }
}

function loadPayPalScript() {
  if (window.paypal) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const clientId = encodeURIComponent(state.config.paypal.clientId);
    const currency = encodeURIComponent(state.config.paypal.currency || state.catalog.currency || "USD");
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&intent=capture`;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load PayPal Checkout."));
    document.head.appendChild(script);
  });
}

function renderLessonButton(course, lesson, owned, selectedLesson) {
  const copy = localize(lesson);
  const unlocked = isLessonUnlocked(course, lesson, owned);
  const completed = isLessonCompleted(course, lesson);
  const active = selectedLesson && selectedLesson.id === lesson.id ? " is-active" : "";
  const completeClass = completed ? " is-completed" : "";
  const status = completed
    ? i18n.t("lesson.completed")
    : lesson.preview && !owned
      ? i18n.t("course.preview")
      : unlocked
        ? i18n.t("lesson.available")
        : i18n.t("course.locked");

  return `
    <button class="lesson-button${active}${completeClass}" type="button" data-lesson-id="${lesson.id}" ${unlocked ? "" : "disabled"}>
      <span>
        <strong>${escapeHtml(copy.title)}</strong>
        <small>${lesson.duration} - ${status}</small>
      </span>
    </button>
  `;
}

function renderLessonPlayer(course, lesson, owned) {
  if (!lesson) {
    return `<p>${i18n.t("course.selectLesson")}</p>`;
  }

  const copy = localize(lesson);
  const unlocked = isLessonUnlocked(course, lesson, owned);

  if (!unlocked) {
    return `
      <div class="locked-player">
        <p class="eyebrow">${i18n.t("course.locked")}</p>
        <h2>${escapeHtml(copy.title)}</h2>
        <p>${i18n.t("course.lockedLesson")}</p>
      </div>
    `;
  }

  const media = lesson.videoUrl
    ? `<iframe src="${escapeAttribute(lesson.videoUrl)}" title="${escapeAttribute(copy.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>${renderVideoCredit(lesson)}`
    : `<div class="lesson-brief"><span>${i18n.t("course.lessonReady")}</span><p>${i18n.t("course.lessonNote")}</p></div>`;

  return `
    <article>
      <p class="eyebrow">${lesson.preview ? i18n.t("course.preview") : i18n.t("course.start")}</p>
      <h2>${escapeHtml(copy.title)}</h2>
      <p>${escapeHtml(copy.description)}</p>
      ${media}
      ${renderLessonReading(copy.reading)}
      ${renderLessonResources(lesson)}
      ${renderLessonCompletion(course, lesson, owned)}
    </article>
  `;
}

function renderLessonResources(lesson) {
  const resources = getLessonResources(lesson);
  if (!resources.length) {
    return "";
  }

  return `
    <section class="lesson-resources">
      <div class="lesson-section-head">
        <p class="eyebrow">${i18n.t("lesson.links")}</p>
        <h3>${i18n.t("lesson.linksTitle")}</h3>
      </div>
      <div class="resource-list">
        ${resources.map(renderResourceCard).join("")}
      </div>
    </section>
  `;
}

function renderResourceCard(resource) {
  const copy = localize(resource);

  return `
    <article class="resource-card">
      <div>
        <h4>${escapeHtml(resource.name)}</h4>
        <p>${escapeHtml(copy.description || "")}</p>
        ${copy.setup ? `<small><strong>${i18n.t("lesson.setup")}:</strong> ${escapeHtml(copy.setup)}</small>` : ""}
      </div>
      <a class="button button-small" href="${escapeAttribute(resource.url)}" target="_blank" rel="noopener">${i18n.t("lesson.open")}</a>
    </article>
  `;
}

function renderLessonCompletion(course, lesson, owned) {
  const completed = isLessonCompleted(course, lesson);
  const nextLesson = getNextLesson(course, lesson);
  const copy = completed && !owned && nextLesson
    ? i18n.t("lesson.buyToContinue")
    : completed
      ? i18n.t("lesson.nextUnlocked")
    : !owned && nextLesson
      ? i18n.t("lesson.buyToContinue")
      : nextLesson
        ? i18n.t("lesson.completeCopy")
        : i18n.t("lesson.completeLast");

  return `
    <section class="lesson-completion${completed ? " is-complete" : ""}">
      <div>
        <p class="eyebrow">${completed ? i18n.t("lesson.completed") : i18n.t("lesson.progress")}</p>
        <h3>${completed ? i18n.t("lesson.completedTitle") : i18n.t("lesson.completeTitle")}</h3>
        <p>${copy}</p>
      </div>
      <button class="button ${completed ? "button-ghost" : "button-primary"}" type="button" data-complete-lesson-id="${escapeAttribute(lesson.id)}" ${completed ? "disabled" : ""}>
        ${completed ? i18n.t("lesson.completed") : i18n.t("lesson.markComplete")}
      </button>
    </section>
  `;
}

function renderCourseExam(course, owned) {
  if (!course.exam || !Array.isArray(course.exam.questions)) {
    return "";
  }

  const exam = course.exam;
  const copy = localize(exam);
  const ready = owned && areAllLessonsCompleted(course);
  const result = getExamResult(course.id);
  const passed = result && result.passed;

  return `
    <section id="exam" class="site-shell section">
      <div class="exam-panel${passed ? " is-passed" : ""}">
        <div class="exam-head">
          <div>
            <p class="eyebrow">${i18n.t("exam.eyebrow")}</p>
            <h2>${escapeHtml(copy.title)}</h2>
            <p>${escapeHtml(copy.description)}</p>
          </div>
          <div class="exam-score-card">
            <strong>${exam.passingScore}/${exam.questions.length}</strong>
            <span>${i18n.t("exam.passingScore")}</span>
          </div>
        </div>
        ${renderExamBody(course, ready, result)}
      </div>
    </section>
  `;
}

function renderExamBody(course, ready, result) {
  if (!state.access.has(course.id)) {
    return `
      <div class="exam-locked">
        <h3>${i18n.t("exam.lockedTitle")}</h3>
        <p>${i18n.t("exam.buyRequired")}</p>
      </div>
    `;
  }

  if (!ready) {
    return `
      <div class="exam-locked">
        <h3>${i18n.t("exam.lockedTitle")}</h3>
        <p>${i18n.t("exam.completeLessonsFirst")}</p>
      </div>
    `;
  }

  if (result && result.passed) {
    return `
      <div class="exam-result is-passed">
        <strong>${result.score}/${result.questionCount}</strong>
        <div>
          <h3>${i18n.t("exam.passedTitle")}</h3>
          <p>${i18n.t("exam.passedCopy")}</p>
        </div>
      </div>
    `;
  }

  return `
    ${result ? `
      <div class="exam-result is-failed">
        <strong>${result.score}/${result.questionCount}</strong>
        <div>
          <h3>${i18n.t("exam.failedTitle")}</h3>
          <p>${i18n.t("exam.failedCopy")}</p>
        </div>
      </div>
    ` : ""}
    <form class="exam-form" data-exam-form>
      ${course.exam.questions.map((question, index) => renderExamQuestion(question, index)).join("")}
      <div class="exam-actions">
        <p data-exam-message></p>
        <button class="button button-primary" type="submit">${i18n.t("exam.submit")}</button>
      </div>
    </form>
  `;
}

function renderExamQuestion(question, index) {
  const copy = localize(question);

  return `
    <fieldset class="exam-question">
      <legend>
        <span>${String(index + 1).padStart(2, "0")}</span>
        ${escapeHtml(copy.question)}
      </legend>
      <div class="exam-options">
        ${copy.options.map((option, optionIndex) => `
          <label>
            <input type="radio" name="exam-${escapeAttribute(question.id)}" value="${optionIndex}">
            <span>${escapeHtml(option)}</span>
          </label>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function renderVideoCredit(lesson) {
  if (!lesson.videoTitle && !lesson.videoSource) {
    return "";
  }

  const title = lesson.videoTitle || i18n.t("lesson.video");
  const source = lesson.videoSource ? ` - ${escapeHtml(lesson.videoSource)}` : "";
  const watchUrl = getYouTubeWatchUrl(lesson.videoUrl);
  const label = `${i18n.t("lesson.video")}: ${escapeHtml(title)}${source}`;

  return watchUrl
    ? `<p class="lesson-video-credit"><a href="${escapeAttribute(watchUrl)}" target="_blank" rel="noopener">${label}</a></p>`
    : `<p class="lesson-video-credit">${label}</p>`;
}

function getYouTubeWatchUrl(embedUrl) {
  if (!embedUrl) {
    return "";
  }

  const match = String(embedUrl).match(/embed\/([^?&/]+)/);
  return match ? `https://www.youtube.com/watch?v=${encodeURIComponent(match[1])}` : "";
}

function renderLessonReading(reading) {
  if (!reading) {
    return "";
  }

  const steps = Array.isArray(reading.steps)
    ? `<ol>${reading.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
    : "";

  return `
    <section class="lesson-reading">
      <p class="eyebrow">${i18n.t("lesson.reading")}</p>
      ${reading.overview ? `<p>${escapeHtml(reading.overview)}</p>` : ""}
      ${steps ? `<h3>${i18n.t("lesson.steps")}</h3>${steps}` : ""}
      ${reading.practice ? `<h3>${i18n.t("lesson.practice")}</h3><p>${escapeHtml(reading.practice)}</p>` : ""}
      ${reading.takeaway ? `<h3>${i18n.t("lesson.takeaway")}</h3><p>${escapeHtml(reading.takeaway)}</p>` : ""}
    </section>
  `;
}

function getLessonResources(lesson) {
  const library = state.catalog && state.catalog.resources ? state.catalog.resources : {};
  const ids = Array.isArray(lesson.resourceIds) ? lesson.resourceIds : [];

  return ids
    .map((id) => library[id] ? { id, ...library[id] } : null)
    .filter(Boolean);
}

function getResumeLesson(course, owned) {
  if (!course || !Array.isArray(course.lessons)) {
    return null;
  }

  return course.lessons.find((lesson) => {
    return isLessonUnlocked(course, lesson, owned) && !isLessonCompleted(course, lesson);
  }) || course.lessons.find((lesson) => isLessonUnlocked(course, lesson, owned));
}

function getNextLesson(course, lesson) {
  const index = getLessonIndex(course, lesson);
  return index >= 0 ? course.lessons[index + 1] || null : null;
}

function getLessonIndex(course, lesson) {
  if (!course || !lesson || !Array.isArray(course.lessons)) {
    return -1;
  }

  return course.lessons.findIndex((item) => item.id === lesson.id);
}

function isLessonUnlocked(course, lesson, owned) {
  if (!lesson) {
    return false;
  }

  if (lesson.preview && !owned) {
    return true;
  }

  if (!owned) {
    return false;
  }

  const index = getLessonIndex(course, lesson);
  if (index <= 0) {
    return true;
  }

  return course.lessons.slice(0, index).every((previousLesson) => {
    return isLessonCompleted(course, previousLesson);
  });
}

function isLessonCompleted(course, lesson) {
  return getCompletedLessons(course.id).has(lesson.id);
}

function areAllLessonsCompleted(course) {
  return course.lessons.every((lesson) => isLessonCompleted(course, lesson));
}

function getCompletedLessons(courseId) {
  return new Set(state.progress[courseId] || []);
}

async function markLessonComplete(course, lesson) {
  const owned = state.access.has(course.id);
  if (!isLessonUnlocked(course, lesson, owned)) {
    return;
  }

  const completed = getCompletedLessons(course.id);
  completed.add(lesson.id);
  state.progress = {
    ...state.progress,
    [course.id]: [...completed]
  };
  saveLocalProgress();

  const nextLesson = getNextLesson(course, lesson);
  if (nextLesson && isLessonUnlocked(course, nextLesson, owned)) {
    state.selectedLessonId = nextLesson.id;
  }

  renderCoursePage();
  await syncLessonProgress(course.id, lesson.id);
}

async function syncLessonProgress(courseId, lessonId) {
  if (!state.user) {
    return;
  }

  try {
    const token = await state.user.getIdToken();
    const response = await fetch("/api/progress", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ courseId, lessonId })
    });

    if (!response.ok) {
      throw new Error("Progress API unavailable.");
    }
  } catch (error) {
    showNotice("progress", i18n.t("progress.localOnly"));
  }
}

async function submitCourseExam(course, form) {
  const answers = collectExamAnswers(course, form);
  if (!answers) {
    setExamMessage(i18n.t("exam.answerAll"), true);
    return;
  }

  const result = gradeCourseExam(course, answers);
  state.examResults = {
    ...state.examResults,
    [course.id]: result
  };
  saveLocalExamResults();
  renderCoursePage();
  await syncExamResult(course.id, answers);
}

function collectExamAnswers(course, form) {
  const formData = new FormData(form);
  const answers = {};

  for (const question of course.exam.questions) {
    const value = formData.get(`exam-${question.id}`);
    if (value === null) {
      return null;
    }
    answers[question.id] = Number(value);
  }

  return answers;
}

function gradeCourseExam(course, answers) {
  const score = course.exam.questions.reduce((sum, question) => {
    return sum + (answers[question.id] === question.correctOption ? 1 : 0);
  }, 0);
  const questionCount = course.exam.questions.length;
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

async function syncExamResult(courseId, answers) {
  if (!state.user) {
    return;
  }

  try {
    const token = await state.user.getIdToken();
    const response = await fetch("/api/progress", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ courseId, examAnswers: answers })
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Progress API unavailable.");
    }

    if (payload.examResult) {
      state.examResults = {
        ...state.examResults,
        [courseId]: normalizeExamResult(payload.examResult)
      };
      saveLocalExamResults();
      renderCoursePage();
    }
  } catch (error) {
    showNotice("progress", i18n.t("progress.localOnly"));
  }
}

function getExamResult(courseId) {
  return state.examResults[courseId] || null;
}

function readLocalProgress() {
  try {
    return normalizeProgress(JSON.parse(window.localStorage.getItem(getProgressStorageKey()) || "{}"));
  } catch (error) {
    return {};
  }
}

function saveLocalProgress() {
  try {
    window.localStorage.setItem(getProgressStorageKey(), JSON.stringify(state.progress));
  } catch (error) {
    showNotice("progress-storage", i18n.t("progress.localOnly"));
  }
}

function getProgressStorageKey() {
  return `wstudio:lesson-progress:${state.user ? state.user.uid : "guest"}`;
}

function readLocalExamResults() {
  try {
    return normalizeExamResults(JSON.parse(window.localStorage.getItem(getExamStorageKey()) || "{}"));
  } catch (error) {
    return {};
  }
}

function saveLocalExamResults() {
  try {
    window.localStorage.setItem(getExamStorageKey(), JSON.stringify(state.examResults));
  } catch (error) {
    showNotice("exam-storage", i18n.t("progress.localOnly"));
  }
}

function getExamStorageKey() {
  return `wstudio:exam-results:${state.user ? state.user.uid : "guest"}`;
}

function normalizeProgress(progress) {
  if (Array.isArray(progress)) {
    return progress.reduce((normalized, item) => {
      if (item && item.courseId) {
        normalized[item.courseId] = uniqueStrings(item.completedLessonIds || []);
      }
      return normalized;
    }, {});
  }

  return Object.entries(progress || {}).reduce((normalized, [courseId, lessonIds]) => {
    normalized[courseId] = uniqueStrings(lessonIds || []);
    return normalized;
  }, {});
}

function mergeProgress(...sources) {
  return sources.reduce((merged, source) => {
    Object.entries(normalizeProgress(source)).forEach(([courseId, lessonIds]) => {
      merged[courseId] = uniqueStrings([...(merged[courseId] || []), ...lessonIds]);
    });
    return merged;
  }, {});
}

function normalizeExamResults(results) {
  if (Array.isArray(results)) {
    return results.reduce((normalized, result) => {
      const examResult = normalizeExamResult(result);
      if (examResult && result.courseId) {
        normalized[result.courseId] = examResult;
      }
      return normalized;
    }, {});
  }

  return Object.entries(results || {}).reduce((normalized, [courseId, result]) => {
    const examResult = normalizeExamResult(result);
    if (examResult) {
      normalized[courseId] = examResult;
    }
    return normalized;
  }, {});
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
    answers: result.answers || {},
    submittedAt: result.submittedAt || ""
  };
}

function mergeExamResults(...sources) {
  return sources.reduce((merged, source) => {
    Object.entries(normalizeExamResults(source)).forEach(([courseId, result]) => {
      const existing = merged[courseId];
      if (!existing || isNewerExamResult(result, existing)) {
        merged[courseId] = result;
      }
    });
    return merged;
  }, {});
}

function isNewerExamResult(result, existing) {
  const resultTime = Date.parse(result.submittedAt || "") || 0;
  const existingTime = Date.parse(existing.submittedAt || "") || 0;
  return resultTime >= existingTime;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

function renderLoginPage() {
  const target = document.querySelector("[data-login]");
  if (!target) {
    return;
  }

  const userBlock = state.user
    ? `<div class="signed-in-card"><strong>${i18n.t("auth.signedIn")}</strong><span>${escapeHtml(state.user.email || "")}</span><a class="button button-primary" href="student.html">${i18n.t("nav.dashboard")}</a></div>`
    : "";

  target.innerHTML = `
    <section class="auth-page site-shell">
      <div class="auth-copy">
        <p class="eyebrow">Firebase Auth</p>
        <h1>${i18n.t("auth.title")}</h1>
        <p>${i18n.t("auth.copy")}</p>
        ${userBlock}
      </div>
      <form class="auth-card" data-auth-form>
        <label>
          ${i18n.t("auth.name")}
          <input type="text" name="name" autocomplete="name">
        </label>
        <label>
          ${i18n.t("auth.email")}
          <input type="email" name="email" autocomplete="email" required>
        </label>
        <label>
          ${i18n.t("auth.password")}
          <input type="password" name="password" autocomplete="current-password" required minlength="6">
        </label>
        <div class="auth-buttons">
          <button class="button button-primary" type="submit" data-auth-mode="login">${i18n.t("auth.login")}</button>
          <button class="button button-secondary" type="submit" data-auth-mode="register">${i18n.t("auth.register")}</button>
        </div>
        <button class="button button-google" type="button" data-auth-mode="google">${i18n.t("auth.google")}</button>
        <button class="text-button" type="button" data-auth-mode="reset">${i18n.t("auth.reset")}</button>
        <div class="form-message" data-form-message>${hasFirebaseConfig() ? "" : i18n.t("auth.configMissing")}</div>
      </form>
    </section>
  `;

  const form = target.querySelector("[data-auth-form]");
  form.addEventListener("submit", handleAuthSubmit);

  target.querySelector("[data-auth-mode='google']").addEventListener("click", handleGoogleAuth);
  target.querySelector("[data-auth-mode='reset']").addEventListener("click", handleResetPassword);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const mode = submitter && submitter.dataset.authMode === "register" ? "register" : "login";
  await handleEmailAuth(event, mode);
}

async function handleEmailAuth(event, mode) {
  if (event) {
    event.preventDefault();
  }

  if (!state.firebase || !state.firebaseFns) {
    setFormMessage(i18n.t("auth.configMissing"), true);
    return;
  }

  const form = getAuthForm(event);
  if (!form) {
    return;
  }

  const credentials = getValidatedAuthCredentials(form);
  if (!credentials) {
    return;
  }

  const data = new FormData(form);
  const email = credentials.email;
  const password = credentials.password;
  const name = String(data.get("name") || "").trim();

  try {
    if (mode === "register") {
      const credential = await state.firebaseFns.createUserWithEmailAndPassword(state.firebase.auth, email, password);
      if (name) {
        await state.firebaseFns.updateProfile(credential.user, { displayName: name });
      }
    } else {
      await state.firebaseFns.signInWithEmailAndPassword(state.firebase.auth, email, password);
    }
    goToNext();
  } catch (error) {
    setFormMessage(formatAuthError(error), true);
  }
}

function getAuthForm(event) {
  if (event && event.currentTarget && event.currentTarget.matches("[data-auth-form]")) {
    return event.currentTarget;
  }

  return document.querySelector("[data-auth-form]");
}

function getValidatedAuthCredentials(form) {
  const emailInput = form.elements.email;
  const passwordInput = form.elements.password;
  const email = String(emailInput && emailInput.value || "").trim().toLowerCase();
  const password = String(passwordInput && passwordInput.value || "");

  if (emailInput) {
    emailInput.value = email;
    emailInput.setCustomValidity("");
  }

  if (passwordInput) {
    passwordInput.setCustomValidity("");
  }

  if (!isValidEmail(email)) {
    showInputError(emailInput, i18n.t("auth.invalidEmail"));
    return null;
  }

  if (password.length < 6) {
    showInputError(passwordInput, i18n.t("auth.passwordLength"));
    return null;
  }

  setFormMessage("", false);
  return { email, password };
}

function getValidatedAuthEmail(form) {
  const emailInput = form.elements.email;
  const email = String(emailInput && emailInput.value || "").trim().toLowerCase();

  if (emailInput) {
    emailInput.value = email;
    emailInput.setCustomValidity("");
  }

  if (!isValidEmail(email)) {
    showInputError(emailInput, i18n.t("auth.invalidEmail"));
    return "";
  }

  setFormMessage("", false);
  return email;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showInputError(input, message) {
  setFormMessage(message, true);

  if (!input) {
    return;
  }

  input.setCustomValidity(message);
  input.reportValidity();
  input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
}

async function handleGoogleAuth() {
  if (!state.firebase || !state.firebaseFns) {
    setFormMessage(i18n.t("auth.configMissing"), true);
    return;
  }

  try {
    const provider = new state.firebaseFns.GoogleAuthProvider();
    if (shouldUseAuthRedirect() && typeof state.firebaseFns.signInWithRedirect === "function") {
      await state.firebaseFns.signInWithRedirect(state.firebase.auth, provider);
      return;
    }

    await state.firebaseFns.signInWithPopup(state.firebase.auth, provider);
    goToNext();
  } catch (error) {
    setFormMessage(formatAuthError(error), true);
  }
}

async function handleResetPassword() {
  if (!state.firebase || !state.firebaseFns) {
    setFormMessage(i18n.t("auth.configMissing"), true);
    return;
  }

  const form = getAuthForm();
  if (!form) {
    return;
  }

  const email = getValidatedAuthEmail(form);
  if (!email) {
    return;
  }

  try {
    await state.firebaseFns.sendPasswordResetEmail(state.firebase.auth, email);
    setFormMessage(i18n.t("auth.checkEmail"), false);
  } catch (error) {
    setFormMessage(formatAuthError(error), true);
  }
}

function shouldUseAuthRedirect() {
  const mobileViewport = window.matchMedia && window.matchMedia("(max-width: 700px)").matches;
  const mobileAgent = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  return mobileViewport || mobileAgent;
}

function formatAuthError(error) {
  const code = error && error.code;

  if (code === "auth/unauthorized-domain") {
    return i18n.t("auth.googleUnauthorizedDomain");
  }

  if (code === "auth/operation-not-allowed") {
    return i18n.t("auth.googleProviderDisabled");
  }

  if (code === "auth/invalid-email" || code === "auth/missing-email") {
    return i18n.t("auth.invalidEmail");
  }

  if (code === "auth/email-already-in-use") {
    return i18n.t("auth.emailInUse");
  }

  if (code === "auth/weak-password" || code === "auth/missing-password") {
    return i18n.t("auth.passwordLength");
  }

  if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
    return i18n.t("auth.invalidCredentials");
  }

  if (code === "auth/too-many-requests") {
    return i18n.t("auth.tooManyRequests");
  }

  if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
    return i18n.t("auth.popupBlocked");
  }

  return (error && error.message) || String(error);
}

function goToNext() {
  const next = new URLSearchParams(window.location.search).get("next");
  window.location.href = next || "student.html";
}

async function signOut() {
  if (state.firebase && state.firebaseFns) {
    await state.firebaseFns.signOut(state.firebase.auth);
  }
  window.location.href = "index.html";
}

function renderDashboardPage() {
  const target = document.querySelector("[data-dashboard]");
  if (!target) {
    return;
  }

  if (!state.user) {
    target.innerHTML = `
      <section class="page-hero site-shell">
        <p class="eyebrow">Firebase Auth</p>
        <h1>${i18n.t("dashboard.title")}</h1>
        <p>${i18n.t("auth.signedOut")}</p>
        <a class="button button-primary" href="login.html?next=student.html">${i18n.t("nav.login")}</a>
      </section>
    `;
    return;
  }

  const ownedCourses = getCourses().filter((course) => state.access.has(course.id));
  const ownedHtml = ownedCourses.length
    ? `<div class="course-grid">${ownedCourses.map(renderDashboardCard).join("")}</div>`
    : `<div class="empty-state"><p>${i18n.t("dashboard.empty")}</p><a class="button button-primary" href="courses.html">${i18n.t("dashboard.browse")}</a></div>`;

  target.innerHTML = `
    <section class="page-hero site-shell">
      <p class="eyebrow">${escapeHtml(state.user.email || "")}</p>
      <h1>${i18n.t("dashboard.title")}</h1>
      <p>${i18n.t("dashboard.copy")}</p>
    </section>
    ${renderFinalCertificateSection()}
    <section class="site-shell section dashboard-courses-section">
      ${ownedHtml}
    </section>
  `;

  bindDashboardActions(target);
}

function renderFinalCertificateSection() {
  const eligibility = getCertificateEligibility();
  const certificate = state.certificate || buildLocalCertificate(eligibility);

  if (!eligibility.eligible) {
    return `
      <section class="site-shell section certificate-section">
        <div class="certificate-gate">
          <div>
            <p class="eyebrow">${i18n.t("certificate.eyebrow")}</p>
            <h2>${i18n.t("certificate.lockedTitle")}</h2>
            <p>${i18n.t("certificate.lockedCopy")}</p>
          </div>
          <div class="certificate-progress">
            <strong>${eligibility.completedCount}/${eligibility.courseCount}</strong>
            <span>${i18n.t("certificate.completedCourses")}</span>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="site-shell section certificate-section">
      <article class="certificate-panel">
        <div class="certificate-top">
          <img src="images/w-studio-logo.png" alt="W Studio">
          <div>
            <span>${i18n.t("certificate.validLabel")}</span>
            <strong>${escapeHtml(certificate.certificateId || i18n.t("certificate.pendingId"))}</strong>
          </div>
        </div>
        <div class="certificate-body">
          <p class="eyebrow">${i18n.t("certificate.eyebrow")}</p>
          <h2>${i18n.t("certificate.title")}</h2>
          <p>${i18n.t("certificate.certifies")}</p>
          <h3>${escapeHtml(certificate.studentName || getStudentCertificateName())}</h3>
          <p>${i18n.t("certificate.program")}</p>
          <strong>${i18n.t("certificate.programName")}</strong>
        </div>
        <dl class="certificate-meta">
          <div><dt>${i18n.t("certificate.courseCount")}</dt><dd>${eligibility.courseCount}</dd></div>
          <div><dt>${i18n.t("certificate.average")}</dt><dd>${formatPercent(certificate.averageScore || eligibility.averageScore)}</dd></div>
          <div><dt>${i18n.t("certificate.minimum")}</dt><dd>70%</dd></div>
          <div><dt>${i18n.t("certificate.issuedAt")}</dt><dd>${formatCertificateDate(certificate.issuedAt)}</dd></div>
        </dl>
        <p class="certificate-verification">
          ${i18n.t("certificate.verify")} ${certificate.verificationUrl ? `<a href="${escapeAttribute(certificate.verificationUrl)}" target="_blank" rel="noopener">${escapeHtml(certificate.verificationUrl)}</a>` : i18n.t("certificate.pendingVerification")}
        </p>
        <div class="certificate-actions">
          ${state.certificate ? "" : `<button class="button button-primary" type="button" data-issue-certificate>${i18n.t("certificate.issue")}</button>`}
          <button class="button button-secondary" type="button" data-print-certificate>${i18n.t("certificate.print")}</button>
        </div>
      </article>
    </section>
  `;
}

function bindDashboardActions(target) {
  const issueButton = target.querySelector("[data-issue-certificate]");
  if (issueButton) {
    issueButton.addEventListener("click", issueFinalCertificate);
  }

  const printButton = target.querySelector("[data-print-certificate]");
  if (printButton) {
    printButton.addEventListener("click", printFinalCertificate);
  }
}

function getCertificateEligibility() {
  const courses = getCourses();
  const completedCourses = courses.filter((course) => {
    const result = getExamResult(course.id);
    return areAllLessonsCompleted(course)
      && result
      && result.passed
      && result.score >= getCoursePassingScore(course);
  });
  const averageScore = completedCourses.length
    ? completedCourses.reduce((sum, course) => {
      const result = getExamResult(course.id);
      return sum + (result.questionCount ? (result.score / result.questionCount) * 100 : 0);
    }, 0) / completedCourses.length
    : 0;

  return {
    eligible: completedCourses.length === courses.length,
    completedCount: completedCourses.length,
    courseCount: courses.length,
    averageScore
  };
}

function getCoursePassingScore(course) {
  if (course.exam && course.exam.passingScore) {
    return course.exam.passingScore;
  }

  return Math.ceil(((course.exam && course.exam.questions || []).length || 10) * 0.7);
}

function buildLocalCertificate(eligibility) {
  return {
    certificateId: "",
    studentName: getStudentCertificateName(),
    averageScore: eligibility.averageScore,
    issuedAt: "",
    verificationUrl: ""
  };
}

function getStudentCertificateName() {
  return state.user && (state.user.displayName || state.user.email)
    ? state.user.displayName || state.user.email
    : "W Studio Student";
}

async function issueFinalCertificate() {
  if (!state.user) {
    return;
  }

  try {
    const token = await state.user.getIdToken(true);
    const response = await fetch("/api/certificate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || i18n.t("certificate.issueError"));
    }

    state.certificate = payload.certificate;
    renderDashboardPage();
  } catch (error) {
    showNotice("certificate", error.message || i18n.t("certificate.issueError"));
  }
}

function printFinalCertificate() {
  document.body.classList.add("print-certificate");
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("print-certificate");
  }, { once: true });
  window.print();
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 10) / 10}%`;
}

function formatCertificateDate(value) {
  if (!value) {
    return i18n.t("certificate.pendingIssue");
  }

  return new Intl.DateTimeFormat(i18n.language === "de" ? "de-DE" : i18n.language === "es" ? "es-CR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
}

function renderDashboardCard(course) {
  const copy = localize(course);
  const completedCount = course.lessons.filter((lesson) => isLessonCompleted(course, lesson)).length;
  const examResult = getExamResult(course.id);
  const progressLabel = examResult && examResult.passed
    ? i18n.t("dashboard.examPassed")
    : `${completedCount}/${course.lessons.length} ${i18n.t("dashboard.completed")}`;
  return `
    <article class="course-card">
      <a class="course-image course-image-photo" href="course.html?id=${encodeURIComponent(course.id)}" style="--course-accent: ${course.accent}">
        ${renderCoursePicture(course)}
      </a>
      <div class="course-card-body">
        <p class="eyebrow">${i18n.t("card.owned")}</p>
        <h3>${escapeHtml(copy.title)}</h3>
        <p>${escapeHtml(copy.summary)}</p>
        <div class="card-bottom">
          <span>${escapeHtml(progressLabel)}</span>
          <a class="button button-small" href="course.html?id=${encodeURIComponent(course.id)}">${i18n.t("dashboard.continue")}</a>
        </div>
      </div>
    </article>
  `;
}

function getCurrentCourse() {
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get("id") || params.get("course") || getCourses()[0].id;
  return state.catalog.courses.find((course) => course.id === courseId);
}

function getCourses() {
  return [...state.catalog.courses].sort((a, b) => {
    return (a.order || 0) - (b.order || 0);
  });
}

function getPhaseLabel(phase) {
  return i18n.t(`phase.${phase || "foundation"}`);
}

function renderRoadmap() {
  const courses = getCourses();
  const grouped = new Map();

  phaseOrder.forEach((phase) => grouped.set(phase, []));
  courses.forEach((course) => {
    const phase = course.phase || "foundation";
    if (!grouped.has(phase)) {
      grouped.set(phase, []);
    }
    grouped.get(phase).push(course);
  });

  return `
    <div class="roadmap-grid">
      ${[...grouped.entries()]
        .filter(([, phaseCourses]) => phaseCourses.length)
        .map(([phase, phaseCourses], index) => renderRoadmapPhase(phase, phaseCourses, index + 1))
        .join("")}
    </div>
  `;
}

function renderRoadmapPhase(phase, courses, index) {
  return `
    <article class="roadmap-card">
      <span class="roadmap-number">${String(index).padStart(2, "0")}</span>
      <h3>${getPhaseLabel(phase)}</h3>
      <p>${i18n.t(`phase.${phase}Copy`)}</p>
      <ol>
        ${courses.map((course) => `<li><a href="course.html?id=${encodeURIComponent(course.id)}">${escapeHtml(localize(course).title)}</a></li>`).join("")}
      </ol>
    </article>
  `;
}

function localize(item) {
  const fallback = item.translations.en || {};
  const localized = item.translations[i18n.language] || {};
  return { ...fallback, ...localized };
}

function updateRuntimeSeo() {
  if (page !== "course" || !state.catalog) {
    return;
  }

  const course = getCurrentCourse();
  if (!course) {
    return;
  }

  const copy = course.translations.en || localize(course);
  const title = `${copy.title} | W Studio Learn`;
  const description = copy.summary || copy.subtitle || "Preview a W Studio Learn course and unlock access with secure student login and PayPal checkout.";
  const url = `${siteUrl}/course?id=${encodeURIComponent(course.id)}`;
  const imageAlt = `${copy.title} course preview from W Studio Learn`;

  document.title = title;
  setMeta("name", "description", description);
  setCanonical(url);
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", url);
  setMeta("property", "og:image", socialImageUrl);
  setMeta("property", "og:image:secure_url", socialImageUrl);
  setMeta("property", "og:image:alt", imageAlt);
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:image", socialImageUrl);
  setMeta("name", "twitter:image:alt", imageAlt);
  setCourseStructuredData(course, copy, url);
}

function setMeta(attribute, key, content) {
  let element = document.head.querySelector(`meta[${attribute}="${key}"]`);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function setCanonical(url) {
  let element = document.head.querySelector('link[rel="canonical"]');

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", "canonical");
    document.head.appendChild(element);
  }

  element.setAttribute("href", url);
}

function setCourseStructuredData(course, copy, url) {
  const scriptId = "runtime-course-schema";
  let script = document.getElementById(scriptId);

  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = scriptId;
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Course",
    name: copy.title,
    description: copy.summary || copy.subtitle,
    url,
    image: socialImageUrl,
    provider: {
      "@type": "Organization",
      name: "W Studio Learn",
      url: siteUrl
    },
    offers: {
      "@type": "Offer",
      url,
      price: course.price,
      priceCurrency: state.catalog.currency || "USD",
      availability: "https://schema.org/InStock",
      category: "Online course"
    },
    inLanguage: ["en", "de", "es"]
  });
}

function formatPrice(course) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: state.catalog.currency || "USD"
  }).format(Number(course.price));
}

function renderStep(number, title, copy) {
  return `
    <article class="step-card">
      <span>${number}</span>
      <h3>${title}</h3>
      <p>${copy}</p>
    </article>
  `;
}

function setStatus(message) {
  document.querySelectorAll("[data-status]").forEach((element) => {
    element.textContent = message;
  });
}

function showNotice(id, message) {
  const target = document.querySelector("[data-notices]");
  if (!target || target.querySelector(`[data-notice-id="${id}"]`)) {
    return;
  }

  const notice = document.createElement("div");
  notice.className = "notice";
  notice.dataset.noticeId = id;
  notice.textContent = message;
  target.appendChild(notice);
}

function setFormMessage(message, isError) {
  const target = document.querySelector("[data-form-message]");
  if (!target) {
    return;
  }

  target.textContent = message;
  target.classList.toggle("is-error", Boolean(isError));
}

function setPaymentMessage(message, status) {
  const target = document.querySelector("[data-payment-message]");
  if (!target) {
    return;
  }

  target.textContent = message;
  target.className = `payment-message is-${status}`;
}

function setExamMessage(message, isError) {
  const target = document.querySelector("[data-exam-message]");
  if (!target) {
    return;
  }

  target.textContent = message;
  target.classList.toggle("is-error", Boolean(isError));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
