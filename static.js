import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ============================================================
// Seeded PRNG (Mulberry32) — deterministic randomness per seed
// ============================================================
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

// Generate a new numeric seed on every page load
function generateNumericSeed() {
  return Math.floor(100000 + Math.random() * 900000);
}
let currentSeed = generateNumericSeed();
let rng = mulberry32(currentSeed);

// Show seed in the UI
const seedInput = document.getElementById('seed-input');
seedInput.value = currentSeed;

// ============================================================
// UI Controls
// ============================================================
document.getElementById('randomize-btn').addEventListener('click', () => {
  currentSeed = generateNumericSeed();
  seedInput.value = currentSeed;
  rebuildAndRender();
});

// Allow manual seed entry
seedInput.removeAttribute('readonly');
seedInput.setAttribute('inputmode', 'numeric');
seedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = parseInt(seedInput.value.trim(), 10);
    if (!isNaN(val) && val > 0) {
      currentSeed = val;
    }
    seedInput.value = currentSeed;
    rebuildAndRender();
  }
});

document.getElementById('save-btn').addEventListener('click', () => {
  const scale = parseInt(document.getElementById('save-size').value);
  exportPNG(scale);
});



// ============================================================
// 1. Scene Setup
// ============================================================
const canvasContainer = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(0, 0, 500);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
canvasContainer.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enabled = true;

// ============================================================
// 2. Harmonious Colors
// ============================================================
const palette = [
  '#0088cc', // Cyan Blue
  '#e63946', // Crimson Red
  '#d48a00', // Deep Gold/Orange
  '#2a9d8f', // Teal Green
  '#c85a17'  // Rust Orange
];
const rootColor = '#cccccc';

// ============================================================
// UI Controls for 2D Component View
// ============================================================
let is2DMode = false;
let isInverted = false;
let showGuides = true;
let selected2DColor = palette[0];
let selected2DScale = 1.0;

document.getElementById('toggle-2d-btn').addEventListener('click', () => {
  is2DMode = !is2DMode;
  const btn = document.getElementById('toggle-2d-btn');
  btn.textContent = is2DMode ? '3D' : '2D';
  btn.title = is2DMode ? 'Toggle 3D View' : 'Toggle 2D Component View';
  document.getElementById('controls-2d').style.display = is2DMode ? 'flex' : 'none';

  if (is2DMode) {
    controls.enabled = false;
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);
  } else {
    controls.enabled = true;
  }

  rebuildAndRender();
});

document.getElementById('invert-btn').addEventListener('click', () => {
  isInverted = !isInverted;
  document.getElementById('invert-btn').style.background = isInverted ? 'rgba(0,0,0,0.1)' : 'transparent';
  rebuildAndRender();
});

document.getElementById('toggle-guide-btn').addEventListener('click', () => {
  showGuides = !showGuides;
  document.getElementById('toggle-guide-btn').style.background = showGuides ? 'transparent' : 'rgba(0,0,0,0.1)';
  rebuildAndRender();
});

const colorContainer = document.getElementById('color-picker-container');
palette.forEach(color => {
  const btn = document.createElement('div');
  btn.style.width = '16px';
  btn.style.height = '16px';
  btn.style.borderRadius = '50%';
  btn.style.backgroundColor = color;
  btn.style.cursor = 'pointer';
  btn.style.border = (color === selected2DColor) ? '2px solid white' : '2px solid transparent';
  btn.addEventListener('click', () => {
    selected2DColor = color;
    Array.from(colorContainer.children).forEach(c => c.style.border = '2px solid transparent');
    btn.style.border = '2px solid white';
    if (is2DMode) rebuildAndRender();
  });
  colorContainer.appendChild(btn);
});

document.getElementById('scale-slider').addEventListener('input', (e) => {
  selected2DScale = parseFloat(e.target.value);
  if (is2DMode) rebuildAndRender();
});

// ============================================================
// 3. Reusable Geometries & Utilities
// ============================================================
const nodeGeometry = new THREE.BoxGeometry(1, 1, 1);

function createCircleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(32, 32, 31, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}
const circleTex = createCircleTexture();

function createBillboardCircle(size, colorHex) {
  const mat = new THREE.SpriteMaterial({ map: circleTex, color: colorHex });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size * 2.5, size * 2.5, 1);
  return sprite;
}

function getRandomSurfacePoint(radius) {
  const u = rng();
  const v = rng();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.sin(phi) * Math.sin(theta);
  const z = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

function getCirclePointAtAngle(radius, normalVector, angle) {
  const n = normalVector.clone().normalize();
  let u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(n.x) > 0.9) {
    u.set(0, 1, 0);
  }
  u.cross(n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();

  const point = new THREE.Vector3();
  point.addScaledVector(u, Math.cos(angle) * radius);
  point.addScaledVector(v, Math.sin(angle) * radius);
  return point;
}

function createLinesToChildren(childrenPositions, parentColor, childrenColors) {
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(childrenPositions.length * 6);
  const col = new Float32Array(childrenPositions.length * 6);

  const pColor = new THREE.Color(parentColor);

  for (let i = 0; i < childrenPositions.length; i++) {
    let childPos = childrenPositions[i];
    let cColor = new THREE.Color(childrenColors[i]);

    pos[i * 6] = 0; pos[i * 6 + 1] = 0; pos[i * 6 + 2] = 0;
    pos[i * 6 + 3] = childPos.x; pos[i * 6 + 4] = childPos.y; pos[i * 6 + 5] = childPos.z;

    col[i * 6] = pColor.r; col[i * 6 + 1] = pColor.g; col[i * 6 + 2] = pColor.b;
    col[i * 6 + 3] = cColor.r; col[i * 6 + 4] = cColor.g; col[i * 6 + 5] = cColor.b;
  }

  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45 });
  return new THREE.LineSegments(geom, mat);
}

function createSegmentLines(starts, ends, startColor, endColor) {
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(starts.length * 6);
  const col = new Float32Array(starts.length * 6);
  const sCol = new THREE.Color(startColor);
  const eCol = new THREE.Color(endColor);

  for (let i = 0; i < starts.length; i++) {
    pos[i * 6] = starts[i].x; pos[i * 6 + 1] = starts[i].y; pos[i * 6 + 2] = starts[i].z;
    pos[i * 6 + 3] = ends[i].x; pos[i * 6 + 4] = ends[i].y; pos[i * 6 + 5] = ends[i].z;
    col[i * 6] = sCol.r; col[i * 6 + 1] = sCol.g; col[i * 6 + 2] = sCol.b;
    col[i * 6 + 3] = eCol.r; col[i * 6 + 4] = eCol.g; col[i * 6 + 5] = eCol.b;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35 });
  return new THREE.LineSegments(geom, mat);
}

function createFaintSphere(radius, colorHex, opacity = 0.15) {
  const geom = new THREE.IcosahedronGeometry(radius, 2);
  const edges = new THREE.EdgesGeometry(geom);
  const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: opacity });
  return new THREE.LineSegments(edges, mat);
}

function createOrbitRing(radius, colorHex, opacity = 0.2) {
  const geom = new THREE.TorusGeometry(radius, 0.4, 8, 80);
  const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: opacity });
  return new THREE.Mesh(geom, mat);
}

// ============================================================
// 4. Build Scene — called on each new seed/refresh
// ============================================================
let mainSystem = null;

function buildScene() {
  // Clear any previous system
  if (mainSystem) {
    scene.remove(mainSystem);
    mainSystem.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }

  mainSystem = new THREE.Group();
  scene.add(mainSystem);

  const MAIN_RADIUS = 200;
  if (!is2DMode) {
    renderer.setClearColor(0x000000, 0);
    if (showGuides) {
      mainSystem.add(createFaintSphere(MAIN_RADIUS * 1.05, '#cccccc', 0));
      mainSystem.add(createOrbitRing(MAIN_RADIUS * 1.05, '#000', 0.05).rotateX(Math.PI / 2));
      mainSystem.add(createOrbitRing(MAIN_RADIUS * 1.05, '#000', 0.05).rotateY(Math.PI / 2));
      mainSystem.add(createOrbitRing(MAIN_RADIUS * 1.05, '#000', 0.05));
    }
  } else {
    renderer.setClearColor(0x000000, 0);
  }

  const DEPTH1_COUNT = is2DMode ? 1 : 18;
  const R1 = MAIN_RADIUS;
  const DEPTH2_COUNT = 80;
  const R2 = 55;
  const R3_OFFSET = 12;
  const R4_HEIGHT = 10;

  for (let i = 0; i < DEPTH1_COUNT; i++) {
    // ---- DEPTH 1 ----
    const depth1Group = new THREE.Group();

    const R1_random = R1 * (0.8 + rng() * 0.2);
    const surfacePt = getRandomSurfacePoint(R1_random);
    const depth1Pos = is2DMode ? new THREE.Vector3(0, 0, 0) : surfacePt.clone();
    const baseNormal = is2DMode ? new THREE.Vector3(0, 0, 1) : surfacePt.clone().normalize();
    
    depth1Group.position.copy(depth1Pos);

    // Spin on the radial axis only (keeps depth-2 circle perpendicular to center→depth1)
    const radialAxis = baseNormal.clone();
    const spinAngle = rng() * Math.PI * 2;
    depth1Group.rotateOnAxis(radialAxis, spinAngle);

    const randomScale = 0.5 + rng() * 0.7;
    depth1Group.scale.setScalar(randomScale * (is2DMode ? selected2DScale : 1.0));

    // Orbit group with a random frozen rotation
    const orbitGroup = new THREE.Group();
    const orbitAxis = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    const orbitAngle = rng() * Math.PI * 2;
    if (!is2DMode) orbitGroup.rotateOnAxis(orbitAxis, orbitAngle);
    orbitGroup.add(depth1Group);
    mainSystem.add(orbitGroup);

    const depth1Col = is2DMode ? selected2DColor : palette[i % palette.length];
    const finalShapeCol = depth1Col;

    // Dashed line from root to depth1
    if (!is2DMode && showGuides) {
      const rootLine = createLinesToChildren([depth1Pos], rootColor, [depth1Col]);
      rootLine.material = new THREE.LineDashedMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.45,
        dashSize: 5,
        gapSize: 3
      });
      rootLine.computeLineDistances();
      orbitGroup.add(rootLine);
    }

    // Exclusion-blended background surface
    const bgMat = new THREE.MeshBasicMaterial({
      color: finalShapeCol,
      transparent: true,
      opacity: (is2DMode && isInverted) ? 1.0 : 0.5,
      blending: (is2DMode && isInverted) ? THREE.NormalBlending : THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneMinusDstColorFactor,
      blendDst: THREE.OneMinusSrcColorFactor,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const bgGeom = new THREE.BufferGeometry();
    const bgPositions = new Float32Array((DEPTH2_COUNT + 1) * 3);
    const bgIndices = [];
    bgPositions[0] = 0; bgPositions[1] = 0; bgPositions[2] = 0;

    for (let j = 0; j < DEPTH2_COUNT; j++) {
      const current = j + 1;
      const next = (j + 1 === DEPTH2_COUNT) ? 1 : j + 2;
      bgIndices.push(0, current, next);
    }

    bgGeom.setIndex(bgIndices);
    bgGeom.setAttribute('position', new THREE.BufferAttribute(bgPositions, 3));

    const bgMesh = new THREE.Mesh(bgGeom, bgMat);
    if (!(is2DMode && isInverted)) {
      depth1Group.add(bgMesh);
    }

    // Wave layers — frozen at a random time
    const frozenTime = rng() * 100;
    const waveLayers = [
      { freq: 1 + Math.floor(rng() * 3), amp: 0.04, phase: rng() * Math.PI * 2, speed: 0.5 + rng() * 1.5 },
      { freq: 4 + Math.floor(rng() * 4), amp: 0.04, phase: rng() * Math.PI * 2, speed: -0.8 - rng() * 2.0 },
      { freq: 8 + Math.floor(rng() * 6), amp: 0.02, phase: rng() * Math.PI * 2, speed: 1.2 + rng() * 2.5 }
    ];

    const localR2 = R2 * (0.6 + rng() * 0.6);

    let depth2Positions = [];
    let depth3Positions = [];
    const depthCol = depth1Col;
    const verticalDir = baseNormal.clone();

    for (let j = 0; j < DEPTH2_COUNT; j++) {
      // ---- DEPTH 2 ----
      const depth2Group = new THREE.Group();
      const angle = (j / DEPTH2_COUNT) * Math.PI * 2;

      let waveValue = 0;
      waveLayers.forEach(layer => {
        waveValue += Math.sin(angle * layer.freq + layer.phase + frozenTime * layer.speed) * layer.amp;
      });

      const organicR2 = localR2 * (0.9 + waveValue);
      const depth2Pos = getCirclePointAtAngle(organicR2, baseNormal, angle);
      depth2Group.position.copy(depth2Pos);
      depth1Group.add(depth2Group);

      // ---- DEPTH 3 ----
      const depth3Group = new THREE.Group();
      const organicR3 = organicR2 + R3_OFFSET;
      const depth3Pos = getCirclePointAtAngle(organicR3, baseNormal, angle);
      depth3Group.position.copy(depth3Pos);
      depth1Group.add(depth3Group);

      // ---- DEPTH 4 ----
      const depth4Group = new THREE.Group();
      const depth4Pos = depth2Pos.clone().add(verticalDir.clone().multiplyScalar(R4_HEIGHT));
      depth4Group.position.copy(depth4Pos);
      depth1Group.add(depth4Group);

      depth2Positions.push(depth2Pos);
      depth3Positions.push(depth3Pos);

      // Nodes
      depth2Group.add(createBillboardCircle(0.3, finalShapeCol));
      depth3Group.add(createBillboardCircle(0.2, finalShapeCol));
      depth4Group.add(createBillboardCircle(0.3, finalShapeCol));

      // Update background surface vertex
      bgPositions[(j + 1) * 3] = depth2Pos.x;
      bgPositions[(j + 1) * 3 + 1] = depth2Pos.y;
      bgPositions[(j + 1) * 3 + 2] = depth2Pos.z;
    }

    bgGeom.attributes.position.needsUpdate = true;

    // Lines depth1→depth2
    const lines2 = createLinesToChildren(depth2Positions, finalShapeCol, Array(DEPTH2_COUNT).fill(finalShapeCol));
    if (!(is2DMode && isInverted)) {
      depth1Group.add(lines2);
    }

    // Lines depth2→depth3
    const lines3 = createSegmentLines(depth2Positions, depth3Positions, finalShapeCol, finalShapeCol);
    depth1Group.add(lines3);
  }

  // Give the main system a random frozen rotation for variety
  const rotY = rng() * Math.PI * 2;
  const rotX = rng() * Math.PI * 0.5 - Math.PI * 0.25;
  if (!is2DMode) {
    mainSystem.rotation.y = rotY;
    mainSystem.rotation.x = rotX;
  }
}

// ============================================================
// 5. Render loop (replaces single frame render)
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  if (controls.enabled) controls.update();
  renderer.render(scene, camera);
}

function rebuildAndRender() {
  rng = mulberry32(currentSeed);
  buildScene();
}

// ============================================================
// 6. Export PNG at arbitrary resolution
// ============================================================
async function exportPNG(scale) {
  const baseW = Math.floor(window.innerWidth);
  const baseH = Math.floor(window.innerHeight);
  const fullWidth = baseW * scale;
  const fullHeight = baseH * scale;

  // We use a 2D canvas to stitch the tiles together, 
  // bypassing WebGL's maximum render target size (usually 8192px), which is often exceeded at x8 scale.
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = fullWidth;
  finalCanvas.height = fullHeight;
  const ctx = finalCanvas.getContext('2d');

  // Create a temporary tile renderer
  const exportRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  exportRenderer.setClearColor(0x000000, 0);
  exportRenderer.setSize(baseW, baseH);
  exportRenderer.setPixelRatio(1);

  const exportCamera = camera.clone();
  exportCamera.aspect = baseW / baseH;
  exportCamera.updateProjectionMatrix();

  // Render in segments (tiles)
  for (let y = 0; y < scale; y++) {
    for (let x = 0; x < scale; x++) {
      // Three.js sets view offsets from top-left, but 2D drawImage also starts top-left.
      // So viewY goes down.
      exportCamera.setViewOffset(
        fullWidth, fullHeight, 
        x * baseW, y * baseH, 
        baseW, baseH
      );
      exportRenderer.render(scene, exportCamera);
      ctx.drawImage(exportRenderer.domElement, x * baseW, y * baseH);
    }
  }
  exportCamera.clearViewOffset();

  // Convert final stitched canvas to blob
  const blob = await new Promise(resolve => {
    finalCanvas.toBlob(resolve, 'image/png');
  });

  // Use File System Access API (opens Finder save dialog)
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: `static_${currentSeed}_x${scale}.png`,
      types: [{
        description: 'PNG Image',
        accept: { 'image/png': ['.png'] }
      }]
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (err) {
    // User cancelled the dialog — that's fine
    if (err.name !== 'AbortError') console.error('Save failed:', err);
  }

  exportRenderer.dispose();
}


// ============================================================
// 7. Handle resizing
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// Initial build & start loop
// ============================================================
rebuildAndRender();
animate();
