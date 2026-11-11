/* Невидимі шари пам’яті — мови сайту: українська (основна) і англійська.
   Мову визначає скрипт у <head> (window.LANG: ?lang=en|uk, інакше збережений вибір) і для англійської
   підвантажує словник js/i18n-en.js (window.I18N_EN: «український текст» → «англійський»; збирає tools/i18n/build.py).
   Тут: tr() для рядків у скриптах, переклад статичної розмітки й даних (STOPS, ARCHIVE, RESEARCH_AUDIO), перемикач мов.
   Ключі — текст зі стиснутими пробілами. Чого немає в словнику, лишається українською (список — window.I18N_MISSING). */
(function () {
  const LANG = window.LANG === "en" ? "en" : "uk";
  const D = (LANG === "en" && window.I18N_EN) || {};
  const CY = /[А-Яа-яЇїІіЄєҐґ]/;
  const norm = (s) => String(s).replace(/\s+/g, " ").trim();
  const missing = new Set();
  const look = (s) => {
    const k = norm(s);
    if (k in D) return D[k];
    if (CY.test(k)) missing.add(k);
    return null;
  };
  window.tr = (s) => (LANG === "en" && s ? look(s) ?? s : s);
  window.qq = (s) => (LANG === "en" ? `“${s}”` : `«${s}»`);   // лапки за мовою
  window.I18N_MISSING = missing;

  /* перемикач: запам’ятати вибір і перезавантажити ту саму сторінку (з тим самим #розділом) */
  document.querySelectorAll("[data-lang]").forEach((a) => {
    a.classList.toggle("on", a.dataset.lang === LANG);
    if (a.dataset.lang === LANG) a.setAttribute("aria-current", "true");
    a.addEventListener("click", (e) => {
      e.preventDefault();
      if (a.dataset.lang === LANG) return;
      try { localStorage.setItem("lang", a.dataset.lang); } catch (err) { /* приватний режим */ }
      const u = new URL(location.href);
      u.searchParams.set("lang", a.dataset.lang);
      location.href = u.href;
    });
  });
  if (LANG !== "en") return;

  /* статична розмітка: текстові вузли й атрибути */
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n; (n = walker.nextNode());) {
    const v = n.nodeValue;
    if (!CY.test(v)) continue;
    const t = look(v);
    if (t !== null) n.nodeValue = v.match(/^\s*/)[0] + t + v.match(/\s*$/)[0];
  }
  document.querySelectorAll("[alt],[title],[aria-label],[placeholder]").forEach((el) => {
    ["alt", "title", "aria-label", "placeholder"].forEach((a) => {
      const v = el.getAttribute(a);
      if (v && CY.test(v)) { const t = look(v); if (t !== null) el.setAttribute(a, t); }
    });
  });
  const desc = document.querySelector('meta[name="description"]');
  if (desc) { const t = look(desc.content); if (t !== null) desc.content = t; }
  document.title = tr(document.title);

  /* дані сайту */
  const deep = (o) => {
    if (Array.isArray(o)) return o.map(deep);
    if (o && typeof o === "object") { for (const k in o) o[k] = deep(o[k]); return o; }
    if (typeof o === "string" && CY.test(o)) { const t = look(o); return t === null ? o : t; }
    return o;
  };
  ["STOPS", "ARCHIVE", "RESEARCH_AUDIO"].forEach((g) => { if (window[g]) deep(window[g]); });

  if (missing.size) console.info(`i18n: без перекладу ${missing.size} рядків — window.I18N_MISSING`);
})();
