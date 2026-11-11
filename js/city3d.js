/* Лінійне 3D-місто — власний WebGL-шар для MapLibre.
   Будинки з реальних контурів OSM: стіни, вікна по поверхах, міжповерхові лінії, вальмові / двосхилі / пласкі дахи.
   Сім будівель маршруту мають фасадний декор за фото локацій. Дерева, кущі, ялини й фонтан — інстансами. */
(function () {
  const C = {
    wall: [0.165, 0.145, 0.32], roof: [0.25, 0.21, 0.45], keyWall: [0.22, 0.19, 0.40],
    line: [0.73, 0.65, 0.85, 0.78], win: [0.85, 0.82, 0.77, 0.34], floor: [0.73, 0.65, 0.85, 0.22],
    key: [0.90, 0.86, 0.80, 0.95], keyWin: [0.90, 0.86, 0.80, 0.6],
    crown: [0.15, 0.20, 0.30], crownLine: [0.62, 0.74, 0.80, 0.55], trunk: [0.62, 0.74, 0.80, 0.4]
  };
  const LIGHT = norm([-0.45, -0.6, 0.66]);
  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const shadeOf = (n) => 0.6 + 0.4 * Math.abs(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);

  /* ---------- накопичувачі геометрії ---------- */
  const F = [], L = [];
  function tri(a, b, c, col, k) {
    const s = shadeOf(norm(cross(sub(b, a), sub(c, a))));
    for (const p of [a, b, c]) F.push(p[0], p[1], p[2], col[0] * s, col[1] * s, col[2] * s, k);
  }
  const quad = (a, b, c, d, col, k) => { tri(a, b, c, col, k); tri(a, c, d, col, k); };
  function seg(a, b, col, k) { L.push(a[0], a[1], a[2], col[0], col[1], col[2], col[3], k, b[0], b[1], b[2], col[0], col[1], col[2], col[3], k); }
  function poly(pts, col, k, close = true) { for (let i = 0; i < pts.length - (close ? 0 : 1); i++) seg(pts[i], pts[(i + 1) % pts.length], col, k); }
  const at = (p2, z) => [p2[0], p2[1], z];
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  /* точка на стіні: уздовж (u, 0..1), висота z, відступ назовні d */
  function wallPt(w, t, z, d = 0.08) { return [w.a[0] + w.ux * w.len * t + w.nx * d, w.a[1] + w.uy * w.len * t + w.ny * d, z]; }
  function arc(w, tc, zc, r, from = 0, to = Math.PI, n = 10, d = 0.08) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = from + (to - from) * (i / n);
      out.push([w.a[0] + w.ux * (w.len * tc + Math.cos(a) * r) + w.nx * d, w.a[1] + w.uy * (w.len * tc + Math.cos(a) * r) + w.ny * d, zc + Math.sin(a) * r]);
    }
    return out;
  }
  function windowAt(w, tc, z0, ww, wh, col, k, arched) {
    const hw = ww / 2 / w.len;
    if (arched) {
      const zs = z0 + wh - ww / 2;
      seg(wallPt(w, tc - hw, z0), wallPt(w, tc + hw, z0), col, k);
      seg(wallPt(w, tc - hw, z0), wallPt(w, tc - hw, zs), col, k);
      seg(wallPt(w, tc + hw, z0), wallPt(w, tc + hw, zs), col, k);
      poly(arc(w, tc, zs, ww / 2, 0, Math.PI, 8), col, k, false);
    } else {
      poly([wallPt(w, tc - hw, z0), wallPt(w, tc + hw, z0), wallPt(w, tc + hw, z0 + wh), wallPt(w, tc - hw, z0 + wh)], col, k);
      seg(wallPt(w, tc, z0), wallPt(w, tc, z0 + wh), [col[0], col[1], col[2], col[3] * 0.5], k);
    }
  }

  const PLINTH = 0.7, FLOOR = 3.2;

  function building(b) {
    const P = []; for (let i = 0; i < b.p.length; i += 2) P.push([b.p[i], b.p[i + 1]]);
    const n = P.length, k = b.k ?? -1, isKey = k >= 0;
    const H = PLINTH + b.lv * FLOOR - 0.4;
    const lineC = isKey ? C.key : C.line, winC = isKey ? C.keyWin : C.win, wallC = isKey ? C.keyWall : C.wall;
    const walls = [];
    for (let i = 0; i < n; i++) {
      const a = P[i], c = P[(i + 1) % n], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const ux = (c[0] - a[0]) / len, uy = (c[1] - a[1]) / len;
      const w = { a, c, len, ux, uy, nx: uy, ny: -ux, i };
      walls.push(w);
      quad(at(a, 0), at(c, 0), at(c, H), at(a, H), wallC, k);
      seg(at(a, 0), at(a, H), lineC, k);
      seg(at(a, H), at(c, H), lineC, k);
      seg(at(a, 0), at(c, 0), [lineC[0], lineC[1], lineC[2], lineC[3] * 0.5], k);
      if (isKey) seg(wallPt(w, 0, PLINTH, 0.02), wallPt(w, 1, PLINTH, 0.02), C.floor, k);
      for (let f = 1; f < b.lv; f++) seg(wallPt(w, 0, PLINTH + f * FLOOR - 0.15, 0.02), wallPt(w, 1, PLINTH + f * FLOOR - 0.15, 0.02), b.d === "cornice" ? C.keyWin : C.floor, k);
      // вікна
      if (len < 2.6 || b.d === "dome") continue;
      const front = b.f === i;
      const cnt = Math.floor((len - 1.2) / (isKey ? 2.4 : 2.7));
      for (let f = 0; f < b.lv; f++) {
        const z0 = PLINTH + f * FLOOR + 0.8, wh = f === 0 ? 1.5 : 1.65, ww = isKey ? 1.15 : 1.05;
        for (let j = 0; j < cnt; j++) {
          const tc = (j + 0.5) / cnt;
          if (front && f === 0 && /pediment|portal/.test(b.d || "") && Math.abs(tc - 0.5) < 0.6 / cnt) continue; // двері по центру
          windowAt(w, tc, z0, ww, wh, winC, k, !!b.a && (front || f > 0 || isKey));
        }
      }
    }
    roof(b, P, H, k, lineC, walls);
    if (isKey) decorate(b, walls, H, k);
    if (b.d === "dome") dome(P, H, k);
  }

  function roof(b, P, H, k, lineC, walls) {
    if (b.r === "f" || P.length !== 4) {
      const t = b.t || [];
      for (let i = 0; i + 2 < t.length; i += 3) tri(at(P[t[i]], H), at(P[t[i + 1]], H), at(P[t[i + 2]], H), C.roof, k);
      const par = P.map((p) => at(p, H + 0.45));
      poly(par, [lineC[0], lineC[1], lineC[2], lineC[3] * 0.6], k);
      P.forEach((p, i) => { const q = P[(i + 1) % P.length]; quad(at(p, H), at(q, H), at(q, H + 0.45), at(p, H + 0.45), C.wall, k); });
      return;
    }
    // прямокутник: q0q1 — довга сторона
    let q = P.slice();
    if (Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) < Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])) q = [q[1], q[2], q[3], q[0]];
    const Lg = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), W = Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1]);
    const u = [(q[1][0] - q[0][0]) / Lg, (q[1][1] - q[0][1]) / Lg];
    const rh = Math.min(Math.max(W * (b.r === "g" ? 0.4 : 0.3), 1.2), 4.2);
    const m03 = lerp2(q[3], q[0], 0.5), m12 = lerp2(q[1], q[2], 0.5), Z = H + rh;
    let r0, r1;
    if (b.r === "g") { r0 = at(m03, Z); r1 = at(m12, Z); }
    else {
      const ins = Math.min(W / 2, Lg / 2);
      r0 = [m03[0] + u[0] * ins, m03[1] + u[1] * ins, Z]; r1 = [m12[0] - u[0] * ins, m12[1] - u[1] * ins, Z];
    }
    const e = q.map((p) => at(p, H));
    quad(e[0], e[1], r1, r0, C.roof, k);
    quad(e[2], e[3], r0, r1, C.roof, k);
    tri(e[1], e[2], r1, b.r === "g" ? C.wall : C.roof, k);
    tri(e[3], e[0], r0, b.r === "g" ? C.wall : C.roof, k);
    seg(r0, r1, lineC, k);
    [[e[0], r0], [e[3], r0], [e[1], r1], [e[2], r1]].forEach(([a, c]) => seg(a, c, lineC, k));
    if (b.r === "g" && W > 5) { // віконце на фронтоні
      const mid = lerp2(q[1], q[2], 0.5);
      poly([[mid[0], mid[1], H + rh * 0.25], [mid[0], mid[1], H + rh * 0.62]], C.win, k, false);
    }
  }

  function decorate(b, walls, H, k) {
    const w = walls[b.f ?? 0]; if (!w) return;
    const col = C.key, soft = C.keyWin;
    const fill = (pts, base) => { for (let i = 0; i < pts.length - 1; i++) tri(base, pts[i], pts[i + 1], C.keyWall, k); };
    const semicircle = (tc, r, z) => {
      const outer = arc(w, tc, z, r, 0, Math.PI, 14, 0.18);
      fill(outer, wallPt(w, tc, z, 0.18));
      poly(outer, col, k, false);
      poly(arc(w, tc, z, r * 0.78, 0, Math.PI, 12, 0.2), soft, k, false);
      seg(wallPt(w, tc - r / w.len, z, 0.2), wallPt(w, tc + r / w.len, z, 0.2), col, k);
    };
    const pilaster = (t) => seg(wallPt(w, t, 0, 0.16), wallPt(w, t, H, 0.16), soft, k);
    const door = (tc, wd = 1.5, hd = 2.5, arched = true) => windowAt(w, tc, PLINTH - 0.1, wd, hd, col, k, arched);

    if (b.d === "pediment") {           // колишня синагога: ризаліт з напівкруглим фронтоном
      const r = Math.min(2.8, w.len * 0.16);
      semicircle(0.5, r, H);
      pilaster(0.5 - (r * 1.15) / w.len); pilaster(0.5 + (r * 1.15) / w.len);
      windowAt(w, 0.5, H + 0.25, 0.9, 1.1, soft, k, true);
      door(0.5);
    } else if (b.d === "gables3") {     // музей: три фігурні фронтони з арочними вікнами
      const r = Math.min(2.6, w.len / 7.5);
      [1 / 6, 0.5, 5 / 6].forEach((t) => {
        semicircle(t, r, H);
        windowAt(w, t, H + 0.2, 0.8, r * 0.75, soft, k, true);
        pilaster(t - (r * 1.1) / w.len); pilaster(t + (r * 1.1) / w.len);
      });
      door(0.5, 1.6, 2.6);
    } else if (b.d === "attic") {       // аттик над центром фасаду
      const hw = Math.min(3.4, w.len * 0.2) / w.len, ah = 1.7;
      const pts = [wallPt(w, 0.5 - hw, H, 0.18), wallPt(w, 0.5 + hw, H, 0.18), wallPt(w, 0.5 + hw, H + ah, 0.18), wallPt(w, 0.5 - hw, H + ah, 0.18)];
      quad(pts[0], pts[1], pts[2], pts[3], C.keyWall, k); poly(pts, col, k);
      const cap = arc(w, 0.5, H + ah, 1.0, 0, Math.PI, 10, 0.18); fill(cap, wallPt(w, 0.5, H + ah, 0.18)); poly(cap, col, k, false);
      pilaster(0.5 - hw); pilaster(0.5 + hw);
      // балкон другого поверху
      const bz = PLINTH + FLOOR - 0.1;
      poly([wallPt(w, 0.5 - 1.6 / w.len, bz, 0.1), wallPt(w, 0.5 - 1.6 / w.len, bz, 0.9), wallPt(w, 0.5 + 1.6 / w.len, bz, 0.9), wallPt(w, 0.5 + 1.6 / w.len, bz, 0.1)], col, k, false);
      poly([wallPt(w, 0.5 - 1.6 / w.len, bz + 0.9, 0.9), wallPt(w, 0.5 + 1.6 / w.len, bz + 0.9, 0.9)], soft, k, false);
    } else if (b.d === "portal") {      // школа: центральний вхід з трикутним сандриком
      const hw = 1.6 / w.len;
      door(0.5, 1.6, 2.5, false);
      poly([wallPt(w, 0.5 - hw, 3.3, 0.2), wallPt(w, 0.5, 4.2, 0.2), wallPt(w, 0.5 + hw, 3.3, 0.2)], col, k);
      pilaster(0.5 - hw * 1.3); pilaster(0.5 + hw * 1.3);
    }
  }

  function dome(P, H, k) {
    let cx = 0, cy = 0; P.forEach((p) => { cx += p[0]; cy += p[1]; }); cx /= P.length; cy /= P.length;
    const R = 3.4, D = 4, N = 12, base = H + 0.45;
    const ring = (r, z) => Array.from({ length: N }, (_, i) => [cx + Math.cos((i / N) * 2 * Math.PI) * r, cy + Math.sin((i / N) * 2 * Math.PI) * r, z]);
    const b0 = ring(R, base), b1 = ring(R, base + D);
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; quad(b0[i], b0[j], b1[j], b1[i], C.keyWall, k); seg(b0[i], b1[i], C.line, k); }
    poly(b1, C.line, k); poly(b0, C.line, k);
    let prev = b1;
    for (let s = 1; s <= 4; s++) {
      const a = (s / 4) * Math.PI / 2, cur = ring(R * Math.cos(a) + 0.001, base + D + R * Math.sin(a) * 1.1);
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; quad(prev[i], prev[j], cur[j], cur[i], C.roof, k); seg(prev[i], cur[i], C.line, k); }
      if (s < 4) poly(cur, C.floor, k);
      prev = cur;
    }
    const top = base + D + R * 1.1;
    seg([cx, cy, top], [cx, cy, top + 3], C.key, k);
    seg([cx - 0.8, cy, top + 2.2], [cx + 0.8, cy, top + 2.2], C.key, k);
  }

  function fountain(f) {
    const [cx, cy] = f, N = 20;
    const ring = (r, z) => Array.from({ length: N }, (_, i) => [cx + Math.cos((i / N) * 2 * Math.PI) * r, cy + Math.sin((i / N) * 2 * Math.PI) * r, z]);
    const b0 = ring(3.4, 0), b1 = ring(3.4, 0.6), in1 = ring(2.9, 0.6);
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; quad(b0[i], b0[j], b1[j], b1[i], C.keyWall, 0); }
    poly(b1, C.key, 0); poly(in1, C.keyWin, 0); poly(b0, C.keyWin, 0);
    const c0 = ring(0.35, 0.6), c1 = ring(0.35, 1.8);
    for (let i = 0; i < N; i += 5) seg(c0[i], c1[i], C.key, 0);
    const bowl = ring(1.3, 1.9), bowlLow = ring(0.4, 1.6);
    poly(bowl, C.key, 0);
    for (let i = 0; i < N; i += 4) seg(bowlLow[i], bowl[i], C.keyWin, 0);
    seg([cx, cy, 1.9], [cx, cy, 2.9], C.keyWin, 0);
    // лавки
    for (let s = 0; s < 4; s++) {
      const a = (s / 4) * 2 * Math.PI + Math.PI / 4, r = 7, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const tx = -Math.sin(a), ty = Math.cos(a), hl = 1.0;
      poly([[x - tx * hl, y - ty * hl, 0.45], [x + tx * hl, y + ty * hl, 0.45]], C.keyWin, 0, false);
      poly([[x - tx * hl + Math.cos(a) * 0.3, y - ty * hl + Math.sin(a) * 0.3, 0.9], [x + tx * hl + Math.cos(a) * 0.3, y + ty * hl + Math.sin(a) * 0.3, 0.9]], C.keyWin, 0, false);
      seg([x - tx * hl, y - ty * hl, 0], [x - tx * hl, y - ty * hl, 0.45], C.keyWin, 0);
      seg([x + tx * hl, y + ty * hl, 0], [x + tx * hl, y + ty * hl, 0.45], C.keyWin, 0);
    }
  }

  /* ---------- шаблони дерев (одиничний розмір) ---------- */
  function icosa(r, zc, sz = 1) {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map((p) => { const l = Math.hypot(...p); return [p[0] / l * r, p[1] / l * r, p[2] / l * r * sz + zc]; });
    const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    return { v, f };
  }
  function template(kind) {
    const faces = [], lines = [];
    const addMesh = ({ v, f }) => {
      const edges = new Set();
      f.forEach(([a, b, c]) => {
        const s = shadeOf(norm(cross(sub(v[b], v[a]), sub(v[c], v[a]))));
        faces.push(...v[a], s, ...v[b], s, ...v[c], s);
        [[a, b], [b, c], [c, a]].forEach(([x, y]) => { const key = x < y ? x + "_" + y : y + "_" + x; if (!edges.has(key)) { edges.add(key); lines.push(...v[x], 1, ...v[y], 1); } });
      });
    };
    if (kind === 0) { addMesh(icosa(2.3, 4.7, 0.92)); lines.push(0, 0, 0, 1, 0, 0, 2.6, 1); }
    else if (kind === 1) {
      const N = 7, v = [], f = [];
      for (let i = 0; i < N; i++) v.push([Math.cos(i / N * 2 * Math.PI) * 1.9, Math.sin(i / N * 2 * Math.PI) * 1.9, 1.3]);
      v.push([0, 0, 8.2]);
      for (let i = 0; i < N; i++) f.push([i, (i + 1) % N, N]);
      for (let i = 1; i < N - 1; i++) f.push([0, i, i + 1]);
      addMesh({ v, f }); lines.push(0, 0, 0, 1, 0, 0, 1.3, 1);
    } else addMesh(icosa(1.15, 0.85, 0.7));
    return { faces: new Float32Array(faces), lines: new Float32Array(lines) };
  }

  /* ---------- WebGL ---------- */
  const VS_STATIC = `
    attribute vec3 a_pos; attribute vec4 a_col; attribute float a_key;
    uniform mat4 u_m; uniform float u_active; uniform float u_lines;
    varying vec4 v_col;
    void main() {
      gl_Position = u_m * vec4(a_pos, 1.0);
      vec4 c = a_col;
      if (abs(a_key - u_active) < 0.5) c = u_lines > 0.5 ? vec4(1.0, 0.9, 0.62, min(1.0, c.a + 0.25)) : vec4(c.rgb + vec3(0.06, 0.05, 0.02), 1.0);
      v_col = c;
    }`;
  const VS_INST = `
    attribute vec4 a_tpl; attribute vec4 a_inst;
    uniform mat4 u_m; uniform vec4 u_col;
    varying vec4 v_col;
    void main() {
      float c = cos(a_inst.w), s = sin(a_inst.w);
      vec2 xy = mat2(c, s, -s, c) * a_tpl.xy * a_inst.z + a_inst.xy;
      gl_Position = u_m * vec4(xy, a_tpl.z * a_inst.z, 1.0);
      v_col = vec4(u_col.rgb * a_tpl.w, u_col.a);
    }`;
  const FS = `precision mediump float; varying vec4 v_col; void main() { gl_FragColor = vec4(v_col.rgb * v_col.a, v_col.a); }`;

  function program(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  window.createCityLayer = function (maplibregl) {
    const D = window.CITY; if (!D) return null;
    D.b.forEach(building);
    fountain(D.fountain);
    const faces = new Float32Array(F), lines = new Float32Array(L);
    F.length = 0; L.length = 0;
    const kinds = [[], [], []];
    D.t.forEach(([x, y, kd, s], i) => kinds[kd].push(x, y, s, (i * 2.399) % 6.283));
    const tpl = [0, 1, 2].map(template);

    const mc = maplibregl.MercatorCoordinate.fromLngLat(D.origin, 0), sc = mc.meterInMercatorCoordinateUnits();
    let active = -1, gl, P1, P2, buf = {}, inst = null, vao = null, isGL2 = false;

    function mul(a, b) {
      const o = new Float64Array(16);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s;
      }
      return o;
    }
    const model = [sc, 0, 0, 0, 0, -sc, 0, 0, 0, 0, sc, 0, mc.x, mc.y, 0, 1];

    const mk = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
    function divisor(loc, d) { if (isGL2) gl.vertexAttribDivisor(loc, d); else inst.vertexAttribDivisorANGLE(loc, d); }
    function drawInst(mode, n, count) { if (isGL2) gl.drawArraysInstanced(mode, 0, n, count); else inst.drawArraysInstancedANGLE(mode, 0, n, count); }

    return {
      id: "city3d", type: "custom", renderingMode: "3d",
      setActive(i) { active = i; },
      onAdd(map, g) {
        gl = g; isGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
        inst = isGL2 ? null : gl.getExtension("ANGLE_instanced_arrays");
        vao = isGL2 ? null : gl.getExtension("OES_vertex_array_object");
        P1 = program(gl, VS_STATIC, FS); P2 = program(gl, VS_INST, FS);
        buf.faces = mk(faces); buf.lines = mk(lines); buf.nf = faces.length / 7; buf.nl = lines.length / 8;
        buf.tpl = tpl.map((t) => ({ f: mk(t.faces), nf: t.faces.length / 4, l: mk(t.lines), nl: t.lines.length / 4 }));
        buf.inst = kinds.map((a) => ({ b: mk(new Float32Array(a)), n: a.length / 4 }));
      },
      render(g, args) {
        const m = (args && (args.modelViewProjectionMatrix || (args.defaultProjectionData && args.defaultProjectionData.mainMatrix))) || args;
        const M = new Float32Array(mul(m, model));
        if (isGL2) gl.bindVertexArray(null); else if (vao) vao.bindVertexArrayOES(null);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.CULL_FACE);

        // статична геометрія
        gl.useProgram(P1);
        const aPos = gl.getAttribLocation(P1, "a_pos"), aCol = gl.getAttribLocation(P1, "a_col"), aKey = gl.getAttribLocation(P1, "a_key");
        gl.uniformMatrix4fv(gl.getUniformLocation(P1, "u_m"), false, M);
        gl.uniform1f(gl.getUniformLocation(P1, "u_active"), active);
        const uLines = gl.getUniformLocation(P1, "u_lines");
        // обличчя: RGB + ключ (альфа = 1)
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.faces);
        gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
        gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 28, 12);
        gl.enableVertexAttribArray(aKey); gl.vertexAttribPointer(aKey, 1, gl.FLOAT, false, 28, 24);
        gl.vertexAttrib4f(aCol, 0, 0, 0, 1);
        gl.uniform1f(uLines, 0);
        gl.depthMask(true);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
        gl.drawArrays(gl.TRIANGLES, 0, buf.nf);
        // лінії
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.lines);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 32, 0);
        gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 32, 12);
        gl.vertexAttribPointer(aKey, 1, gl.FLOAT, false, 32, 28);
        gl.uniform1f(uLines, 1);
        gl.depthMask(false);
        gl.drawArrays(gl.LINES, 0, buf.nl);
        gl.disableVertexAttribArray(aPos); gl.disableVertexAttribArray(aCol); gl.disableVertexAttribArray(aKey);

        // дерева
        if (isGL2 || inst) {
          gl.useProgram(P2);
          const aT = gl.getAttribLocation(P2, "a_tpl"), aI = gl.getAttribLocation(P2, "a_inst");
          const uCol = gl.getUniformLocation(P2, "u_col");
          gl.uniformMatrix4fv(gl.getUniformLocation(P2, "u_m"), false, M);
          gl.enableVertexAttribArray(aT); gl.enableVertexAttribArray(aI);
          buf.tpl.forEach((t, kd) => {
            const ib = buf.inst[kd]; if (!ib.n) return;
            gl.bindBuffer(gl.ARRAY_BUFFER, ib.b); gl.vertexAttribPointer(aI, 4, gl.FLOAT, false, 16, 0); divisor(aI, 1);
            gl.bindBuffer(gl.ARRAY_BUFFER, t.f); gl.vertexAttribPointer(aT, 4, gl.FLOAT, false, 16, 0);
            gl.uniform4f(uCol, ...C.crown, 1); gl.depthMask(true);
            drawInst(gl.TRIANGLES, t.nf, ib.n);
            gl.bindBuffer(gl.ARRAY_BUFFER, t.l); gl.vertexAttribPointer(aT, 4, gl.FLOAT, false, 16, 0);
            gl.uniform4f(uCol, ...C.crownLine); gl.depthMask(false);
            drawInst(gl.LINES, t.nl, ib.n);
          });
          divisor(aI, 0);
          gl.disableVertexAttribArray(aT); gl.disableVertexAttribArray(aI);
        }
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.depthMask(true);
      }
    };
  };
})();
