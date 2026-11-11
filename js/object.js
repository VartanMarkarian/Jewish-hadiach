/* Невидимі шари пам’яті — сторінка об’єкта (#object-<key>): 3D-модель, що обертається, AR, повні описи.
   Моделі: models/<key>_ar.glb (+ .usdz для iPhone).
   Для публікації на claude.ai (не віддає .glb) build_publish.py кладе моделі як base64-текст
   models/<key>.<k>.txt і задає window.MODEL_PARTS = {key: кількість частин}. */
(function () {
  // перемикання «сторінок» — миттєво (у html увімкнено плавну прокрутку) і без автовідновлення прокрутки браузером
  const jump = (y) => window.scrollTo({ top: y, behavior: "instant" });
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, "0");
  const STOPS = window.STOPS;
  const EMBED = window.MODEL_PARTS || null;
  const page = $("#opage"), stage = $("#opStage"), load = $("#opLoad"), hint = $("#opHint"), arNote = $("#opArNote");

  const ANIMATED = new Set(["bima", "maysterni"]);                     // у цих моделях є анімація
  const ORBIT = { viz: "-25deg 76deg 130%", maysterni: "20deg 80deg 130%" };
  const orbit = (k) => ORBIT[k] || "20deg 78deg 130%";
  const LOOK = { "tone-mapping": "neutral", exposure: "1.05", "shadow-intensity": "1", "shadow-softness": "0.9",
    "interaction-prompt": "none" };
  // AR: моделі в реальному розмірі (tools/ar_scale.py); підйом над підлогою, м
  const LIFT = { vikna: 0.8, maysterni: 0.2, yarmarok: 0.5 };

  /* Власний AR на Android (js/ar-xr.js): торкнувся — об’єкт став і закріпився, пальцем лише обертається.
     Модуль вантажимо заздалегідь: сесію браузер дозволяє відкрити тільки одразу після натискання. */
  let xr = null;

  /* Усі інші WebGL-контексти сторінки (мапа MapLibre, model-viewer) перед AR гасимо: закриття AR-сесії поруч
     із живими контекстами у фреймі claude.ai валило вкладку («сірий екран»). Після виходу сторінка перезавантажується. */
  const glCtx = new Set();
  const getCtx = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = getCtx.call(this, type, ...rest);
    if (c && /webgl/.test(type) && this.dataset.xr !== "1") glCtx.add(c);
    return c;
  };
  function dropOtherGL() {
    document.querySelectorAll("canvas").forEach((cv) => {
      if (cv.dataset.xr === "1") return;
      const c = getCtx.call(cv, "webgl2") || getCtx.call(cv, "webgl");
      if (c) glCtx.add(c);
    });
    glCtx.forEach((c) => { try { if (!c.isContextLost()) { const e = c.getExtension("WEBGL_lose_context"); if (e) e.loseContext(); } } catch {} });
  }

  if (navigator.xr) navigator.xr.isSessionSupported("immersive-ar")
    .then((ok) => ok && import(new URL("js/ar-xr.js?v=16a46a22", location.href).href).then((m) => { xr = m; }))
    .catch(() => {});

  /* ---------- model-viewer вантажимо лише коли відкрито сторінку об’єкта ---------- */
  let mvReady = null;
  const loadMV = () => mvReady ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = "https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js";
    s.onload = () => customElements.whenDefined("model-viewer").then(res);
    s.onerror = rej;
    document.head.appendChild(s);
  });

  /* URL моделі: звичайний файл або blob, зібраний із base64-частин */
  const urls = {};
  function modelURL(key, onProgress) {
    const v = window.MODEL_V && window.MODEL_V[key] ? `?v=${window.MODEL_V[key]}` : "";   // версія — щоб не брався старий кеш
    if (!EMBED) return Promise.resolve(`models/${key}_ar.glb${v}`);
    return urls[key] ||= (async () => {
      const n = EMBED[key] || 1;
      let done = 0;
      const parts = await Promise.all(Array.from({ length: n }, (_, k) =>
        fetch(`models/${key}.${k}.txt`).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
          .then((t) => { onProgress(++done / n); return t.trim(); })));
      const bin = atob(parts.join(""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
    })().catch((e) => { delete urls[key]; throw e; });
  }

  const setLoad = (p) => {
    load.style.setProperty("--p", p + "%");
    load.querySelector("b").textContent = p + "%";
    load.classList.toggle("done", p >= 100);
  };

  let mv = null, curModel = null;
  const AR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>`;
  function ensureMV() {
    if (mv) return;
    mv = document.createElement("model-viewer");
    const a = { ...LOOK, ar: "", "ar-modes": "webxr scene-viewer quick-look", "ar-scale": "fixed", "ar-placement": "floor",
      "camera-controls": "", "auto-rotate": "", "auto-rotate-delay": "1500", "rotation-per-second": "14deg",
      "max-camera-orbit": "auto auto 260%", "touch-action": "pan-y" };
    Object.entries(a).forEach(([k, v]) => mv.setAttribute(k, v));
    mv.innerHTML = `<button slot="ar-button" class="op-ar">${AR_ICON}<span>Відкрити в AR</span></button>`;
    // Android із WebXR — наш режим; інакше (iPhone, старі Android) model-viewer відкриє Quick Look / Scene Viewer
    mv.querySelector(".op-ar").addEventListener("click", (e) => {
      if (!xr || !curModel) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const s = STOPS[cur], src = curModel.url;
      // на час AR прибираємо модель зі сторінки. Після виходу не повертаємо її в той самий model-viewer:
      // повторне завантаження поруч із живим AR-контекстом за ~2 с валило вкладку на Android.
      // Натомість чисте перезавантаження сторінки — вона відкриється на цьому ж об’єкті (#object-<key>).
      const restore = () => { if (curModel && curModel.url === src && !mv.getAttribute("src")) mv.setAttribute("src", src); };
      mv.removeAttribute("src");
      dropOtherGL();
      xr.start({ url: src, lift: LIFT[curModel.key] || 0, title: s.name, onEnd: () => setTimeout(() => location.reload(), 300) }).catch(restore);
    }, true);
    $("#opMV").appendChild(mv);
    mv.addEventListener("progress", (e) => setLoad(Math.round(EMBED ? 60 + e.detail.totalProgress * 40 : e.detail.totalProgress * 100)));
    mv.addEventListener("load", () => { setLoad(100); updateARNote(); });
    mv.addEventListener("error", () => { load.querySelector("b").textContent = "модель не завантажилась"; });
  }

  const touch = matchMedia("(pointer: coarse)").matches;
  function updateARNote() {
    if (mv && mv.canActivateAR) { arNote.hidden = true; return; }
    arNote.textContent = touch
      ? "У цьому перегляді AR недоступний. Він запуститься, коли сайт буде відкрито з адреси проєкту."
      : "AR — на телефоні: відкрийте цю сторінку в Chrome (Android) або Safari (iPhone).";
    arNote.hidden = false;
  }

  /* ---------- текст ---------- */
  let cur = -1;
  function render(i) {
    const s = STOPS[i], nx = STOPS[(i + 1) % STOPS.length];
    $("#opKicker").textContent = `Об’єкт ${pad(s.n)} · Точка ${s.n} · ${s.addr}, Гадяч`;
    $("#opTitle").textContent = s.name;
    $("#opPoint").innerHTML = `<span class="mono">Концептуальний образ</span>«${s.concept}»`;
    $("#opCap").textContent = s.caption;
    $("#opLead").textContent = s.short;
    $("#opLong").innerHTML = s.long.map((p) => `<p>${p}</p>`).join("");
    $("#opTerms").innerHTML = s.terms.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("");
    $("#opPlace").src = s.place;
    $("#opPlace").alt = `Сучасний вигляд локації № ${s.n}: ${s.addr}, Гадяч`;
    $("#opPlaceCap").textContent = `Сучасний вигляд локації · ${s.addr}, Гадяч · фото: Роксолана Дудка, 2026`;
    $("#opCount").textContent = `${pad(s.n)} / ${pad(STOPS.length)}`;
    $("#opNextName").textContent = nx.name;
    $("#opNextImg").src = nx.render;
    document.title = `${s.name} · Невидимі шари пам’яті`;
  }

  async function show(i) {
    cur = i;
    curModel = null;
    const s = STOPS[i];
    render(i);
    setAudio(s);
    setLoad(0);
    hint.hidden = false;
    arNote.hidden = true;
    // повна адреса: url() у CSS-змінній інакше рахується від css/style.css
    stage.style.setProperty("--poster", `url("${new URL(s.render, location.href).href}")`);
    stage.classList.remove("live");
    try { await loadMV(); } catch { load.querySelector("b").textContent = "3D-перегляд недоступний"; return; }
    ensureMV();
    mv.setAttribute("alt", `3D-скульптура «${s.name}»`);
    mv.setAttribute("camera-orbit", orbit(s.key));
    mv.toggleAttribute("autoplay", ANIMATED.has(s.key));
    let url;
    try { url = await modelURL(s.key, (f) => setLoad(Math.round(f * 60))); }
    catch { load.querySelector("b").textContent = "модель не завантажилась"; return; }
    if (cur !== i) return;
    if (EMBED) mv.removeAttribute("ios-src"); else mv.setAttribute("ios-src", `models/${s.key}_ar.usdz${window.USDZ_V && window.USDZ_V[s.key] ? `?v=${window.USDZ_V[s.key]}` : ""}`);
    mv.setAttribute("src", url);
    curModel = { key: s.key, url };
    stage.classList.add("live");
    if (mv.loaded && mv.src === url) { setLoad(100); updateARNote(); }
  }

  /* ---------- аудіо розгорнутої концепції (поки лише українською) ----------
     Файли: media/audio/ua/<n>_<key>.mp3. У публікації build_publish.py дає їм імена з хешем
     (claude.ai кешує старі версії) і задає window.AUDIO_FILES = {"ua/1_bima": "media/audio/ua/1_bima-<hash>.mp3"}. */
  const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx=".6" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx=".6" fill="currentColor"/></svg>';
  const au = $("#opAudioEl"), auBox = $("#opAudio"), auBtn = $("#opPlay"), auBar = $("#opAudBar"), auFill = $("#opAudFill"), auTime = $("#opAudTime");
  const mmss = (t) => (isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}` : "0:00");
  const audioURL = (s) => {
    const id = `ua/${s.n}_${s.key}`;
    return window.AUDIO_FILES ? window.AUDIO_FILES[id] : `media/audio/${id}.mp3`;
  };
  // файл беремо повністю як blob: сервер claude.ai не віддає частини (Range), і без цього не працює перемотування
  const blobs = {};
  const audioBlob = (url) => blobs[url] ||= fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
    .then((b) => URL.createObjectURL(b)).catch((e) => { delete blobs[url]; throw e; });
  let auWant = null;
  function setAudio(s) {
    au.pause();
    const url = audioURL(s);
    auBox.hidden = !url;
    au.removeAttribute("src"); au.load();
    auFill.style.width = "0%"; auTime.textContent = "0:00";
    auBtn.innerHTML = ICON_PLAY; auBtn.setAttribute("aria-label", "Слухати розгорнуту концепцію");
    auWant = url;
    if (!url) return;
    audioBlob(url).then((b) => { if (auWant === url) au.src = b; })
      .catch(() => { if (auWant === url) au.src = url; });          // запасний варіант — пряме посилання
  }
  const syncAudio = () => {
    const p = au.duration ? (au.currentTime / au.duration) * 100 : 0;
    auFill.style.width = p + "%"; auBar.setAttribute("aria-valuenow", Math.round(p));
    auTime.textContent = au.currentTime > 0 ? `${mmss(au.currentTime)} / ${mmss(au.duration)}` : mmss(au.duration);
  };
  au.addEventListener("loadedmetadata", syncAudio);
  au.addEventListener("timeupdate", syncAudio);
  au.addEventListener("play", () => { auBtn.innerHTML = ICON_PAUSE; auBtn.setAttribute("aria-label", "Пауза"); });
  au.addEventListener("pause", () => { auBtn.innerHTML = ICON_PLAY; auBtn.setAttribute("aria-label", "Слухати розгорнуту концепцію"); });
  au.addEventListener("ended", () => { au.currentTime = 0; syncAudio(); });
  auBtn.addEventListener("click", async () => {
    if (!au.paused) { au.pause(); return; }
    if (!au.getAttribute("src") && auWant) { try { au.src = await audioBlob(auWant); } catch { au.src = auWant; } }
    au.play().catch(() => {});
  });
  // швидкість: 1× → 1,25× → 1,5× → 1×; зберігається при переході між об’єктами
  const SPEEDS = [1, 1.25, 1.5], auSpeed = $("#opSpeed");
  let speed = 1;
  const label = (v) => String(v).replace(".", ",") + "×";
  const applySpeed = () => {
    au.defaultPlaybackRate = au.playbackRate = speed;
    auSpeed.textContent = label(speed); auSpeed.classList.toggle("on", speed !== 1);
    auSpeed.setAttribute("aria-label", `Швидкість відтворення: ${label(speed)}`);
  };
  auSpeed.addEventListener("click", () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; applySpeed(); });
  au.addEventListener("loadedmetadata", applySpeed);
  const seek = (e) => {
    if (!au.duration) return;
    const r = auBar.getBoundingClientRect();
    au.currentTime = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * au.duration;
    syncAudio();
  };
  auBar.addEventListener("pointerdown", (e) => { seek(e); auBar.setPointerCapture(e.pointerId); });
  auBar.addEventListener("pointermove", (e) => { if (auBar.hasPointerCapture(e.pointerId)) seek(e); });
  auBar.addEventListener("keydown", (e) => {
    if (!au.duration) return;
    if (e.key === "ArrowRight") { au.currentTime = Math.min(au.currentTime + 10, au.duration); e.preventDefault(); }
    if (e.key === "ArrowLeft") { au.currentTime = Math.max(au.currentTime - 10, 0); e.preventDefault(); }
  });

  /* ---------- маршрутизація за адресою ---------- */
  const titleDefault = document.title;
  let savedY = 0, open = false, bg = false, prevHash = "", toRoute = false;
  const idx = (key) => STOPS.findIndex((s) => s.key === key);

  function openPage(i) {
    if (!open) {
      savedY = scrollY;
      prevHash = lastHash;
      open = true;
      document.body.classList.add("op-open");
      page.hidden = false;
      if (!bg) { bg = true; Contours($("#opContours"), { seed: 2.7, alpha: 0.1, scale: 300 }); }
    }
    jump(0);
    show(i);
  }

  function closePage(target) {
    if (!open) return;
    open = false;
    page.hidden = true;
    document.body.classList.remove("op-open");
    document.title = titleDefault;
    if (mv) mv.pause && mv.pause();
    au.pause();
    const map = window.RouteMap && window.RouteMap.map;
    if (map) map.resize();
    // назад у браузері — туди, звідки прийшли; посилання з меню або «До мапи» — до свого розділу
    const el = target && (toRoute || target !== prevHash) && document.querySelector(target);
    toRoute = false;
    if (el) el.scrollIntoView({ behavior: "instant" }); else jump(savedY);
  }

  let lastHash = "";
  function route() {
    const m = location.hash.match(/^#object-(\w+)/);
    const i = m ? idx(m[1]) : -1;
    if (i >= 0) openPage(i);
    else closePage(location.hash.length > 1 ? location.hash : null);
    lastHash = location.hash;
  }
  addEventListener("hashchange", route);

  const go = (d) => location.replace(`#object-${STOPS[(cur + d + STOPS.length) % STOPS.length].key}`);
  $("#opPrev").addEventListener("click", () => go(-1));
  $("#opNext").addEventListener("click", () => go(1));
  $("#opNextBig").addEventListener("click", () => go(1));

  // «До мапи»: повертаємось до маршруту на точці цього об’єкта
  const toMap = (e) => {
    e.preventDefault();
    const i = cur;
    toRoute = true;
    location.hash = "#route";
    setTimeout(() => window.RouteMap && window.RouteMap.go(i), 400);
  };
  $("#opBack").addEventListener("click", toMap);
  $("#opBackTop").addEventListener("click", toMap);

  addEventListener("keydown", (e) => {
    if (!open || e.target.closest("input, textarea, model-viewer, .op-aud-bar")) return;
    if (e.key === "ArrowRight") go(1);
    if (e.key === "ArrowLeft") go(-1);
  });
  stage.addEventListener("pointerdown", () => { hint.hidden = true; }, { passive: true });

  route();
})();
