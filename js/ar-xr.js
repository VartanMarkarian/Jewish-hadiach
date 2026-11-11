/* Невидимі шари пам’яті — власний AR-режим (WebXR, Chrome на Android).
   Торкнулися підлоги — об’єкт з’являється в цій точці й закріплюється (XR-якір). Далі його не можна
   ні посунути, ні збільшити: проведення пальцем лише обертає навколо вертикальної осі, людина обходить об’єкт.
   Моделі вже в реальному розмірі (tools/ar_scale.py); lift — підйом над підлогою в метрах.
   iPhone не має WebXR — там лишається Quick Look через model-viewer.

   start() треба викликати прямо в обробнику натискання: сесію браузер дозволяє лише одразу після жесту,
   тож спершу відкриваємо сесію, а модель вантажимо вже всередині неї.
   Рендерер, полотно й накладка створюються один раз і живуть увесь час (як у model-viewer):
   знищення WebGL-контексту й накладки одразу після виходу з AR у фреймі claude.ai валило вкладку.
   Після виходу звільняємо лише модель і її текстури. */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/+esm";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js/+esm";
import { DRACOLoader } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/DRACOLoader.js/+esm";
import { RoomEnvironment } from "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/environments/RoomEnvironment.js/+esm";

// Android 16 + Chrome 156: новий спосіб малювання WebXR (Layers, XRWebGLBinding) не працює — на фестивальному
// путівнику показував лише камеру; тут, схоже, валив вкладку при виході. Ховаємо його від three.js, і вона малює
// класичним XRWebGLLayer (див. «AR — чому скульптура не з'являлася…» у проєкті DIGITAL FEST POLTAVA).
if (/Android/i.test(navigator.userAgent) && typeof XRRenderState !== "undefined" && "layers" in XRRenderState.prototype)
  Object.defineProperty(XRRenderState.prototype, "layers", { get() { return undefined; }, configurable: true });

export async function supported() {
  try { return !!navigator.xr && await navigator.xr.isSessionSupported("immersive-ar"); } catch { return false; }
}

const TEXT = {
  load: "Завантаження моделі…",
  scan: "Повільно поводіть телефоном над підлогою",
  aim: "Торкніться підлоги там, де має з’явитися об’єкт",
  placed: "Обійдіть об’єкт. Щоб повернути його, проведіть пальцем уліво чи вправо",
  fail: "Модель не завантажилась",
};

/* ---------- спільне для всіх сеансів ---------- */
let K = null;
function kit() {
  if (K) return K;
  const ui = document.createElement("div");
  ui.className = "xr-ui";
  ui.hidden = true;
  ui.innerHTML = `<style>
    .xr-ui{position:fixed;inset:0;z-index:2147483000;font:15px/1.4 system-ui,sans-serif;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none}
    .xr-ui[hidden]{display:none}
    .xr-ui .xr-top{position:absolute;top:max(14px,env(safe-area-inset-top));left:14px;right:14px;display:flex;justify-content:space-between;align-items:center;gap:10px}
    .xr-ui b{font-weight:600;font-size:14px;letter-spacing:.02em;text-shadow:0 1px 3px #000a}
    .xr-ui button{font:600 14px system-ui,sans-serif;color:#fff;background:#0009;border:1px solid #fff6;border-radius:22px;padding:10px 16px}
    .xr-ui .xr-msg{position:absolute;left:16px;right:16px;bottom:max(28px,env(safe-area-inset-bottom));text-align:center}
    .xr-ui .xr-msg span{display:inline-block;background:#000a;border-radius:14px;padding:10px 14px;max-width:420px}
    .xr-ui .xr-again{position:absolute;right:14px;bottom:max(92px,calc(env(safe-area-inset-bottom) + 64px))}
  </style>
  <div class="xr-top"><b></b><button class="xr-close" type="button">Вийти</button></div>
  <button class="xr-again" type="button" hidden>Поставити деінде</button>
  <div class="xr-msg"><span></span></div>`;
  document.body.appendChild(ui);
  // натискання на кнопки не повинні ставити об’єкт
  ui.querySelectorAll("button").forEach((b) => b.addEventListener("beforexrselect", (e) => e.preventDefault()));

  const canvas = document.createElement("canvas");
  canvas.dataset.xr = "1";              // object.js не гасить цей контекст
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  renderer.domElement.style.cssText = "position:fixed;inset:0;z-index:2147482999;display:none";
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.14, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  reticle.matrixAutoUpdate = false;
  scene.add(reticle);
  const anchorGroup = new THREE.Group();   // точка появи на підлозі
  const spin = new THREE.Group();          // поворот навколо вертикалі
  anchorGroup.add(spin);
  scene.add(anchorGroup);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }));
  shadow.receiveShadow = true;
  anchorGroup.add(shadow);
  const draco = new DRACOLoader().setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/");
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 60);

  K = { ui, renderer, scene, sun, reticle, anchorGroup, spin, shadow, loader, camera, busy: false, sess: null };
  // обертання одним пальцем; переміщення й масштабу немає
  let px = null;
  ui.addEventListener("pointerdown", (e) => { if (K.sess && K.sess.state === "placed" && !e.target.closest("button")) px = e.clientX; });
  ui.addEventListener("pointermove", (e) => { if (px !== null) { spin.rotation.y += (e.clientX - px) * 0.012; px = e.clientX; } });
  ui.addEventListener("pointerup", () => { px = null; });
  ui.addEventListener("pointercancel", () => { px = null; });
  ui.querySelector(".xr-close").addEventListener("click", () => { if (K.sess) K.sess.session.end().catch(() => {}); });
  ui.querySelector(".xr-again").addEventListener("click", () => { if (K.sess) K.sess.again(); });
  return K;
}

function disposeModel(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((m) => {
      Object.values(m).forEach((v) => { if (v && v.isTexture) { if (v.image && v.image.close) v.image.close(); v.dispose(); } });
      m.dispose();
    });
  });
}

export async function start({ url, lift = 0, title = "", onEnd = () => {} }) {
  const k = kit();
  if (k.busy) return;
  k.busy = true;
  const { ui, renderer, scene, sun, reticle, anchorGroup, spin, shadow, loader, camera } = k;
  const msg = (t) => { ui.querySelector(".xr-msg span").textContent = t; };
  const btnAgain = ui.querySelector(".xr-again");
  ui.querySelector("b").textContent = title;
  btnAgain.hidden = true;
  reticle.visible = false;
  anchorGroup.visible = false;
  msg(TEXT.load);
  ui.hidden = false;

  const S = { state: "load", session: null, hitSource: null, anchor: null, lastHit: null, model: null, mixer: null, ended: false };

  /* ---------- сесія — першою, поки діє дозвіл від натискання ---------- */
  try {
    S.session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay", "anchors", "local-floor"],
      domOverlay: { root: ui },
    });
  } catch (e) {
    ui.hidden = true; k.busy = false; onEnd(); throw e;
  }
  const session = S.session;
  k.sess = S;
  let refSpace;
  try { refSpace = await session.requestReferenceSpace("local-floor"); renderer.xr.setReferenceSpaceType("local-floor"); }
  catch { refSpace = await session.requestReferenceSpace("local"); renderer.xr.setReferenceSpaceType("local"); }
  renderer.domElement.style.display = "block";
  await renderer.xr.setSession(session);
  const viewerSpace = await session.requestReferenceSpace("viewer");

  session.addEventListener("end", () => {
    S.ended = true;
    // спершу даємо three й браузеру закрити сесію, потім ховаємо полотно й звільняємо модель
    setTimeout(() => {
      renderer.setAnimationLoop(null);
      renderer.domElement.style.display = "none";
      ui.hidden = true;
      if (S.hitSource) { try { S.hitSource.cancel(); } catch {} }
      if (S.anchor) { try { S.anchor.delete(); } catch {} }
      if (S.mixer) { S.mixer.stopAllAction(); S.mixer.uncacheRoot(S.model); }
      if (S.model) { spin.remove(S.model); disposeModel(S.model); }
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      renderer.renderLists.dispose();
      k.sess = null;
      k.busy = false;
      onEnd();
    }, 150);
  });

  const clock = new THREE.Clock();
  const target = new THREE.Vector3();
  const up = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpM = new THREE.Matrix4();
  const horizontal = (pose) => {   // лише горизонтальні поверхні (підлога, земля)
    tmpM.fromArray(pose.transform.matrix).decompose(tmpP, tmpQ, tmpS);
    return up.set(0, 1, 0).applyQuaternion(tmpQ).y > 0.85;
  };

  renderer.setAnimationLoop((t, frame) => {
    if (!frame || S.ended) return;
    const dt = clock.getDelta();
    if (S.mixer && S.state === "placed") S.mixer.update(dt);
    if ((S.state === "scan" || S.state === "aim") && S.hitSource) {
      const hits = frame.getHitTestResults(S.hitSource).filter((h) => { const p = h.getPose(refSpace); return p && horizontal(p); });
      if (hits.length) {
        S.lastHit = hits[0];
        reticle.matrix.fromArray(hits[0].getPose(refSpace).transform.matrix);
        reticle.visible = true;
        if (S.state === "scan") { S.state = "aim"; msg(TEXT.aim); }
      } else {
        reticle.visible = false;
      }
    }
    if (S.state === "placed" && S.anchor && frame.trackedAnchors && frame.trackedAnchors.has(S.anchor)) {
      // якір уточнюється разом із картою простору: дрібні поправки — плавно, великі — одразу
      const p = frame.getPose(S.anchor.anchorSpace, refSpace);
      if (p) {
        target.set(p.transform.position.x, p.transform.position.y, p.transform.position.z);
        if (target.distanceTo(anchorGroup.position) > 0.35) anchorGroup.position.copy(target);
        else anchorGroup.position.lerp(target, 0.2);
      }
    }
    renderer.render(scene, camera);
  });

  /* ---------- модель ---------- */
  let gltf;
  try {
    gltf = await loader.loadAsync(url);
  } catch {
    msg(TEXT.fail);
    return;
  }
  if (S.ended) { disposeModel(gltf.scene); return; }
  const model = S.model = gltf.scene;
  model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  // опорна точка — центр основи; модель стоїть на підлозі й піднята на lift
  model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y + lift, -(box.min.z + box.max.z) / 2);
  spin.rotation.set(0, 0, 0);
  spin.add(model);
  const R = Math.max(size.x, size.z) * 0.9 + 0.5;
  shadow.scale.set(R * 2, 1, R * 2);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -R; sc.right = sc.top = R; sc.near = 0.1; sc.far = size.y + lift + 12;
  sc.updateProjectionMatrix();
  if (gltf.animations.length) {
    S.mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((c) => S.mixer.clipAction(c).play());
  }

  S.hitSource = await session.requestHitTestSource({ space: viewerSpace });
  S.state = "scan";
  msg(TEXT.scan);

  function place() {
    if (!S.lastHit) return;
    const pose = S.lastHit.getPose(refSpace);
    if (!pose) return;
    const p = pose.transform.position;
    anchorGroup.position.set(p.x, p.y, p.z);
    // лицем до людини: передня сторона моделі (+Z) дивиться на камеру
    const cam = renderer.xr.getCamera().position;
    spin.rotation.set(0, Math.atan2(cam.x - p.x, cam.z - p.z), 0);
    anchorGroup.visible = true;
    reticle.visible = false;
    sun.position.set(p.x + 2, p.y + 6, p.z + 3);
    sun.target.position.set(p.x, p.y, p.z);
    if (S.lastHit.createAnchor) {
      S.lastHit.createAnchor().then((a) => { if (S.state === "placed" && !S.anchor && !S.ended) S.anchor = a; else a.delete(); }).catch(() => {});
    }
    if (S.hitSource) { S.hitSource.cancel(); S.hitSource = null; }
    S.state = "placed";
    btnAgain.hidden = false;
    msg(TEXT.placed);
  }
  session.addEventListener("select", () => { if (S.state === "aim") place(); });

  S.again = async () => {
    if (S.anchor) { S.anchor.delete(); S.anchor = null; }
    anchorGroup.visible = false;
    btnAgain.hidden = true;
    S.lastHit = null;
    S.state = "load";
    S.hitSource = await session.requestHitTestSource({ space: viewerSpace });
    S.state = "scan";
    msg(TEXT.scan);
  };
}
