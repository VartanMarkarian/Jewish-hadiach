/* Топографічні контурні лінії (marching squares) на canvas — фон у стилі «варіант фону 2». */
(function () {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function field(x, y, t, seed) {
    return Math.sin(x * 0.9 + t * 0.18 + Math.sin(y * 1.3 + seed) * 1.1) +
           Math.sin(y * 1.15 - t * 0.12 + Math.sin(x * 0.7 + seed * 2) * 1.3) +
           0.55 * Math.sin((x + y) * 1.6 + t * 0.09 + seed) +
           0.35 * Math.sin(x * 2.7 - y * 1.9 + seed * 3);
  }

  function Contours(canvas, opts) {
    const o = Object.assign({ cell: 14, levels: 22, alpha: 0.16, scale: 260, seed: 1, speed: 1 }, opts);
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, cols = 0, rows = 0, vals = null, t = 0, raf = 0, last = 0, visible = true;

    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / o.cell) + 1; rows = Math.ceil(h / o.cell) + 1;
      vals = new Float32Array(cols * rows);
      draw();
    }

    function draw() {
      if (!w || !h) return;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        vals[j * cols + i] = field(i * o.cell / o.scale, j * o.cell / o.scale, t, o.seed);
      }
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      const min = -2.6, max = 2.6, c = o.cell;
      for (let L = 0; L < o.levels; L++) {
        const iso = min + (max - min) * (L + 0.5) / o.levels;
        const a = o.alpha * (0.45 + 0.55 * Math.abs(Math.sin(L * 0.7)));
        ctx.strokeStyle = `rgba(216,209,197,${a.toFixed(3)})`;
        ctx.beginPath();
        for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
          const v0 = vals[j * cols + i], v1 = vals[j * cols + i + 1], v2 = vals[(j + 1) * cols + i + 1], v3 = vals[(j + 1) * cols + i];
          const idx = (v0 > iso ? 8 : 0) | (v1 > iso ? 4 : 0) | (v2 > iso ? 2 : 0) | (v3 > iso ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          const x = i * c, y = j * c;
          const top = [x + c * (iso - v0) / (v1 - v0), y];
          const right = [x + c, y + c * (iso - v1) / (v2 - v1)];
          const bottom = [x + c * (iso - v3) / (v2 - v3), y + c];
          const left = [x, y + c * (iso - v0) / (v3 - v0)];
          const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
          switch (idx) {
            case 1: case 14: seg(left, bottom); break;
            case 2: case 13: seg(bottom, right); break;
            case 3: case 12: seg(left, right); break;
            case 4: case 11: seg(top, right); break;
            case 6: case 9: seg(top, bottom); break;
            case 7: case 8: seg(left, top); break;
            case 5: seg(left, top); seg(bottom, right); break;
            case 10: seg(top, right); seg(left, bottom); break;
          }
        }
        ctx.stroke();
      }
    }

    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (!visible || now - last < 70) return;
      last = now; t += 0.035 * o.speed; draw();
    }

    new ResizeObserver(resize).observe(canvas);
    if (!reduce) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
      raf = requestAnimationFrame(loop);
    }
  }

  window.Contours = Contours;
})();
