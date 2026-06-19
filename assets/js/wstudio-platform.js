const state = {
  access: new Set(),
  authReady: false,
  catalog: null,
  config: null,
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
      await loadStudentAccess();
      await loadStudentProgress();
    } else {
      state.access = new Set();
      state.progress = readLocalProgress();
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
    saveLocalProgress();
  } catch (error) {
    showNotice("progress", i18n.t("progress.localOnly"));
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

  const heroCourse = getCourses().find((course) => course.id === "canva-for-entrepreneurs") || getCourses()[0];

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
            ${renderCoursePicture(heroCourse)}
          </div>
          <img src="images/w-studio-logo.png" alt="" class="hero-logo">
          <div class="hero-stat"><strong>${state.catalog.courses.length}</strong><span>${i18n.t("hero.statCourses")}</span></div>
          <div class="hero-stat"><strong>EN / DE / ES</strong><span>${i18n.t("hero.statLanguages")}</span></div>
          <div class="hero-stat"><strong>1:1</strong><span>${i18n.t("hero.statCheckout")}</span></div>
        </div>
      </div>
    </section>
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
    <section class="site-shell section">
      ${ownedHtml}
    </section>
  `;
}

function renderDashboardCard(course) {
  const copy = localize(course);
  const completedCount = course.lessons.filter((lesson) => isLessonCompleted(course, lesson)).length;
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
          <span>${completedCount}/${course.lessons.length} ${i18n.t("dashboard.completed")}</span>
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
