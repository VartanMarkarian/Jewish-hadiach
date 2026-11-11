/* Ажурні рамки архівних відбитків: фестончастий край, перфорація, сліпе тиснення подвійної лінії
   і позолочені кутові завитки. SVG малюється під точний розмір елемента (без швів border-image)
   і стає його фоном. Товщина поля — CSS-змінна --b на елементі (px). Елементи: [data-lace]. */
(function () {
  const PAPER = "#ECE5D6";
  const n2 = (v) => +v.toFixed(2);

  function svg(w, h, b) {
    const f = b / 32, W = w / f, H = h / f;                 // малюємо в «одиницях» рамки 32
    const along = (len, step, from, to) => {                 // рівномірні точки на відрізку
      const n = Math.max(1, Math.round((to - from) / step));
      return Array.from({ length: n + 1 }, (_, k) => from + (to - from) * k / n);
    };
    let edge = "", holes = "";
    along(W, 8, 4, W - 4).forEach((x) => { edge += `<circle cx="${n2(x)}" cy="4" r="4.2"/><circle cx="${n2(x)}" cy="${n2(H - 4)}" r="4.2"/>`; });
    along(H, 8, 4, H - 4).forEach((y) => { edge += `<circle cx="4" cy="${n2(y)}" r="4.2"/><circle cx="${n2(W - 4)}" cy="${n2(y)}" r="4.2"/>`; });
    along(W, 8, 11.5, W - 11.5).forEach((x) => { holes += `<circle cx="${n2(x)}" cy="11.5" r="1.35"/><circle cx="${n2(x)}" cy="${n2(H - 11.5)}" r="1.35"/>`; });
    along(H, 8, 11.5, H - 11.5).slice(1, -1).forEach((y) => { holes += `<circle cx="11.5" cy="${n2(y)}" r="1.35"/><circle cx="${n2(W - 11.5)}" cy="${n2(y)}" r="1.35"/>`; });

    const rule = (o) => `<rect x="${o}" y="${o}" width="${n2(W - 2 * o)}" height="${n2(H - 2 * o)}" rx="1.5"/>`;
    const rules = rule(20) + rule(22.5);
    // кутовий завиток модерну з листками й перлиною (лівий верхній кут; решту дзеркалимо)
    const orn = `<path d="M17 36 C17 25 23 17 36 17"/><path d="M17 36 C14 31 14.5 26.5 18.5 25 C21.5 24 23 26.5 21.5 28.5"/>
      <path d="M36 17 C31 14 26.5 14.5 25 18.5 C24 21.5 26.5 23 28.5 21.5"/>
      <path class="f" d="M21 29.5 C22.5 25.5 25.5 22.5 29.5 21 C28 25 25 28 21 29.5 Z"/>
      <path class="f" d="M17 39.5 C16 41.5 16 43 17 44.5 C18 43 18 41.5 17 39.5 Z"/><path class="f" d="M39.5 17 C41.5 16 43 16 44.5 17 C43 18 41.5 18 39.5 17 Z"/>
      <circle class="f" cx="15" cy="15" r="1.8"/>`;
    const corners = ["", `translate(${n2(W)} 0) scale(-1 1)`, `translate(0 ${n2(H)}) scale(1 -1)`, `translate(${n2(W)} ${n2(H)}) scale(-1 -1)`]
      .map((t) => `<g transform="${t}">${orn}</g>`).join("");
    const layer = (col, d) => `<g transform="translate(${d} ${d})" fill="none" stroke="${col}" stroke-width=".8">${rules}</g>
      <g transform="translate(${d} ${d})" stroke="${col}" fill="${col}" stroke-width="1.1" stroke-linecap="round">${corners}</g>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${n2(W)} ${n2(H)}">
<defs><mask id="m"><g fill="#fff"><rect x="4" y="4" width="${n2(W - 8)}" height="${n2(H - 8)}"/>${edge}</g><g fill="#000">${holes}</g></mask>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E8D59C"/><stop offset=".5" stop-color="#B8A16A"/><stop offset="1" stop-color="#8A733F"/></linearGradient>
<style>path:not(.f){fill:none}</style></defs>
<g mask="url(#m)"><rect width="100%" height="100%" fill="${PAPER}"/>
${layer("rgba(255,255,255,.85)", -0.5)}${layer("rgba(110,86,46,.45)", 0.6)}
<g fill="none" stroke="${PAPER}" stroke-width=".8">${rules}</g>
<g stroke="url(#g)" fill="url(#g)" stroke-width="1.1" stroke-linecap="round">${corners}</g></g></svg>`;
  }

  const uri = (s) => `url("data:image/svg+xml,${encodeURIComponent(s.replace(/\s+/g, " "))}")`;

  function paint(el) {
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    const b = parseFloat(getComputedStyle(el).getPropertyValue("--b")) || 32;
    const key = `${w}x${h}x${b}`;
    if (!w || !h || el.dataset.laceKey === key) return;
    el.dataset.laceKey = key;
    el.style.backgroundImage = uri(svg(w, h, b));
  }

  const ro = new ResizeObserver((es) => es.forEach((e) => paint(e.target)));
  window.Lace = (el) => { paint(el); ro.observe(el); };
  document.querySelectorAll("[data-lace]").forEach(window.Lace);
})();
