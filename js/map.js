/* Тривимірна мапа маршруту: MapLibre GL + векторні тайли OpenFreeMap (дані OpenStreetMap).
   Мапа стоїть на першій точці; клік по вулиці — камера «йде» маршрутом до наступної точки. */
(function () {
  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, "0");
  const STOPS = window.STOPS, LEGS = window.LEGS, N = STOPS.length;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- геометрія маршруту ---------- */
  const R = Math.PI / 180;
  const meters = (a, b) => {
    const dx = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * R) * 111320;
    const dy = (b[1] - a[1]) * 110540;
    return Math.hypot(dx, dy);
  };
  const bearing = (a, b) => {
    const y = Math.sin((b[0] - a[0]) * R) * Math.cos(b[1] * R);
    const x = Math.cos(a[1] * R) * Math.sin(b[1] * R) - Math.sin(a[1] * R) * Math.cos(b[1] * R) * Math.cos((b[0] - a[0]) * R);
    return Math.atan2(y, x) / R;
  };

  const path = [LEGS[0][0]];
  const wp = [0]; // дистанція кожної точки вздовж маршруту
  LEGS.forEach((leg) => { leg.slice(1).forEach((p) => path.push(p)); });
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + meters(path[i - 1], path[i]));
  let acc = 0;
  LEGS.forEach((leg) => { for (let i = 1; i < leg.length; i++) acc += meters(leg[i - 1], leg[i]); wp.push(acc); });
  const TOTAL = cum[cum.length - 1];

  function pointAt(d) {
    d = Math.max(0, Math.min(TOTAL, d));
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1, t = (d - cum[i - 1]) / seg;
    const a = path[i - 1], b = path[i];
    return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i };
  }
  function coordsTo(d) {
    if (d <= 0) return [path[0], path[0]];
    const { p, i } = pointAt(d);
    return path.slice(0, i).concat([p]);
  }
  function headingAt(d, dir = 1) {
    const ahead = pointAt(d + 45 * dir).p, here = pointAt(d).p;
    if (meters(here, ahead) < 2) return bearing(pointAt(d - 45 * dir).p, here);
    return bearing(here, ahead);
  }
  function stopHeading(i) {
    // дивимось уздовж наступного відрізка; на останній точці — уздовж останнього
    return i < N - 1 ? bearing(pointAt(wp[i]).p, pointAt(wp[i] + 90).p) : bearing(pointAt(wp[i] - 90).p, pointAt(wp[i]).p);
  }
  const lerpAngle = (a, b, k) => { let d = ((b - a + 540) % 360) - 180; return a + d * k; };
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  /* ---------- інтерфейс ---------- */
  let cur = 0, busy = false, map = null, pins = [], city = null;
  const card = $("#stopCard"), tl = $("#timeline"), hint = $("#mapHint");

  // шкала точок
  const fill = document.createElement("span"); fill.className = "tl-fill"; tl.appendChild(fill);
  STOPS.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<button aria-label="Точка ${s.n}: ${s.name}"><span class="t-n">${pad(s.n)}</span><span class="t-dot"></span><span class="t-name">${s.name}</span></button>`;
    li.querySelector("button").addEventListener("click", () => go(i));
    tl.appendChild(li);
  });

  function fillCard(i) {
    const s = STOPS[i];
    $("#scRender").src = s.render; $("#scRender").alt = `Цифрова скульптура «${s.name}»`;
    $("#scPlaceImg").src = s.place;
    card.querySelector(".sc-media").classList.remove("show-place");
    $("#scKicker").textContent = `ТОЧКА ${pad(s.n)} · ${s.addr}`;
    $("#scPoint").textContent = s.name;
    $("#scObj").textContent = `Концептуальний образ — «${s.concept}»`;
    $("#scText").textContent = s.short;
    $("#scMore").href = `#object-${s.key}`;
    $("#scSV").href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${s.ll[1]},${s.ll[0]}`;
  }

  function setUI(i, instant) {
    cur = i;
    if (instant) fillCard(i);
    else { card.classList.add("swap"); setTimeout(() => { fillCard(i); card.classList.remove("swap"); }, 260); }
    $("#hudN").textContent = pad(i + 1);
    $("#hudLL").textContent = `${dms(STOPS[i].ll[1], "N", "S")} · ${dms(STOPS[i].ll[0], "E", "W")}`;
    setDist(wp[i]);
    $("#prevBtn").disabled = i === 0;
    $("#nextBtn").setAttribute("aria-label", i === N - 1 ? "Повернутися на початок" : "Наступна точка");
    $("#nextBtn").textContent = i === N - 1 ? "↺" : "→";
    [...tl.querySelectorAll("li")].forEach((li, k) => { li.classList.toggle("cur", k === i); li.classList.toggle("done", k < i); });
    fill.style.width = `${(i / (N - 1)) * (100 - 100 / N)}%`;
    pins.forEach((p, k) => { p.classList.toggle("cur", k === i); p.classList.toggle("done", k < i); });
    hint.querySelector("span").textContent = i === N - 1 ? "Клікніть, щоб повернутися на початок" : "Клікніть по вулиці, щоб іти далі";
    if (map && map.getLayer("pillars")) map.setPaintProperty("pillars", "fill-extrusion-color", pillarColor(i));
    if (map && city) { city.setActive(i); map.triggerRepaint(); }
  }
  function setDist(d) { $("#hudDist").textContent = `${Math.round(d)} м з ${Math.round(TOTAL)} м`; }

  $("#scPlace").addEventListener("click", (e) => {
    const m = card.querySelector(".sc-media"); const on = m.classList.toggle("show-place");
    const s = STOPS[cur];
    $("#scRender").src = on ? s.place : s.render;
    $("#scPlaceImg").src = on ? s.render : s.place;
    $("#scPlace").setAttribute("aria-label", on ? "Показати об’єкт" : "Показати фото місця");
    e.stopPropagation();
  });
  // зображення в картці веде на сторінку об’єкта (на телефоні — найочевидніша ціль для дотику)
  $("#scRender").addEventListener("click", () => { location.hash = `#object-${STOPS[cur].key}`; });
  $("#prevBtn").addEventListener("click", () => go(cur - 1));
  $("#nextBtn").addEventListener("click", () => next());

  function next() { go(cur === N - 1 ? 0 : cur + 1); }

  /* ---------- рух камери ---------- */
  const isNarrow = () => matchMedia("(max-width: 760px)").matches;
  const isMid = () => matchMedia("(max-width: 1100px)").matches;
  const padding = () => isNarrow() ? { top: 60, bottom: 40, left: 0, right: 0 }
    : isMid() ? { top: 120, bottom: 160, left: 0, right: 380 } : { top: 120, bottom: 140, left: 0, right: 440 };
  const ZOOM = () => (isNarrow() ? 17.5 : 18.05);

  function go(i) {
    if (busy || i < 0 || i >= N || i === cur) return;
    if (!map) { setUI(i); return; }
    if (!map.getSource("done")) { // мапа ще вантажиться
      setUI(i); map.jumpTo({ center: STOPS[i].ll, bearing: stopHeading(i), zoom: ZOOM(), pitch: 62 });
      map.once("load", () => { map.getSource("done").setData(line(coordsTo(wp[i]))); map.getSource("walker").setData(pt(pointAt(wp[i]).p)); });
      return;
    }
    if (Math.abs(i - cur) === 1 && !reduce) walk(cur, i);
    else jump(i);
  }

  function walk(from, to) {
    busy = true;
    const d0 = wp[from], d1 = wp[to], dir = Math.sign(d1 - d0), L = Math.abs(d1 - d0);
    const dur = Math.max(1800, Math.min(5200, L * 11));
    let b = map.getBearing(), start = performance.now();
    setUI(to);
    function frame(now) {
      const t = Math.min(1, (now - start) / dur), e = ease(t), d = d0 + (d1 - d0) * e;
      const { p } = pointAt(d);
      b = lerpAngle(b, headingAt(d, dir), 0.07);
      map.jumpTo({ center: p, bearing: b, zoom: ZOOM() - 0.45 * Math.sin(Math.PI * t), pitch: 64, padding: padding() });
      map.getSource("done").setData(line(coordsTo(d)));
      map.getSource("walker").setData(pt(p));
      setDist(d);
      if (t < 1) requestAnimationFrame(frame);
      else arrive(to);
    }
    requestAnimationFrame(frame);
  }

  function jump(i) {
    busy = true; setUI(i);
    map.getSource("done").setData(line(coordsTo(wp[i])));
    map.getSource("walker").setData(pt(pointAt(wp[i]).p));
    map.flyTo({ center: STOPS[i].ll, bearing: stopHeading(i), zoom: ZOOM(), pitch: 62, padding: padding(), duration: reduce ? 0 : 2200, essential: false });
    map.once("moveend", () => { busy = false; });
  }

  function arrive(i) {
    map.easeTo({ center: STOPS[i].ll, zoom: ZOOM() + 0.15, pitch: 60, bearing: lerpAngle(map.getBearing(), stopHeading(i), 0.6), padding: padding(), duration: 900 });
    map.once("moveend", () => { busy = false; });
  }

  /* ---------- GeoJSON ---------- */
  const line = (c) => ({ type: "Feature", geometry: { type: "LineString", coordinates: c } });
  const pt = (c) => ({ type: "Feature", geometry: { type: "Point", coordinates: c } });
  function circlePoly(c, r, i) {
    const ring = [];
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * 2 * Math.PI;
      ring.push([c[0] + (r * Math.cos(a)) / (111320 * Math.cos(c[1] * R)), c[1] + (r * Math.sin(a)) / 110540]);
    }
    return { type: "Feature", properties: { i }, geometry: { type: "Polygon", coordinates: [ring] } };
  }
  const pillarColor = (i) => ["case", ["==", ["get", "i"], i], "#FFE9B0", ["<", ["get", "i"], i], "#CDBDF0", "#6A5FA0"];

  /* ---------- стиль мапи ---------- */
  const NAME = ["coalesce", ["get", "name:uk"], ["get", "name"]];
  /* Офлайн-режим (публікація на claude.ai): тайли й гліфи вбудовані в js/tiles.js */
  const LOCAL = !!(window.LOCAL_TILES && window.maplibregl);
  if (LOCAL) {
    const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); return u.buffer; };
    maplibregl.addProtocol("local", async (params) => {
      const [kind, ...rest] = params.url.replace("local://", "").split("/");
      const key = decodeURIComponent(rest.join("/"));
      const src = kind === "tiles" ? window.LOCAL_TILES[key] : window.LOCAL_GLYPHS[key];
      return { data: src ? b64(src) : new ArrayBuffer(0) };
    });
  }
  const STYLE = {
    version: 8,
    glyphs: LOCAL ? "local://glyphs/{fontstack}/{range}" : "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { omt: LOCAL
      ? { type: "vector", tiles: ["local://tiles/{z}/{x}/{y}"], minzoom: 0, maxzoom: 14,
          attribution: "<a href=\"https://openfreemap.org\" target=\"_blank\">OpenFreeMap</a> © OpenMapTiles · © <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\">OpenStreetMap</a>" }
      : { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    light: { anchor: "viewport", color: "#F1E9FF", intensity: 0.42, position: [1.2, 200, 35] },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#211C3F" } },
      { id: "landcover", type: "fill", source: "omt", "source-layer": "landcover", paint: { "fill-color": "#272150", "fill-opacity": 0.7 } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": "#2B2656", "fill-outline-color": "#3D3672" } },
      { id: "landuse", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", ["get", "class"], ["literal", ["grass", "cemetery", "pitch", "school"]]], paint: { "fill-color": "#28224F", "fill-opacity": 0.8 } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": "#16122C" } },
      { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": "#16122C", "line-width": 2 } },
      { id: "road-casing", type: "line", source: "omt", "source-layer": "transportation",
        filter: ["!", ["in", ["get", "class"], ["literal", ["rail", "transit", "path", "track", "ferry"]]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#17132E", "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 13, 2, 18, 30] } },
      { id: "road", type: "line", source: "omt", "source-layer": "transportation",
        filter: ["!", ["in", ["get", "class"], ["literal", ["rail", "transit", "path", "track", "ferry"]]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["match", ["get", "class"], ["primary", "secondary", "trunk"], "#4A4283", ["tertiary"], "#403973", "#38326A"],
                 "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 13, 1, 18, ["match", ["get", "class"], ["primary", "secondary", "trunk"], 24, ["tertiary"], 20, 15]] } },
      { id: "paths", type: "line", source: "omt", "source-layer": "transportation", filter: ["in", ["get", "class"], ["literal", ["path", "track"]]],
        paint: { "line-color": "#4A4384", "line-width": 1.2, "line-dasharray": [2, 2] } },
      /* плани будинків на землі; об’ємні лінійні будинки малює шар city3d (js/city3d.js) */
      { id: "buildings", type: "fill", source: "omt", "source-layer": "building", minzoom: 13,
        paint: { "fill-color": "#2A2452", "fill-outline-color": "#5A5194" } },
      { id: "road-label", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 15,
        layout: { "symbol-placement": "line", "text-field": NAME, "text-font": ["Noto Sans Regular"], "text-size": 12.5, "text-letter-spacing": 0.08, "text-max-angle": 30 },
        paint: { "text-color": "#C9BBE6", "text-halo-color": "#211C3F", "text-halo-width": 1.6, "text-opacity": 0.85 } }
    ]
  };

  /* ---------- маркери ---------- */
  function makePin(s, i) {
    const el = document.createElement("button");
    el.className = "pin"; el.type = "button";
    el.setAttribute("aria-label", `Точка ${s.n}: ${s.name} — ${s.concept}`);
    el.innerHTML = `<span class="pin-rings"></span><span class="pin-dot">${s.n}</span>
      <span class="pin-label"><small>AR · ТОЧКА ${pad(s.n)}</small>${s.name}</span>
      <span class="pin-pop" aria-hidden="true"><img src="${s.render}" alt=""><b>${s.concept}</b><span>${s.short.split(". ").slice(0, 1).join(". ")}.</span></span>`;
    el.addEventListener("click", (e) => { e.stopPropagation(); go(i); });
    el.addEventListener("mouseenter", () => {
      const r = el.getBoundingClientRect(), m = $("#map").getBoundingClientRect();
      el.classList.toggle("below", r.top - m.top < 300);
      el.classList.toggle("leftward", m.right - r.right < 300);
    });
    return el;
  }

  /* ---------- запуск ---------- */
  setUI(0, true);
  if (!window.maplibregl) { $("#mapFallback").hidden = false; return; }
  try {
    map = new maplibregl.Map({
      container: "map", style: STYLE,
      center: STOPS[0].ll, zoom: ZOOM(), pitch: 62, bearing: stopHeading(0), maxPitch: 75,
      minZoom: LOCAL ? 13 : 0, maxBounds: LOCAL ? [[33.955, 50.35], [34.03, 50.392]] : undefined,
      cooperativeGestures: true, doubleClickZoom: false, attributionControl: false,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Ctrl + коліщатко — масштаб мапи",
        "CooperativeGesturesHandler.MacHelpText": "⌘ + коліщатко — масштаб мапи",
        "CooperativeGesturesHandler.MobileHelpText": "Двома пальцями — рух мапи"
      }
    });
  } catch (err) {
    console.warn(err); map = null; $("#mapFallback").hidden = false; return;
  }
  map.setPadding(padding());
  map.addControl(new maplibregl.AttributionControl({ compact: true }));

  map.on("load", () => {
    map.addSource("route", { type: "geojson", data: line(path) });
    map.addSource("done", { type: "geojson", data: line(coordsTo(0)) });
    map.addSource("walker", { type: "geojson", data: pt(pointAt(0).p) });
    map.addSource("pillars", { type: "geojson", data: { type: "FeatureCollection", features: STOPS.map((s, i) => circlePoly(s.ll, 2.4, i)) } });
    map.addSource("halo", { type: "geojson", data: { type: "FeatureCollection", features: STOPS.map((s) => pt(s.ll)) } });

    map.addLayer({ id: "halo", type: "circle", source: "halo", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 10, 18, 46], "circle-color": "#B9A6D8", "circle-opacity": 0.14, "circle-blur": 1 } }, "buildings");
    map.addLayer({ id: "route-all", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#B9A6D8", "line-opacity": 0.45, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1.5, 18, 4], "line-dasharray": [1.2, 1.6] } }, "buildings");
    map.addLayer({ id: "route-glow", type: "line", source: "done", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#B9A6D8", "line-opacity": 0.4, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 6, 18, 18], "line-blur": 8 } }, "buildings");
    map.addLayer({ id: "route-done", type: "line", source: "done", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#E8D29A", "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2, 18, 5.5] } }, "buildings");
    try {
      city = window.createCityLayer && window.createCityLayer(maplibregl);
      if (city) { map.addLayer(city); city.setActive(cur); }
    } catch (err) { console.warn("city3d:", err); city = null; }
    map.addLayer({ id: "pillars", type: "fill-extrusion", source: "pillars",
      paint: { "fill-extrusion-color": pillarColor(cur), "fill-extrusion-height": 42, "fill-extrusion-opacity": 0.6 } });
    map.addLayer({ id: "walker-glow", type: "circle", source: "walker", paint: { "circle-radius": 16, "circle-color": "#E8D29A", "circle-opacity": 0.35, "circle-blur": 1 } });
    map.addLayer({ id: "walker", type: "circle", source: "walker", paint: { "circle-radius": 5.5, "circle-color": "#F4EEDF", "circle-stroke-color": "#252044", "circle-stroke-width": 2 } });

    pins = STOPS.map((s, i) => {
      const el = makePin(s, i);
      new maplibregl.Marker({ element: el, anchor: "center", pitchAlignment: "viewport" }).setLngLat(s.ll).addTo(map);
      return el;
    });
    setUI(cur, true);
  });

  map.on("click", () => next());
  map.on("error", (e) => console.warn("map:", e && e.error && e.error.message));
  addEventListener("resize", () => { if (map && !busy) map.setPadding(padding()); });
  $("#map").addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); }
  });

  window.RouteMap = { go, next, get map() { return map; } };
})();
