import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const MODEL_URL = './models/sponza.glb';
const TURNS = 1;          // full revolutions over the whole page scroll
const DAMPING = 6;        // higher = camera catches up to scroll faster

const canvas = document.getElementById('scene');
const angleEl = document.getElementById('angle');
const loaderEl = document.getElementById('loader');
const loaderPct = document.getElementById('loader-pct');
const loaderFill = document.getElementById('loader-fill');

const isMobile = matchMedia('(pointer: coarse)').matches;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const sky = new THREE.Color(0x9fb4c7);
scene.background = sky;
scene.fog = new THREE.Fog(sky, 60, 140);

const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);

scene.add(new THREE.HemisphereLight(0xdfeaff, 0x6b5a45, 1.4));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(12, 22, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);

// Ground plane so the building doesn't float.
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(150, 64),
  new THREE.MeshStandardMaterial({ color: 0x8a8377, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
ground.receiveShadow = true;
scene.add(ground);

// Roof tiles fade away early in the scroll so you can see down into the arcades.
const roofMaterials = new Set();
let roofOpacity = 1;
function updateRoof(p) {
  const t = THREE.MathUtils.smoothstep(p, 0.04, 0.16);
  const o = 1 - t;
  if (o === roofOpacity) return;
  roofOpacity = o;
  for (const m of roofMaterials) {
    m.transparent = o < 1;
    m.depthWrite = o >= 1;
    m.opacity = o;
    m.visible = o > 0.01;
    m.needsUpdate = true;
  }
}

// ---------- orbit state ----------
const orbit = {
  radius: 30,
  elevation: THREE.MathUtils.degToRad(50), // look down into the open courtyard
  fitRadius: 13, // half-extent of the building we want to keep in frame
  target: new THREE.Vector3(0, 2.5, 0),
  angle: 0,        // smoothed, what we render
  dragOffset: 0,   // radians added by horizontal drag
};

function scrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? window.scrollY / max : 0;
}

function targetAngle() {
  return scrollProgress() * TURNS * Math.PI * 2 + orbit.dragOffset;
}

// Horizontal drag (mouse or touch) spins the building directly.
// Vertical touch movement is left to the browser (touch-action: pan-y) so it scrolls the page.
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { id: e.pointerId, x: e.clientX };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x;
  drag.x = e.clientX;
  orbit.dragOffset -= (dx / window.innerWidth) * Math.PI * 1.5;
});
const endDrag = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---------- resize ----------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  orbit.fitRadius = w < h ? 10.5 : 13;
  // Distance needed so the building fits the narrower of the two fields of view
  // (portrait phones are limited by the horizontal FOV).
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  orbit.radius = orbit.fitRadius / Math.tan(Math.min(vfov, hfov) / 2);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- load model ----------
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

loader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;

    // Normalise: centre on origin, sit on the ground, ~20 units across.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = 20 / Math.max(size.x, size.z);
    model.scale.setScalar(scale);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
    const height = (box.max.y - box.min.y);
    orbit.target.set(0, height * 0.15, 0);

    model.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material.name === 'roof') roofMaterials.add(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
      const m = o.material;
      // OBJ had alpha in the diffuse textures (chains, plants, lion). Use alpha-test cut-outs
      // rather than blending: no sorting artefacts and much cheaper.
      if (m.transparent) {
        m.transparent = false;
        m.alphaTest = 0.5;
        m.side = THREE.DoubleSide;
      }
      if (m.map) m.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    });

    // Fit the shadow camera to the building.
    const s = sun.shadow.camera;
    s.left = -16; s.right = 16; s.top = 16; s.bottom = -16; s.near = 1; s.far = 60;
    s.updateProjectionMatrix();

    scene.add(model);
    orbit.angle = targetAngle();
    loaderEl.classList.add('done');
  },
  (xhr) => {
    if (!xhr.total) return;
    const pct = Math.round((xhr.loaded / xhr.total) * 100);
    loaderPct.textContent = pct + '%';
    loaderFill.style.width = pct + '%';
  },
  (err) => {
    console.error(err);
    loaderPct.textContent = '— failed to load model';
  }
);

// ---------- render loop ----------
const clock = new THREE.Clock();
let lastShown = -1;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  updateRoof(scrollProgress());
  const goal = targetAngle();
  orbit.angle += (goal - orbit.angle) * (1 - Math.exp(-DAMPING * dt));

  const a = orbit.angle;
  // Gentle bob in elevation as you go round, so the arcades and courtyard reveal themselves.
  const el = orbit.elevation + Math.sin(a * 2) * 0.08;
  const flat = Math.cos(el) * orbit.radius;
  camera.position.set(
    orbit.target.x + Math.sin(a) * flat,
    orbit.target.y + Math.sin(el) * orbit.radius,
    orbit.target.z + Math.cos(a) * flat
  );
  camera.lookAt(orbit.target);

  const deg = Math.round(((THREE.MathUtils.radToDeg(a) % 360) + 360) % 360);
  if (deg !== lastShown) {
    angleEl.textContent = deg + '°';
    lastShown = deg;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
