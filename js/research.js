/* Невидимі шари пам’яті — сторінка «Дослідження» (#research, розділи #r-…): газетний випуск за звітом Р. Дудки.
   Розмітку генерує tools/build_research.py; тут — відкриття/закриття сторінки та картки семи об’єктів. */
(function () {
  // перемикання «сторінок» — миттєво (у html увімкнено плавну прокрутку) і без автовідновлення прокрутки браузером
  const jump = (y) => window.scrollTo({ top: y, behavior: "instant" });
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const $ = (s) => document.querySelector(s);
  const page = $("#rpage");
  if (!page) return;
  const pad = (n) => String(n).padStart(2, "0");
  const titleDefault = document.title;
  let open = false, savedY = 0, filled = false, lastHash = "";

  function fillObjs() {
    if (filled) return;
    filled = true;
    $("#rObjs").innerHTML = window.STOPS.map((s) => `
      <article class="r-obj">
        <a href="#object-${s.key}" class="r-obj-img"><img src="${s.render}" alt="${tr("Цифрова скульптура")} ${qq(s.name)}" loading="lazy"></a>
        <p class="mono">${tr("Точка")} ${pad(s.n)} · ${s.addr}</p>
        <h4><a href="#object-${s.key}">${s.name}</a></h4>
        <p class="r-obj-c"><i>${s.concept}</i></p>
        <p>${s.short}</p>
        <a class="r-more mono" href="#object-${s.key}">${tr("Відкрити 3D-об’єкт →")}</a>
      </article>`).join("");
  }

  /* ---------- газетні «блоки» ----------
     CSS-колонки ділять увесь розділ на 3 дуже довгі стовпчики — читати незручно (вниз-вгору на кілька екранів).
     Тому текст розкладаємо на послідовні блоки висотою ≈ екран: кожен блок має свої колонки,
     дочитав колонку — повертаєшся вгору лише в межах одного блоку. На телефоні (1 колонка) нічого не ділимо. */
  const groups = [];
  function setupFlow() {
    page.querySelectorAll(".r-cols, .r-gloss, .r-src").forEach((c) => {
      const wrap = document.createElement("div");
      wrap.className = "r-flow";
      c.before(wrap);
      const proto = c.cloneNode(false);
      // довгі статті розбираємо на заголовок і абзаци, щоб блок міг розірватися між абзацами (рамки-«бокси» лишаються цілими)
      const items = [];
      for (const el of [...c.children]) {
        if (el.matches("article.r-art:not(.r-box)")) {
          for (const k of [...el.children]) { if (k.tagName === "H3") k.classList.add("r-ah"); items.push(k); }
        } else items.push(el);
      }
      groups.push({ wrap, proto, items });
      c.remove();
    });
  }
  let lastW = 0;
  function layoutFlow(force) {
    if (!open || (!force && innerWidth === lastW)) return;
    lastW = innerWidth;
    const maxH = Math.max(380, Math.min(innerHeight * 0.74, 780));
    for (const g of groups) {
      g.wrap.textContent = "";
      let count = 0, cur = null;
      const chunk = () => {
        const c = g.proto.cloneNode(false);
        if (g.wrap.children.length) c.classList.remove("r-drop");          // буквиця — лише в першому блоці
        if (c.tagName === "OL") c.start = count + 1;                       // нумерація джерел наскрізна
        g.wrap.appendChild(c);
        return c;
      };
      cur = chunk();
      const multi = parseInt(getComputedStyle(cur).columnCount, 10) > 1;
      for (const it of g.items) {
        cur.appendChild(it);
        if (multi && cur.children.length > 1 && cur.offsetHeight > maxH) {
          cur.removeChild(it);
          const orphan = cur.lastElementChild && cur.lastElementChild.tagName === "H3" && cur.children.length > 1
            ? cur.lastElementChild : null;                                   // заголовок не лишаємо в кінці блоку
          cur = chunk();
          if (orphan) cur.appendChild(orphan);
          cur.appendChild(it);
        }
        if (it.tagName === "LI") count++;
      }
    }
  }
  setupFlow();
  let rt = 0;
  const relayout = (force) => { clearTimeout(rt); rt = setTimeout(() => layoutFlow(force), 200); };
  addEventListener("resize", () => relayout(false));
  // фото вантажаться ліниво й змінюють висоту блоку — переробляємо розкладку, коли кожне з’явиться
  groups.forEach((g) => g.items.forEach((it) => it.querySelectorAll("img").forEach((im) => {
    if (!im.complete) im.addEventListener("load", () => relayout(true), { once: true });
  })));
  if (document.fonts) document.fonts.ready.then(() => layoutFlow(true));


  /* ---------- аудіоверсія: кілька файлів (до ~6 хв) як одна доріжка ----------
     Кожен файл беремо повністю як blob — сервер claude.ai не віддає частини (Range), без цього не працює перемотування.
     У публікації build_publish.py дає файлам імена з хешем: window.AUDIO_FILES["research/ua_01"]. */
  const RA = window.RESEARCH_AUDIO;
  const ra = { el: $("#rAudioEl"), box: $("#rAudio"), btn: $("#rPlay"), bar: $("#rAudBar"), fill: $("#rAudFill"),
    time: $("#rAudTime"), info: $("#rAudInfo"), speedBtn: $("#rSpeed"), chap: $("#rChap") };
  let raPause = () => {};
  if (RA && ra.el) (function () {
    const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/></svg>';
    const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx=".6" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx=".6" fill="currentColor"/></svg>';
    const au = ra.el, F = RA.files, T = RA.total;
    const start = []; F.reduce((acc, f, k) => (start[k] = acc, acc + f.dur), 0);
    const url = (f) => (window.AUDIO_FILES && window.AUDIO_FILES[`research/${f.id}`]) || `media/audio/research/${f.id}.mp3`;
    const blobs = {};
    const getBlob = (k) => blobs[k] ||= fetch(url(F[k])).then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); })
      .then((b) => URL.createObjectURL(b)).catch((e) => { delete blobs[k]; throw e; });
    const fmt = (t) => { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
      return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s).padStart(2, "0")}`; };
    const segAt = (g) => { let k = 0; while (k < F.length - 1 && g >= start[k + 1]) k++; return k; };
    let cur = -1, pos = 0, want = false, speed = 1, busy = 0;

    ra.info.textContent = `${fmt(T)} · ${tr("українською")} · ${tr("ШІ-голос")}`;
    ra.time.textContent = fmt(T);
    ra.box.hidden = false;
    // розділи: кнопки й позначки на шкалі
    RA.chapters.forEach((c, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<button type="button" data-t="${c.t}"><span>${String(i + 1).padStart(2, "0")}</span>${c.title}</button>`;
      ra.chap.appendChild(li);
      if (i) { const b = document.createElement("b"); b.style.left = (c.t / T * 100) + "%"; ra.bar.appendChild(b); }
    });
    const chapBtns = [...ra.chap.querySelectorAll("button")];

    const ui = () => {
      const g = cur >= 0 && au.src ? start[cur] + au.currentTime : pos;
      ra.fill.style.width = (g / T * 100) + "%";
      ra.bar.setAttribute("aria-valuenow", Math.round(g / T * 100));
      ra.time.textContent = g > 0 ? `${fmt(g)} / ${fmt(T)}` : fmt(T);
      let ci = 0; RA.chapters.forEach((c, i) => { if (g >= c.t - 0.5) ci = i; });
      chapBtns.forEach((b, i) => b.classList.toggle("on", i === ci && g > 0));
    };
    const setIcon = () => {
      const playing = want;
      ra.btn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      ra.btn.setAttribute("aria-label", playing ? tr("Пауза") : tr("Слухати дослідження"));
      ra.btn.classList.toggle("wait", busy > 0);
    };
    async function go(g, play) {
      g = Math.min(Math.max(g, 0), T - 0.05);
      pos = g;
      const k = segAt(g), off = g - start[k];
      const ticket = ++busy; setIcon();
      try {
        if (k !== cur) {
          const src = await getBlob(k);
          if (ticket !== busy) return;
          cur = k; au.src = src; au.defaultPlaybackRate = au.playbackRate = speed;
          await new Promise((res) => au.addEventListener("loadedmetadata", res, { once: true }));
        }
        au.currentTime = off;
        if (play && want) await au.play();
        if (k + 1 < F.length) getBlob(k + 1).catch(() => {});          // наступний файл — наперед
      } catch { want = false; }
      finally { if (ticket === busy) busy = 0; setIcon(); ui(); }
    }
    ra.btn.addEventListener("click", () => {
      if (want) { want = false; au.pause(); setIcon(); return; }
      want = true; setIcon();
      if (cur >= 0 && au.src && Math.abs(start[cur] + au.currentTime - pos) < 1) au.play().catch(() => {}); else go(pos, true);
    });
    au.addEventListener("timeupdate", () => { if (cur >= 0) pos = start[cur] + au.currentTime; ui(); });
    au.addEventListener("ended", () => { if (cur < F.length - 1) go(start[cur + 1], true); else { want = false; pos = 0; setIcon(); ui(); } });
    au.addEventListener("pause", () => { if (!au.ended && want && !busy) { want = false; setIcon(); } });
    // шкала: клік / перетягування / стрілки
    const seekTo = (e) => { const r = ra.bar.getBoundingClientRect(); return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * T; };
    let drag = false;
    ra.bar.addEventListener("pointerdown", (e) => { drag = true; ra.bar.setPointerCapture(e.pointerId); pos = seekTo(e); ra.fill.style.width = (pos / T * 100) + "%"; });
    ra.bar.addEventListener("pointermove", (e) => { if (drag) { pos = seekTo(e); ra.fill.style.width = (pos / T * 100) + "%"; ra.time.textContent = `${fmt(pos)} / ${fmt(T)}`; } });
    ra.bar.addEventListener("pointerup", () => { if (!drag) return; drag = false; go(pos, want); });
    ra.bar.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 15 : e.key === "ArrowLeft" ? -15 : 0;
      if (d) { e.preventDefault(); go(pos + d, want); }
    });
    ra.chap.addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (!b) return; want = true; go(+b.dataset.t + 0.01, true); });
    // швидкість: 1× → 1,25× → 1,5×
    const SPEEDS = [1, 1.25, 1.5], label = (v) => (window.LANG === "en" ? String(v) : String(v).replace(".", ",")) + "×";
    ra.speedBtn.addEventListener("click", () => {
      speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
      au.defaultPlaybackRate = au.playbackRate = speed;
      ra.speedBtn.textContent = label(speed); ra.speedBtn.classList.toggle("on", speed !== 1);
      ra.speedBtn.setAttribute("aria-label", `${tr("Швидкість відтворення")}: ${label(speed)}`);
    });
    raPause = () => { want = false; au.pause(); setIcon(); };
    ui();
  })();

  function openPage() {
    if (open) return;
    savedY = scrollY;
    open = true;
    fillObjs();
    document.body.classList.add("rp-open");
    page.hidden = false;
    document.title = `${tr("Дослідження")} · ${tr("Невидимі шари пам’яті")}`;
    layoutFlow(true);
  }

  function closePage(hash) {
    if (!open) return;
    open = false;
    raPause();
    page.hidden = true;
    document.body.classList.remove("rp-open");
    document.title = titleDefault;
    if (hash.startsWith("#object-")) return;            // далі сторінку об’єкта відкриє object.js
    const map = window.RouteMap && window.RouteMap.map;
    if (map) map.resize();
    const el = hash.length > 1 && document.querySelector(hash);
    if (el) el.scrollIntoView({ behavior: "instant" }); else jump(savedY);
  }

  function route() {
    const h = location.hash, before = lastHash;
    lastHash = h;
    if (h === "#research" || h.startsWith("#r-")) {
      const fresh = !open;
      openPage();
      const target = h.startsWith("#r-") ? document.querySelector(h)
        : before.startsWith("#object-") ? document.querySelector("#r-art") : null;  // повернулися з об’єкта — до карток
      if (target) target.scrollIntoView({ behavior: "instant" });
      else if (fresh) jump(0);
    } else {
      closePage(h);
    }
  }
  addEventListener("hashchange", route);
  route();
})();
