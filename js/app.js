/* Невидимі шари пам’яті — загальна логіка: шапка, фон, архів-конверт, сітка об’єктів. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const pad = (n) => String(n).padStart(2, "0");

  /* координати у форматі 50°22′24.2″ N */
  window.dms = function (v, pos, neg) {
    const s = v < 0 ? neg : pos; v = Math.abs(v);
    const d = Math.floor(v), mf = (v - d) * 60, m = Math.floor(mf), sec = ((mf - m) * 60).toFixed(1);
    return `${d}°${pad(m)}′${sec.padStart(4, "0")}″ ${s}`;
  };

  /* ---------- шапка ---------- */
  const top = $("#top");
  const onScroll = () => top.classList.toggle("solid", window.scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  const nav = $("#nav"), menuBtn = $("#menuBtn");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); } });

  /* ---------- контурний фон ---------- */
  Contours($("#heroContours"), { seed: 1.3, alpha: 0.17, scale: 300 });
  Contours($("#routeContours"), { seed: 4.1, alpha: 0.09, scale: 340, levels: 18 });
  if ($("#studyContours")) Contours($("#studyContours"), { seed: 6.2, alpha: 0.15, scale: 300 });

  /* ---------- архів: конверт і відбитки ---------- */
  const A = window.ARCHIVE;
  const media = $("#printMedia"), minis = $("#minis");
  let ai = 0;

  /* шар відбитка: ШІ-відео + оригінал фото поверх нього (видно на паузі) */
  let showOrig = false;                       // режим «оригінал» зберігається при перемиканні фото
  function mediaEl(item) {
    const w = document.createElement("div");
    w.className = "pm-layer";
    if (item.video) {
      const v = document.createElement("video");
      Object.assign(v, { src: item.video, poster: item.img, muted: true, loop: true, autoplay: !showOrig, playsInline: true });
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      w.append(v);
    } else {
      const im = new Image(); im.src = item.img; im.alt = `${item.title}, ${item.date}`;
      w.append(im);
    }
    if (item.orig) {
      const o = new Image(); o.className = "orig"; o.src = item.orig; o.alt = `Оригінал фото: ${item.title}. ${item.date || ""}`;
      w.append(o);
    }
    return w;
  }

  const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5v11l9-5.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx=".6" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx=".6" fill="currentColor"/></svg>';
  function applyMode() {
    const item = A[ai], orig = showOrig && !!item.orig;
    media.classList.toggle("show-orig", orig);
    media.style.aspectRatio = orig && item.origRatio ? String(item.origRatio) : "";
    const v = media.querySelector(".pm-layer:not(.out) video");
    if (v) { if (orig) v.pause(); else v.play().catch(() => {}); }
    const live = $("#aiLive");
    live.innerHTML = orig ? ICON_PLAY : ICON_PAUSE;
    live.setAttribute("aria-pressed", String(orig));
    live.setAttribute("aria-label", orig ? "Оживити фото (ШІ-відео)" : "Пауза: показати оригінал фото");
    $("#aiLiveTip").textContent = orig ? "Оригінал фото · ▶ — оживити" : "Пауза — показати оригінал фото";
    $("#printTag").textContent = orig ? "Оригінал фото" : "Оживлено ШІ";
  }

  function showArchive(i, instant) {
    ai = (i + A.length) % A.length;
    const item = A[ai];
    const el = mediaEl(item);
    if (!instant) el.classList.add("out");
    const old = [...media.children];
    media.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.remove("out");
      old.forEach((o) => { o.classList.add("out"); setTimeout(() => o.remove(), 800); });
    }));
    $("#aiTitle").textContent = item.title;
    $("#aiNote").textContent = item.note;
    $("#aiNote").hidden = !item.note;
    // підпис: дата, автори/колекція, джерело з посиланням
    const meta = $("#aiMeta");
    meta.replaceChildren(...[item.date, ...(item.credits || [])].map((t, k) => {
      const sp = document.createElement("span"); sp.textContent = t; if (!k) sp.className = "d"; return sp;
    }).filter((sp) => sp.textContent));
    if (item.source) {
      const sp = document.createElement("span"), a = document.createElement("a");
      sp.append("Джерело: ");
      a.href = item.source.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = item.source.label;
      sp.append(a); meta.append(sp);
    }
    $("#aiCount").textContent = `${pad(ai + 1)} / ${pad(A.length)}`;
    $("#aiLive").classList.toggle("live", !!item.video);
    applyMode();
    minis.querySelectorAll(".mini").forEach((m, k) => m.classList.toggle("on", k === ai));
  }

  const tilt = [-7, 5, -3, 8, -5];
  const spots = [[0, 20], [20, 2], [40, 28], [58, 6], [76, 24]];
  A.forEach((item, k) => {
    const b = document.createElement("button");
    b.className = "mini";
    b.style.left = spots[k % 5][0] + "%"; b.style.top = spots[k % 5][1] + "%";
    b.style.transform = `rotate(${tilt[k % 5]}deg)`;
    b.setAttribute("aria-label", `Показати: ${item.title}`);
    b.innerHTML = `<img src="${item.img}" alt="" loading="lazy">`;
    b.addEventListener("click", () => showArchive(k));
    minis.appendChild(b);
    if (window.Lace) window.Lace(b);
  });
  $("#aiNext").addEventListener("click", () => showArchive(ai + 1));
  $("#aiLive").addEventListener("click", () => { showOrig = !showOrig; applyMode(); });
  showArchive(0, true);

  /* план маршруту на рожевому аркуші — з тих самих координат, що й мапа */
  (function plan() {
    const svg = $("#planSvg"); if (!svg) return;
    const all = window.LEGS.flat();
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.min(260 / (maxX - minX), 180 / ((maxY - minY) * 1.56));
    const P = (p) => [20 + (p[0] - minX) * k, 200 - (p[1] - minY) * k * 1.56];
    const d = all.map((p, i) => (i ? "L" : "M") + P(p).map((v) => v.toFixed(1)).join(",")).join(" ");
    let out = `<g fill="none" stroke="#2D2756" stroke-linecap="round" stroke-linejoin="round">
      <path d="${d}" stroke-width="5" opacity=".12"/>
      <path d="${d}" stroke-width="1.4" stroke-dasharray="5 4"/></g>`;
    window.STOPS.forEach((s) => {
      const [x, y] = P(s.ll);
      // без цифр — лише точки, як олівцеві позначки на старому плані
      out += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="6.5" fill="none" stroke="#2D2756" stroke-width="1.2"/>
        <circle r="2.2" fill="#2D2756"/></g>`;
    });
    svg.innerHTML = out;
  })();

  /* ---------- сітка об’єктів ---------- */
  const grid = $("#objGrid");
  window.STOPS.forEach((s) => {
    const el = document.createElement("article");
    el.className = "obj"; el.id = `obj-${s.n}`;
    el.innerHTML = `
      <a class="obj-img" href="#object-${s.key}" tabindex="-1" aria-hidden="true"><span class="obj-n">ОБ’ЄКТ ${pad(s.n)}</span><span class="obj-3d mono">3D · AR</span><img src="${s.render}" alt="" loading="lazy"></a>
      <div class="obj-body">
        <p class="obj-point">Точка ${s.n} · ${s.addr}</p>
        <h3><a href="#object-${s.key}">${s.name}</a></h3>
        <p class="obj-concept"><span>Концептуальний образ</span>${s.concept}</p>
        <p class="obj-short">${s.short}</p>
        <div class="obj-acts">
          <a class="line-link sm" href="#object-${s.key}">Відкрити об’єкт <i aria-hidden="true"></i></a>
          <button class="obj-go mono" data-go="${s.n - 1}">На мапі</button>
        </div>
      </div>`;
    grid.appendChild(el);
  });
  grid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    $("#route").scrollIntoView({ behavior: "smooth" });
    setTimeout(() => window.RouteMap && window.RouteMap.go(+b.dataset.go), 500);
  });
})();
