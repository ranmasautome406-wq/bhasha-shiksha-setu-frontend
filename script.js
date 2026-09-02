// Bhasha Shiksha Setu - Frontend API configuration
// Replace the URL below after deploying the separate backend.
const API_BASE_URL =
  localStorage.getItem("bss_api_url") ||
  "https://YOUR-BACKEND-URL.onrender.com";

/* =========================================================
   Bhasha Shiksha Setu — shared frontend logic
   API client, auth, dynamic content, AI Assistant widget,
   voice input (Web Speech API) and read-aloud (Speech Synthesis)
   ========================================================= */
"use strict";

/* ---------------- Tiny helpers ---------------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function initials(name = "?") {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function toast(message, type = "ok", ms = 3200) {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = ".4s"; setTimeout(() => t.remove(), 400); }, ms);
}

/* Modal helpers */
function openModal(id) { const m = $("#" + id); if (m) m.classList.add("open"); }
function closeModal(id) { const m = $("#" + id); if (m) m.classList.remove("open"); }
document.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("overlay")) e.target.classList.remove("open");
});

/* ---------------- API client ---------------- */
const API_ROOT = (window.BSS_CONFIG && window.BSS_CONFIG.API_BASE) || localStorage.getItem("bss_api_url") || API_BASE_URL;
const API_BASE = API_ROOT.replace(/\/$/, "") + "/api";
const GUEST_KEY = "bss_guest_id";

function guestId() {
  let id = localStorage.getItem(GUEST_KEY);
  if (!id) { id = "g" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem(GUEST_KEY, id); }
  return id;
}
function authToken() { return localStorage.getItem("bss_token"); }
function currentUser() {
  try { return JSON.parse(localStorage.getItem("bss_user") || "null"); } catch { return null; }
}
function setAuth(token, user) {
  if (token) localStorage.setItem("bss_token", token);
  localStorage.setItem("bss_user", JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem("bss_token");
  localStorage.removeItem("bss_user");
}

async function api(path, options = {}) {
  const opts = { ...options };
  opts.headers = { "X-Guest-Id": guestId(), ...(opts.headers || {}) };
  if (!(opts.body instanceof FormData)) opts.headers["Content-Type"] = "application/json";
  const token = authToken();
  if (token) opts.headers["Authorization"] = "Bearer " + token;
  if (opts.body && typeof opts.body !== "string") opts.body = JSON.stringify(opts.body);
  try {
    const res = await fetch(API_BASE + path, opts);
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok || (data && data.success === false)) {
      const msg = (data && data.message) || "Something went wrong. Please try again.";
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data ? data.data : null;
  } catch (e) {
    if (e.status === 401 && authToken()) {
      // session expired — clean up quietly
      clearAuth();
      updateNavAuth();
    }
    throw e;
  }
}

/* ---------------- Auth (login / register modals) ---------------- */
window.BSS_AUTH = {
  async login(identifier, password) {
    const data = await api("/auth/login", { method: "POST", body: { identifier, password } });
    setAuth(data.token, data.user);
    if (data.user?.language_preference) localStorage.setItem("bss_lang", data.user.language_preference);
    updateNavAuth();
    return data.user;
  },
  async register(payload) {
    const data = await api("/auth/register", { method: "POST", body: payload });
    setAuth(data.token, data.user);
    if (data.user?.language_preference) localStorage.setItem("bss_lang", data.user.language_preference);
    updateNavAuth();
    return data.user;
  },
  logout() {
    api("/auth/logout", { method: "POST" }).catch(() => {});
    clearAuth();
    updateNavAuth();
    toast("You have been logged out.");
  },
  logoutAll: clearAuth,
};

function updateNavAuth() {
  const user = currentUser();
  $$("[data-auth=in]").forEach(el => el.classList.toggle("hide", !user));
  $$("[data-auth=out]").forEach(el => el.classList.toggle("hide", !!user));
  const nameEl = $("#navUserName"), av = $("#navUserAvatar");
  if (nameEl) nameEl.textContent = user ? user.name : "";
  if (av) av.textContent = user ? initials(user.name) : "?";
  const logoutLinks = $$("[data-logout]");
  logoutLinks.forEach(el => {
    el.onclick = (e) => { e.preventDefault(); BSS_AUTH.logout(); };
  });
}

function bindLoginForm() {
  const form = $("#loginForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#loginSubmit");
    btn.disabled = true; btn.textContent = "Signing in…";
    try {
      const user = await BSS_AUTH.login($("#loginId").value.trim(), $("#loginPassword").value);
      const selectedLang = $("#loginLang")?.value || user.language_preference || "English";
      localStorage.setItem("bss_lang", selectedLang);
      if (user.role === "student") {
        try { await api("/student/language", { method: "PUT", body: { language_preference: selectedLang } }); user.language_preference = selectedLang; setAuth(authToken(), user); } catch (_) {}
      }
      closeModal("loginModal");
      toast(`Welcome back, ${user.name}! 🎉`);
      // Role-based redirect (if on a public page)
      const onPage = document.body.dataset.page;
      if (!onPage || onPage === "home") {
        const target = user.role === "admin" ? "/admin"
          : user.role === "teacher" ? "teacher.html"
          : user.role === "tutor" ? "tutor.html" : "student.html";
        if (target.startsWith("/")) { window.location.href = target; }
        else if (window.location.pathname.endsWith("index.html") || window.location.pathname === "/") window.location.href = target;
        else location.reload();
      } else {
        // Portal page (student/teacher/tutor): reload so the logged-in UI renders
        window.location.reload();
      }
    } catch (err) {
      toast(err.message, "err");
    } finally {
      btn.disabled = false; btn.textContent = "Login";
    }
  });
}

function bindRegisterForm() {
  const form = $("#registerForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#registerSubmit");
    btn.disabled = true; btn.textContent = "Creating account…";
    try {
      const user = await BSS_AUTH.register({
        name: $("#regName").value.trim(),
        email: $("#regEmail").value.trim(),
        password: $("#regPassword").value,
        language_preference: $("#regLang") ? $("#regLang").value : "English",
      });
      closeModal("registerModal");
      toast(`Welcome, ${user.name}! Your account is ready. 🎉`);
      if (document.body.dataset.page === "student") location.reload();
      else window.location.href = "student.html";
    } catch (err) {
      toast(err.message, "err");
    } finally {
      btn.disabled = false; btn.textContent = "Create Account";
    }
  });
}

/* ---------------- Site config + CMS text ---------------- */
const BSS_STATE = {
  config: null,
  languages: ["English", "Hindi", "Marathi", "Gujarati", "Bengali", "Tamil", "Telugu"],
  aiEnabled: true,
  textContent: {},
};

async function loadSiteConfig() {
  try {
    const cfg = await api("/config");
    BSS_STATE.config = cfg;
    if (cfg.languages && cfg.languages.length) {
      const basic = ["English", "Hindi", "Marathi", "Gujarati", "Bengali", "Tamil", "Telugu"];
      const active = cfg.languages.filter(l => l.active).map(l => l.name);
      BSS_STATE.languages = basic.filter(l => active.includes(l));
      if (BSS_STATE.languages.length < 7) BSS_STATE.languages = basic;
    }
    BSS_STATE.aiEnabled = cfg.ai_enabled !== false;
    populateLanguageSelects();
    return cfg;
  } catch { /* offline / backend down — keep defaults */ }
}

function populateLanguageSelects() {
  $$("select[data-langs], .lang-select").forEach(sel => {
    const saved = localStorage.getItem("bss_lang") || "English";
    let current = sel.value || saved;

    // Never leave the selector blank when the saved language is unavailable.
    if (!BSS_STATE.languages.includes(current)) {
      current = BSS_STATE.languages.includes(saved)
        ? saved
        : (BSS_STATE.languages[0] || "English");
    }

    sel.innerHTML = BSS_STATE.languages.map(lang =>
      `<option value="${escapeHtml(lang)}">${escapeHtml(lang)}</option>`
    ).join("");

    sel.value = current;
  });
}

async function loadTextContent() {
  try {
    const data = await api("/content");
    BSS_STATE.textContent = data || {};
    applyTextContent();
  } catch { /* defaults remain in HTML */ }
}

function applyTextContent() {
  const t = BSS_STATE.textContent;
  if (!t) return;
  $$("[data-content]").forEach(el => {
    const key = el.dataset.content;
    if (t[key] !== undefined && t[key] !== "") el.textContent = t[key];
  });
}

async function loadAnnouncements() {
  const host = $("#announcements");
  if (!host) return;
  try {
    const items = await api("/content/announcements");
    if (!items || !items.length) { host.classList.add("hide"); return; }
    host.classList.remove("hide");
    host.innerHTML = '<div class="container">' + items.map(a => `
      <div class="announce-item" style="margin-bottom:6px">
        <b>📢 ${escapeHtml(a.title)}:</b> ${escapeHtml(a.message)}
        ${a.image ? `<a href="${escapeHtml(a.image)}" target="_blank" rel="noopener" style="margin-left:6px">🖼</a>` : ""}
      </div>`).join("") + "</div>";
  } catch { host.classList.add("hide"); }
}

async function loadFAQs() {
  const host = $("#faqList");
  if (!host) return;
  try {
    const faqs = await api("/content/faqs");
    if (!faqs || !faqs.length) { host.closest("section")?.classList.add("hide"); return; }
    host.innerHTML = faqs.map((f, i) => `
      <div class="faq-item ${i === 0 ? "open" : ""}">
        <div class="faq-q">${escapeHtml(f.q || f.question)}</div>
        <div class="faq-a">${escapeHtml(f.a || f.answer)}</div>
      </div>`).join("");
    $$(".faq-q", host).forEach(q => q.addEventListener("click", () => q.parentElement.classList.toggle("open")));
  } catch { host.closest("section")?.classList.add("hide"); }
}

/* ---------------- Lessons (public) ---------------- */
async function fetchLessons(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  const qs = params.toString();
  return api("/lessons" + (qs ? "?" + qs : ""));
}

function lessonCard(l) {
  const thumb = l.thumbnail
    ? `<img src="${escapeHtml(l.thumbnail)}" alt="" loading="lazy">`
    : "📘";
  return `
  <div class="card lesson-card" data-lesson-id="${l.id}">
    <div class="lesson-thumb">${thumb}</div>
    <div class="lesson-meta">
      <span class="chip subj">${escapeHtml(l.subject)}</span>
      <span class="chip lang">🗣 ${escapeHtml(l.language)}</span>
      ${l.grade ? `<span class="chip grade">Class ${escapeHtml(l.grade)}</span>` : ""}
      <span class="chip ${l.status === "published" ? "pub" : "draft"}">${escapeHtml(l.status)}</span>
    </div>
    <h3>${escapeHtml(l.title)}</h3>
    <p>${escapeHtml((l.description || "").slice(0, 120))}${(l.description || "").length > 120 ? "…" : ""}</p>
    <button class="btn btn-primary btn-sm" onclick="BSS_LESSONS.open(${l.id})">Open Lesson →</button>
  </div>`;
}

window.BSS_LESSONS = {
  async render(hostSel = "#lessonGrid", filters = {}) {
    const host = $(hostSel);
    if (!host) return;
    host.innerHTML = '<div class="skeleton" style="height:190px"></div>'.repeat(3);
    try {
      const lessons = await fetchLessons(filters);
      if (!lessons.length) {
        host.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">📚</div>
          No lessons yet — check back soon!</div>`;
        return;
      }
      host.innerHTML = lessons.map(lessonCard).join("");
    } catch (e) {
      host.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">⚠️</div>${escapeHtml(e.message)}</div>`;
    }
  },
  async open(id) {
    const host = $("#lessonModalBody");
    if (host) {
      host.innerHTML = '<div class="skeleton" style="height:200px"></div>';
      openModal("lessonModal");
      try {
        const l = await api(`/lessons/${id}`);
        host.innerHTML = `
          <div class="reader">
            <div class="card lesson-thumb">${l.thumbnail ? `<img src="${escapeHtml(l.thumbnail)}">` : "📘"}</div>
            <div class="lesson-meta" style="margin:16px 0">
              <span class="chip subj">${escapeHtml(l.subject)}</span>
              <span class="chip lang">🗣 ${escapeHtml(l.language)}</span>
              ${l.grade ? `<span class="chip grade">Class ${escapeHtml(l.grade)}</span>` : ""}
              <span class="chip pub">${l.views} views</span>
            </div>
            <h2>${escapeHtml(l.title)}</h2>
            <p style="color:var(--muted);margin:10px 0 18px">${escapeHtml(l.description)}</p>
            ${(l.content_items || []).map(c => renderContentBlock(c)).join("")}

            <div class="card" style="margin-top:20px">
              <h3>🌐 Translate this lesson</h3>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
                <select id="lessonTargetLang" class="lang-select" data-langs></select>
                <button class="btn btn-primary btn-sm"
                  onclick="BSS_LESSONS.translateCurrent(${l.id})">
                  Translate
                </button>
                <button id="lessonTranslationListen"
                  class="btn btn-outline btn-sm"
                  data-text=""
                  data-language=""
                  onclick="BSS_VOICE.listen(this)">
                  🔊 Listen
                </button>
              </div>
              <textarea id="lessonTranslationText"
                rows="7"
                style="width:100%;padding:12px;resize:vertical"
                readonly
                placeholder="Your translated lesson will appear here..."></textarea>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:24px">
              <button class="btn btn-accent" onclick="BSS_VOICE.listen(this)" data-text="${escapeHtml(l.title + ". " + l.description)}" data-language="${escapeHtml(localStorage.getItem("bss_lang") || "English")}">🔊 Hear Explanation</button>
              <button class="btn btn-primary" onclick="closeModal('lessonModal');BSS_AI.open('lesson', ${l.id})">🤖 Ask AI about this lesson</button>
            </div>
          </div>`;

        populateLanguageSelects();
        bindLanguagePreference();
        const lessonLang = $("#lessonTargetLang");
        if (lessonLang) {
          lessonLang.value =
            localStorage.getItem("bss_lang") || "Marathi";
        }
      } catch (e) { host.innerHTML = `<div class="empty"><div class="big">⚠️</div>${escapeHtml(e.message)}</div>`; }
    }
  },

  async translateCurrent(id) {
    const target = $("#lessonTargetLang")?.value ||
      localStorage.getItem("bss_lang") || "Marathi";
    const output = $("#lessonTranslationText");

    if (!output) return;

    try {
      output.value = "Translating…";

      const lesson = await api(`/lessons/${id}`);
      const source = lesson.language || "English";

      const parts = [
        lesson.title,
        lesson.description,
        ...(lesson.content_items || [])
          .filter(c => c.type === "text")
          .map(c => `${c.title || ""}\n${c.content || ""}`)
      ].filter(Boolean);

      const result = await api("/translate", {
        method: "POST",
        body: {
          text: parts.join("\n\n"),
          source_language: source,
          target_language: target
        }
      });

      output.value =
        result?.translated_text ||
        result?.translation ||
        "Translation unavailable.";

      const listen = $("#lessonTranslationListen");
      if (listen) {
        listen.dataset.text = output.value;
        listen.dataset.language = target;
      }
    } catch (e) {
      output.value = "⚠️ " + e.message;
    }
  },
};

function renderContentBlock(c) {
  if (c.type === "text") return `<div class="reader-block"><h4>${escapeHtml(c.title || "")}</h4><p>${escapeHtml(c.content)}</p></div>`;
  if (c.type === "image") return `<div class="reader-block"><h4>${escapeHtml(c.title || "")}</h4><img src="${escapeHtml(c.url)}" alt="${escapeHtml(c.title)}"></div>`;
  if (c.type === "video") {
    const vid = c.url || "";
    const yt = vid.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/);
    const src = yt ? `https://www.youtube.com/embed/${yt[1]}` : vid;
    return `<div class="reader-block"><h4>${escapeHtml(c.title || "Video")}</h4>
      <div class="video-frame"><iframe src="${escapeHtml(src)}" allowfullscreen loading="lazy"></iframe></div></div>`;
  }
  if (c.type === "document") return `<div class="reader-block"><h4>📄 ${escapeHtml(c.title || "Document")}</h4>
    <a class="btn btn-outline btn-sm" href="${escapeHtml(c.url)}" target="_blank" rel="noopener">Open document</a></div>`;
  return "";
}

/* ---------------- Voice: read aloud (browser Speech Synthesis) ---------------- */
window.BSS_VOICE = {
  supported: ("speechSynthesis" in window),
  _utter: null,
  _paused: false,
  voiceFor(langName) {
    const codes = { English: "en", Marathi: "mr-IN", Hindi: "hi-IN", Gujarati: "gu-IN",
      Bengali: "bn-IN", Tamil: "ta-IN", Telugu: "te-IN", Kannada: "kn-IN",
      Malayalam: "ml-IN", Punjabi: "pa-IN", Urdu: "ur-IN" };
    const code = codes[langName] || "en-IN";
    const voices = speechSynthesis.getVoices();
    return voices.find(v => v.lang === code) || voices.find(v => v.lang.startsWith(code.split("-")[0])) || null;
  },
  async speak(text, opts = {}) {
    if (!text || !String(text).trim()) {
      toast("Nothing to read yet.", "warn");
      return false;
    }

    const language =
      opts.language ||
      localStorage.getItem("bss_lang") ||
      "English";

    // Prefer backend TTS so regional-language voices can be generated.
    try {
      const result = await api("/voice/tts", {
        method: "POST",
        body: { text: String(text), language }
      });

      if (result?.audio_base64) {
        this.stop();

        const audio = new Audio(
          "data:audio/mpeg;base64," + result.audio_base64
        );

        this._audio = audio;
        this._playing = true;

        audio.onended = () => {
          this._playing = false;
          this._audio = null;
          this._syncBtn();
        };

        audio.onerror = () => {
          this._playing = false;
          this._audio = null;
          this._syncBtn();
          this.browserSpeak(text, language, opts);
        };

        await audio.play();
        this._syncBtn();
        return true;
      }
    } catch (err) {
      console.warn("Server TTS unavailable; using browser speech.", err);
    }

    return this.browserSpeak(text, language, opts);
  },

  browserSpeak(text, language, opts = {}) {
    if (!("speechSynthesis" in window)) {
      toast("Read-aloud is not supported in this browser.", "warn");
      return false;
    }

    this.stop();

    const u = new SpeechSynthesisUtterance(String(text));
    const v = this.voiceFor(language);

    const codes = {
      English: "en-IN",
      Hindi: "hi-IN",
      Marathi: "mr-IN",
      Gujarati: "gu-IN",
      Bengali: "bn-IN",
      Tamil: "ta-IN",
      Telugu: "te-IN",
      Kannada: "kn-IN",
      Malayalam: "ml-IN",
      Punjabi: "pa-IN",
      Urdu: "ur-IN"
    };

    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else {
      u.lang = codes[language] || "en-IN";
    }

    u.rate = opts.rate || 0.95;
    u.pitch = 1;

    u.onend = () => {
      this._playing = false;
      this._syncBtn();
    };

    u.onerror = () => {
      this._playing = false;
      this._syncBtn();
    };

    this._utter = u;
    this._paused = false;
    this._playing = true;

    speechSynthesis.speak(u);
    this._syncBtn();
    return true;
  },
  pause() { if (speechSynthesis.speaking) { speechSynthesis.pause(); this._paused = true; this._syncBtn(); } },
  resume() { if (this._paused) { speechSynthesis.resume(); this._paused = false; this._syncBtn(); } },
  stop() {
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }

    if (this._audio) {
      try {
        this._audio.pause();
        this._audio.currentTime = 0;
      } catch (_) {}
      this._audio = null;
    }

    this._paused = false;
    this._playing = false;
    this._syncBtn();
  },
  toggle(text, opts = {}) {
    if (this._playing) {
      if (this._paused) this.resume();
      else this.pause();
    } else this.speak(text, opts);
  },
  /* Button behaviour: data-text = the text to read */
  listen(btn, opts = {}) {
    const text = (btn && btn.dataset.text) || "";
    if (!text) { toast("Nothing to read yet.", "warn"); return; }
    this.toggle(text, opts);
  },
  _syncBtn() {
    $$("[data-text]").forEach(b => {
      if (b.dataset.listening === "1") {
        b.textContent = this._playing ? (this._paused ? "▶ Resume" : "⏸ Pause") : "🔊 Read";
        b.dataset.listening = this._playing ? "1" : "0";
      }
    });
  },
};

/* ---------------- Voice input (browser Web Speech API) ---------------- */
window.BSS_STT = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return {
    supported: !!SR,
    rec: null, active: false, onResult: null, onChange: null,
    langCode(name) {
      const codes = { English: "en-IN", Marathi: "mr-IN", Hindi: "hi-IN", Gujarati: "gu-IN",
        Bengali: "bn-IN", Tamil: "ta-IN", Telugu: "te-IN", Kannada: "kn-IN",
        Malayalam: "ml-IN", Punjabi: "pa-IN", Urdu: "ur-IN" };
      return codes[name] || "en-IN";
    },
    start(language, callbacks = {}) {
      if (!this.supported) { toast("Voice input is not supported in this browser. Try Chrome or Edge.", "warn"); return; }
      if (this.active) { this.stop(); return; }
      const rec = new SR();
      rec.lang = this.langCode(language);
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onstart = () => { this.active = true; callbacks.onChange && callbacks.onChange(true); };
      rec.onresult = (e) => {
        let text = "";
        for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
        callbacks.onResult && callbacks.onResult(text);
      };
      rec.onerror = (e) => {
        if (e.error !== "aborted") toast("Voice input error: " + e.error + ".", "warn");
        this.stop();
      };
      rec.onend = () => { this.active = false; callbacks.onChange && callbacks.onChange(false); };
      this.rec = rec;
      rec.start();
    },
    stop() { if (this.rec) { try { this.rec.stop(); } catch {} } this.active = false; },
  };
})();

/* ---------------- AI Assistant widget ---------------- */
window.BSS_AI = {
  inited: false,
  context: "general",
  lessonId: null,

  init() {
    if (this.inited) return;
    if (!BSS_STATE.aiEnabled) return;
    this.inited = true;
    if (!$("#aiFab")) {
      const fab = document.createElement("button");
      fab.id = "aiFab"; fab.className = "ai-fab";
      fab.innerHTML = "💬<small>AI Assistant</small>";
      fab.title = "Ask Bhasha AI Tutor";
      document.body.appendChild(fab);
      const panel = document.createElement("div");
      panel.id = "aiPanel"; panel.className = "ai-panel";
      panel.innerHTML = `
        <div class="ai-head">
          <div class="ai-avatar">🤖</div>
          <div><b>Bhasha AI Tutor</b><small id="aiStatus">Online • Demo mode available</small></div>
          <div class="ai-head-actions">
            <button id="aiClear" title="Clear chat">🗑</button>
            <button id="aiClose" title="Close">✕</button>
          </div>
        </div>
        <div class="ai-body" id="aiBody"></div>
        <div class="ai-chips" id="aiChips"></div>
        <div class="ai-input-row">
          <button class="ai-mic" id="aiMic" title="Ask by voice">🎤</button>
          <input id="aiInput" placeholder="Type your question…" autocomplete="off">
          <select id="aiLang" class="lang-select" title="Answer in language" style="max-width:110px;padding:8px"></select>
          <button class="ai-send" id="aiSend" title="Send">➤</button>
        </div>
        <div class="ai-foot-note">Answers are educational. In demo mode the tutor uses built-in knowledge.</div>`;
      document.body.appendChild(panel);

      $("#aiFab").addEventListener("click", () => this.open());
      $("#aiClose").addEventListener("click", () => this.close());
      $("#aiClear").addEventListener("click", () => this.clearHistory());
      $("#aiSend").addEventListener("click", () => this.send());
      $("#aiInput").addEventListener("keydown", (e) => { if (e.key === "Enter") this.send(); });
      $("#aiMic").addEventListener("click", () => this.toggleMic());

      const chips = ["Explain photosynthesis", "Explain in Marathi", "What is Bhasha Shiksha Setu?", "Give me study tips", "Explain fractions simply"];
      $("#aiChips").innerHTML = chips.map(c => `<button>${escapeHtml(c)}</button>`).join("");
      $$("#aiChips button").forEach(b => b.addEventListener("click", () => {
        this.setInput(b.textContent); this.send();
      }));

      const langSel = $("#aiLang");
      langSel.innerHTML = BSS_STATE.languages.map(l =>
        `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("");
      const savedLang = localStorage.getItem("bss_lang") || "English";
      langSel.value = BSS_STATE.languages.includes(savedLang)
        ? savedLang
        : (BSS_STATE.languages[0] || "English");

      bindLanguagePreference();
      this.loadHistory();
    }
  },

  setContext(ctx, lessonId = null) {
    this.context = ctx || "general";
    this.lessonId = lessonId;
  },
  open(context, lessonId) {
    this.init();
    this.setContext(context, lessonId);
    $("#aiPanel").classList.add("open");
    $("#aiInput").focus();
  },
  close() { const p = $("#aiPanel"); if (p) p.classList.remove("open"); },
  setInput(text) { const i = $("#aiInput"); if (i) { i.value = text; i.focus(); } },

  history: [],
  async download(id) {
    try {
      const res = await fetch(`${API_BASE}/video-dubbing/${id}/download`, {
        headers: {
          "Authorization": "Bearer " + (authToken() || ""),
          "X-Guest-Id": guestId()
        }
      });

      if (!res.ok) {
        let d = null;
        try { d = await res.json(); } catch (_) {}
        throw new Error(d?.message || "Download failed.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bhasha-dub-${id}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast(e.message, "err");
    }
  },

  async transcript(id, language = "source") {
    try {
      const data = await authFetch(
        `/video-dubbing/${id}/transcript/${encodeURIComponent(language)}`
      );

      const text =
        typeof data === "string"
          ? data
          : data?.text ||
            data?.transcript ||
            data?.content ||
            JSON.stringify(data, null, 2);

      this.saveTranscript(text, `bhasha-transcript-${id}-${language}.txt`);
    } catch (e) {
      toast(e.message, "err");
    }
  },

  saveTranscript(text, filename = "bhasha-transcript.txt") {
    if (!text) {
      toast("Transcript is empty.", "warn");
      return;
    }

    const blob = new Blob([String(text)], {
      type: "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Transcript saved.");
  },
  async loadHistory() {
    const body = $("#aiBody");
    try {
      const msgs = await api("/chat/history?limit=30");
      this.history = msgs || [];
      body.innerHTML = msgs.length ? "" : this.welcome();
      msgs.forEach(m => {
        this.renderMessage("user", m.message);
        this.renderMessage("bot", m.reply);
      });
      body.scrollTop = body.scrollHeight;
    } catch { body.innerHTML = this.welcome(); }
  },
  welcome() {
    const lang = localStorage.getItem("bss_lang") || "English";
    return `<div class="ai-msg bot"><div class="bubble">${escapeHtml(
      `Namaste! 🙏 I am Bhasha AI Tutor. Ask me anything about a lesson, science, maths — or type a question in ${lang}.`)}</div></div>`;
  },

  async send() {
    const input = $("#aiInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    this.renderMessage("user", text);
    this.typing(true);
    const lang = $("#aiLang").value || localStorage.getItem("bss_lang") || "English";
    localStorage.setItem("bss_lang", lang);
    try {
      const data = await api("/chat", {
        method: "POST",
        body: { message: text, language: lang, user_id: (currentUser() || {}).id || null,
                guest_id: guestId(), context: this.context, lesson_id: this.lessonId },
      });
      this.typing(false);
      this.renderMessage("bot", data.reply);
      this.history.push({ message: text, reply: data.reply });
      const status = $("#aiStatus");
      if (status) status.textContent = "Online";
    } catch (e) {
      this.typing(false);
      this.renderMessage("bot", "⚠️ " + e.message);
    }
  },

  typing(on) {
    const body = $("#aiBody");
    if (!body) return;
    const t = $("#typingRow");
    if (on) {
      body.insertAdjacentHTML("beforeend",
        `<div class="ai-msg bot" id="typingRow"><div class="typing"><span></span><span></span><span></span></div></div>`);
    } else { const el = $("#typingRow"); if (el) el.remove(); }
    body.scrollTop = body.scrollHeight;
  },

  renderMessage(who, text) {
    const body = $("#aiBody");
    if (!body) return;
    const div = document.createElement("div");
    div.className = "ai-msg " + (who === "user" ? "user" : "bot");
    const btnText = escapeHtml(text);
    div.innerHTML = who === "bot"
      ? `<div class="bubble">${btnText}</div>
         <div style="display:flex;flex-direction:column;gap:4px">
           <div class="actions">
             <button onclick="BSS_VOICE.listen(this)" data-text="${btnText}" data-language="${escapeHtml(localStorage.getItem("bss_lang") || "English")}" data-listening="0">🔊 Listen</button>
           </div>
         </div>`
      : `<div class="bubble">${btnText}</div>`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  },

  async clearHistory() {
    try {
      await api("/chat/history", { method: "DELETE" });
      this.history = [];
      const body = $("#aiBody");
      if (body) body.innerHTML = this.welcome();
      toast("Chat history cleared.");
    } catch (e) { toast(e.message, "err"); }
  },

  toggleMic() {
    const mic = $("#aiMic");
    if (!BSS_STT.supported) { toast("Voice input needs Chrome/Edge on desktop or Android.", "warn"); return; }
    const lang = ($("#aiLang") || {}).value || "English";
    BSS_STT.start(lang, {
      onChange: (on) => { mic.classList.toggle("rec", on); mic.textContent = on ? "⏹" : "🎤"; },
      onResult: async (text) => {
        this.setInput(text);
        // Voice question should be submitted automatically after recognition.
        if (text && text.trim()) {
          setTimeout(() => this.send(), 150);
        }
      },
    });
  },
};

/* ---------------- Translation tool (home page) ---------------- */
async function doTranslate() {
  const src = $("#transSrc");
  const dst = $("#transDst");
  const srcLang = $("#transSrcLang");
  const text = (src ? src.value : "").trim();
  const target = (dst ? dst.value : "") ||
    localStorage.getItem("bss_lang") || "Marathi";
  const source = (srcLang ? srcLang.value : "") || "English";
  const out = $("#transOut");
  const btn = $("#transBtn");

  if (!text) {
    toast("Type something to translate.", "warn");
    return;
  }

  if (source === target) {
    if (out) out.value = text;
    const listenBtn = $("#transListen");
    if (listenBtn) {
      listenBtn.dataset.text = text;
      listenBtn.dataset.language = target;
      listenBtn.classList.remove("hide");
    }
    return;
  }

  if (out) {
    if ("value" in out) out.value = "Translating…";
    else out.textContent = "Translating…";
  }
  if (btn) btn.disabled = true;

  try {
    const data = await api("/translate", {
      method: "POST",
      body: {
        text,
        source_language: source,
        target_language: target
      }
    });

    const translated = data?.translated_text || data?.translation || "";

    if (out) {
      if ("value" in out) out.value = translated;
      else out.textContent = translated;
    }

    const listenBtn = $("#transListen");
    if (listenBtn) {
      listenBtn.dataset.text = translated;
      listenBtn.dataset.language = target;
      listenBtn.classList.remove("hide");
    }
  } catch (e) {
    if (out) {
      const message = "⚠️ " + e.message;
      if ("value" in out) out.value = message;
      else out.textContent = message;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindTranslateTool() {
  const btn = $("#transBtn");
  const src = $("#transSrc");
  const mic = $("#transMic");
  const listen = $("#transListen");

  if (btn && btn.dataset.bound !== "1") {
    btn.dataset.bound = "1";
    btn.addEventListener("click", doTranslate);
  }

  if (src && src.dataset.bound !== "1") {
    src.dataset.bound = "1";
    const count = $("#transSrcCount");

    src.addEventListener("input", () => {
      if (count) count.textContent = `${src.value.length} chars`;
    });
  }

  if (mic && mic.dataset.bound !== "1") {
    mic.dataset.bound = "1";

    mic.addEventListener("click", () => {
      const source = $("#transSrcLang")?.value || "English";

      if (!BSS_STT.supported) {
        toast("Voice input needs Chrome or Edge.", "warn");
        return;
      }

      BSS_STT.start(source, {
        onChange(active) {
          mic.textContent = active ? "⏹ Stop" : "🎤 Speak";
        },

        async onResult(text) {
          if (src) src.value = text;

          const count = $("#transSrcCount");
          if (count) count.textContent = `${text.length} chars`;

          // Automatically translate spoken input.
          if (text.trim()) {
            await doTranslate();
          }
        }
      });
    });
  }

  if (listen && listen.dataset.bound !== "1") {
    listen.dataset.bound = "1";

    listen.addEventListener("click", () => {
      const text = listen.dataset.text || $("#transOut")?.value || "";
      const language =
        listen.dataset.language ||
        $("#transDst")?.value ||
        localStorage.getItem("bss_lang") ||
        "English";

      BSS_VOICE.toggle(text, { language });
    });
  }

  const swap = $("#transSwap");
  if (swap && swap.dataset.bound !== "1") {
    swap.dataset.bound = "1";

    swap.addEventListener("click", () => {
      const src = $("#transSrc");
      const dst = $("#transDst");

      if (!src || !dst) return;

      const srcLang = $("#transSrcLang");
      const oldText = src.value;
      const oldSource = srcLang?.value || "English";
      const oldTarget = dst.value || "Marathi";

      src.value = $("#transOut")?.value || "";

      if (srcLang && [...srcLang.options].some(o => o.value === oldTarget)) {
        srcLang.value = oldTarget;
      }

      if ([...dst.options].some(o => o.value === oldSource)) {
        dst.value = oldSource;
      }

      if ($("#transOut")) {
        if ("value" in $("#transOut")) $("#transOut").value = oldText;
        else $("#transOut").textContent = oldText;
      }

      const listenBtn = $("#transListen");
      if (listenBtn) {
        listenBtn.dataset.text = oldText;
        listenBtn.dataset.language = oldSource;
      }
    });
  }
}

/* ---------------- Language preference ---------------- */
function bindLanguagePreference() {
  $$("select[data-langs], .lang-select").forEach(sel => {
    if (sel.dataset.langBound === "1") return;

    sel.dataset.langBound = "1";

    sel.addEventListener("change", async () => {
      const lang = sel.value;
      if (!lang) return;

      localStorage.setItem("bss_lang", lang);

      // Keep every language selector on the page synchronized.
      $$("select[data-langs], .lang-select").forEach(other => {
        if (other !== sel && [...other.options].some(o => o.value === lang)) {
          other.value = lang;
        }
      });

      const user = currentUser();

      if (user?.role === "student") {
        try {
          const updated = await api("/student/language", {
            method: "PUT",
            body: { language_preference: lang }
          });

          if (updated) {
            setAuth(authToken(), updated);
          } else {
            user.language_preference = lang;
            setAuth(authToken(), user);
          }

          toast("Preferred language updated: " + lang);
        } catch (e) {
          toast(e.message, "err");
        }
      } else {
        toast("Preferred language set to " + lang);
      }
    });
  });
}


/* =========================================================
   AI VIDEO TRANSLATOR + SMART LEARNING
   ========================================================= */
const BSS_LANG_NAMES = {en:"English",hi:"Hindi",mr:"Marathi",gu:"Gujarati",bn:"Bengali",ta:"Tamil",te:"Telugu",auto:"Auto detect"};
function authFetch(path, options={}) { return api(path, options); }

window.BSS_VIDEO = {
  sourceMode: "upload",
  currentId: null,
  async create() {
    const target = $("#videoTargetLang")?.value;
    const source = $("#videoSourceLang")?.value || "auto";
    const file = $("#videoFile")?.files?.[0];
    const url = $("#videoUrl")?.value.trim();
    if (this.sourceMode === "upload" && !file) return toast("Choose a video first.", "err");
    if (this.sourceMode === "url" && !url) return toast("Paste a video URL first.", "err");
    if (!target) return toast("Choose a target language.", "err");
    const fd = new FormData();
    fd.append("source_language", source); fd.append("target_language", target);
    if (file) fd.append("file", file); else fd.append("source_url", url);
    try {
      $("#startVideoDub").disabled = true;
      $("#videoStatusBox").innerHTML = "<div class='video-progress'><b>⟳ Starting video translation…</b><span>Uploading and sending the job to the secure backend.</span></div>";
      const job = await authFetch("/video-dubbing/create", {method:"POST", body:fd});
      this.currentId = job.id; this.renderStatus(job);
      await this.poll(job.id);
      await this.loadHistory();
    } catch(e) { $("#videoStatusBox").innerHTML = `<div class='video-error'>❌ ${escapeHtml(e.message)}</div>`; }
    finally { $("#startVideoDub").disabled = false; }
  },
  async poll(id) {
    for (let i=0;i<120;i++) {
      await new Promise(r=>setTimeout(r,5000));
      try {
        const job = await authFetch(`/video-dubbing/${id}/status`); this.renderStatus(job);
        if (["dubbed","failed"].includes(job.provider_status || job.status)) return;
      } catch(e) { return; }
    }
  },
  renderStatus(job) {
    const status = job.provider_status || job.status || "preparing";
    const label = {queued:"Queued",preparing:"Preparing audio",dubbling:"Dubbing",dubbing:"Generating translated voice",dubbed:"Completed",failed:"Failed"}[status] || status;
    const steps = ["Received", "Transcribing", "Translating", "Generating voice", "Synchronizing"];
    const complete = status === "dubbed";
    $("#videoStatusBox").innerHTML = `<div class='video-status-card'><div class='status-badge ${complete?"success":"working"}'>${complete?"✓":"⟳"} ${escapeHtml(label)}</div><div class='video-steps'>${steps.map((x,i)=>`<span class='${complete||i < (status==="preparing"?2:status==="dubbing"?4:1)?"done":""}'>${complete||i < (status==="preparing"?2:status==="dubbing"?4:1)?"✓":"○"} ${x}</span>`).join("")}</div><p><b>${escapeHtml(BSS_LANG_NAMES[job.source_language]||job.source_language||"Auto")}</b> → <b>${escapeHtml(BSS_LANG_NAMES[job.target_language]||job.target_language)}</b></p>${job.error_message?`<div class='video-error'>${escapeHtml(job.error_message)}</div>`:""}</div>`;
    if (complete && $("#videoResult")) {
      $("#videoResult").innerHTML = `
        <div class="video-result">
          <h3>🎉 Dubbed lesson ready</h3>
          <p>
            Your translated media is ready in
            ${escapeHtml(BSS_LANG_NAMES[job.target_language] || job.target_language)}.
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a class="btn btn-primary" href="#"
              onclick="BSS_VIDEO.download(${job.id});return false">
              ▶ Open / Download Video
            </a>
            <a class="btn btn-outline" href="#"
              onclick="BSS_VIDEO.transcript(${job.id},'source');return false">
              📄 Save Original Transcript
            </a>
            <a class="btn btn-outline" href="#"
              onclick="BSS_VIDEO.transcript(${job.id},'${escapeHtml(job.target_language || "source")}');return false">
              🌐 Save Translated Transcript
            </a>
          </div>
        </div>`;

      $("#videoResult").classList.remove("hide");
    }
  },
  async download(id) {
    try {
      const res = await fetch(`${API_BASE}/video-dubbing/${id}/download`, {
        headers: {
          "Authorization": "Bearer " + (authToken() || ""),
          "X-Guest-Id": guestId()
        }
      });

      if (!res.ok) {
        let d = null;
        try { d = await res.json(); } catch (_) {}
        throw new Error(d?.message || "Download failed.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bhasha-dub-${id}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast(e.message, "err");
    }
  },

  async transcript(id, language = "source") {
    try {
      const data = await authFetch(
        `/video-dubbing/${id}/transcript/${encodeURIComponent(language)}`
      );

      const text =
        typeof data === "string"
          ? data
          : data?.text ||
            data?.transcript ||
            data?.content ||
            JSON.stringify(data, null, 2);

      this.saveTranscript(text, `bhasha-transcript-${id}-${language}.txt`);
    } catch (e) {
      toast(e.message, "err");
    }
  },

  saveTranscript(text, filename = "bhasha-transcript.txt") {
    if (!text) {
      toast("Transcript is empty.", "warn");
      return;
    }

    const blob = new Blob([String(text)], {
      type: "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Transcript saved.");
  },
  async loadHistory() {
    try {
      const rows = await authFetch("/video-dubbing");
      $("#videoHistoryGrid").innerHTML = rows.length
        ? rows.map(j => `
          <div class="card">
            <div class="lesson-meta">
              <span class="chip lang">
                ${escapeHtml(BSS_LANG_NAMES[j.target_language] || j.target_language)}
              </span>
              <span class="chip ${j.status === "dubbed" ? "pub" : "gray"}">
                ${escapeHtml(j.status)}
              </span>
            </div>
            <h3>${escapeHtml(j.original_filename || j.source_url || "Video translation")}</h3>
            <p>${fmtDate(j.created_at)}</p>
            ${j.status === "dubbed" ? `
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <a class="btn btn-primary btn-sm" href="#"
                  onclick="BSS_VIDEO.download(${j.id});return false">
                  ▶ Video
                </a>
                <a class="btn btn-outline btn-sm" href="#"
                  onclick="BSS_VIDEO.transcript(${j.id},'source');return false">
                  📄 Original TXT
                </a>
                <a class="btn btn-outline btn-sm" href="#"
                  onclick="BSS_VIDEO.transcript(${j.id},'${escapeHtml(j.target_language || "source")}');return false">
                  🌐 Translation TXT
                </a>
              </div>
            ` : ""}
          </div>
        `).join("")
        : '<div class="empty">No video translations yet.</div>';
    } catch (e) {
      if ($("#videoHistoryGrid")) {
        $("#videoHistoryGrid").innerHTML =
          '<div class="empty">Login to use video translation.</div>';
      }
    }
  }
};

window.BSS_LEARNING = {
  async load() {
    try {
      const [profile, weak, recs] = await Promise.all([authFetch("/learning/profile"), authFetch("/learning/weak-topics"), authFetch("/learning/recommendations")]);
      $("#learningProfileCard").innerHTML = `<h2>Personal learning profile</h2><div class='learning-metrics'><b>${profile.lessons_completed||0}<small>Lessons completed</small></b><b>${profile.average_score||0}%<small>Average quiz score</small></b><b>${weak.length||0}<small>Weak topics</small></b></div><p class='muted'>Preferred language: ${escapeHtml(profile.language_preference||"English")}</p>`;
      $("#recommendationGrid").innerHTML = recs.length ? recs.map(r=>`<div class='card'><span class='chip subj'>${escapeHtml(r.subject||"Practice")}</span><h3>${escapeHtml(r.title||r.topic)}</h3><p>${escapeHtml(r.reason||"Recommended from your learning activity.")}</p><button class='btn btn-primary btn-sm' onclick='BSS_LEARNING.start("${String(r.lesson_id||"").replace(/'/g,"\\'")}")'>Start practice →</button></div>`).join("") : '<div class="empty">Complete a lesson and quiz to unlock personalized practice.</div>';
    } catch(e) { $("#learningProfileCard").innerHTML=`<h2>Personal learning profile</h2><p class='muted'>${escapeHtml(e.message)}</p>`; }
  },
  start(id) { if(id) { const el=document.querySelector(`[data-lesson-id="${CSS.escape(id)}"]`); if(el) el.click(); else toast("Practice is ready in your lessons."); } else toast("Complete a lesson first to generate practice."); }
};

window.BSS_MATERIALS = {
  async render(hostSel = "#studentMaterialsGrid") {
    const host = $(hostSel); if (!host) return;
    host.innerHTML = '<div class="skeleton" style="height:180px"></div>'.repeat(3);
    try {
      const rows = await api("/materials");
      host.innerHTML = rows.length ? rows.map(m => `
        <div class="card"><div class="ico-tile tile-v">📄</div><h3>${escapeHtml(m.title || m.original_name || "Study Material")}</h3>
        <p>${escapeHtml(m.description || m.category || "Educational material")}</p>
        <a class="btn btn-primary btn-sm" href="${escapeHtml(m.url || "#")}" target="_blank" rel="noopener">Open Material →</a></div>`).join("")
        : '<div class="empty" style="grid-column:1/-1"><div class="big">📄</div>No study materials available yet.</div>';
    } catch (e) { host.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">⚠️</div>${escapeHtml(e.message)}</div>`; }
  }
};

/* ---------------- Boot ---------------- */
document.addEventListener("DOMContentLoaded", async () => {
  updateNavAuth();
  bindLoginForm();
  bindRegisterForm();
  bindTranslateTool();
  bindLanguagePreference();
  $$(".burger").forEach(b => b.addEventListener("click", () => $(".nav-links")?.classList.toggle("open")));

  await loadSiteConfig();
  populateLanguageSelects();
  bindLanguagePreference();
  loadTextContent();
  loadAnnouncements();
  loadFAQs();

  const page = document.body.dataset.page;
  if (page !== "admin") BSS_AI.init();
  if (page === "home") {
    // Subject filter pills
    $$("#subjectPills .filter-pill").forEach(pill => pill.addEventListener("click", () => {
      $$("#subjectPills .filter-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      BSS_LESSONS.render("#lessonGrid", { subject: pill.dataset.subject });
    }));
    BSS_LESSONS.render("#lessonGrid");
    try {
      const lessons = await api("/lessons");
      const countEl = $("#heroLessonsCount");
      if (countEl) countEl.textContent = lessons.length;
      const bandEl = $("#bandLessons");
      if (bandEl) bandEl.textContent = lessons.length;
    } catch {}
    const langCountEl = $("#bandLangs");
    if (langCountEl) langCountEl.textContent = BSS_STATE.languages.length;
  }
  if (typeof window.PAGE_INIT === "function") window.PAGE_INIT();
});
