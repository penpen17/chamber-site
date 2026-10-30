// =====================================================================
// viewer.js — the interactive 3D model, made with Three.js.
//
// How Three.js works, in one paragraph:
//   A SCENE holds 3D objects. A CAMERA looks at the scene. A RENDERER
//   draws what the camera sees into a <canvas> on the page, about 60
//   times per second. LIGHTS make surfaces visible, and MATERIALS decide
//   the color and shininess of each surface. CONTROLS let the visitor
//   rotate and zoom the camera with the mouse.
//
// The viewer is created once, then main.js calls viewer.load(model) to
// show a model from public/models/manifest.json. Each model can be:
//   - a .glb file exported from Blender (scripts/export_web_models.py), or
//   - a list of STL files ("parts")
// If nothing can be loaded, a simple placeholder chamber is shown.
//
// ✏️ To change WHICH models are shown, edit public/models/manifest.json, not this file.
// ✏️ Settings you might tweak are marked with ✏️ below.
// =====================================================================

import * as THREE from 'three';
// These are extra Three.js tools that are not part of the core library:
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'; // mouse rotate/zoom
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // reads .glb/.gltf files
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'; // unpacks compressed .glb files
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'; // reads .stl files
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'; // soft "studio" reflections

// Folder with the models. "models/" here means the folder public/models/ in the project
// (everything inside public/ is served as-is at the root of the website).
const MODEL_DIR = 'models/';

// The model is always scaled to this size, so the camera framing works for any model.
const MODEL_SIZE = 2.5;

// Checks whether a file exists before we try to load it.
// (The dev server answers a missing file with the HTML page instead of an error,
// so we also check that the answer is not HTML.)
async function exists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok && !(res.headers.get('content-type') || '').includes('text/html');
  } catch {
    return false;
  }
}

// Reads public/models/manifest.json and returns its list of models.
export async function loadManifest() {
  try {
    const manifest = await (await fetch(MODEL_DIR + 'manifest.json')).json();
    return manifest.models || [];
  } catch {
    console.warn('Could not read models/manifest.json — check it for typos (missing comma or quote).');
    return [];
  }
}

// Builds the 3D viewer inside `container` (the <div id="viewer"> in index.html).
// main.js calls this once. It returns an object with functions main.js can use,
// like load(), setExplode() and resetView().
export function createViewer(container, { onSelect } = {}) {
  // --- 1. Renderer: draws the 3D picture into a <canvas> element ---
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // alpha = see-through background
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // sharp on Retina screens, capped for speed
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // more natural, "photographic" colors
  container.appendChild(renderer.domElement); // put the canvas on the page

  // --- 2. Scene: the "world" that holds the model and lights ---
  const scene = new THREE.Scene();
  // Soft reflections, so plastic and glass look realistic instead of flat.
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  // --- 3. Camera ---
  // PerspectiveCamera(field of view in degrees, aspect ratio, nearest distance, farthest distance)
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const homePosition = new THREE.Vector3(3.1, 2.4, 3.8); // ✏️ starting viewpoint (x = right, y = up, z = toward you)
  camera.position.copy(homePosition);

  // --- 4. Mouse/touch controls: drag to rotate, scroll/pinch to zoom ---
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; // smooth "slow down" after you let go
  controls.autoRotateSpeed = 1.2; // ✏️ speed of the Auto-rotate button

  // --- 5. Lights ---
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2); // like sunlight from one direction; ✏️ 1.2 = brightness
  keyLight.position.set(3, 5, 2);
  scene.add(keyLight, new THREE.AmbientLight(0xffffff, 0.25)); // ambient = weak light from everywhere

  // --- 6. The current model ---
  // A Group is an invisible container; moving/scaling it moves all parts together.
  let model = null;
  let parts = []; // each part = { name, color, object, basePos, explodeDir }
  let selected = null;

  // Removes the current model and frees its memory (important when switching models).
  function clearModel() {
    if (!model) return;
    scene.remove(model);
    model.traverse((o) => {
      o.geometry?.dispose();
      [].concat(o.material || []).forEach((m) => m.dispose());
    });
    model = null;
    parts = [];
    selected = null;
  }

  // --- 7. Clicking a part to select it ---
  // A "raycaster" shoots an invisible ray from the camera through the mouse position
  // and reports which 3D object it hits first.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  renderer.domElement.addEventListener('click', (e) => {
    if (!model) return;
    // Convert the mouse position from pixels to the -1…+1 range that Three.js expects.
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hit = raycaster.intersectObjects(model.children, true)[0]; // closest object hit, or undefined
    // A part is usually a group of several meshes, so find the part that contains the hit mesh.
    const part = hit ? parts.find((p) => p.object === hit.object || p.object.getObjectById(hit.object.id)) : null;
    select(part);
  });

  function select(part) {
    if (selected) setGlow(selected.object, 0x000000); // remove the highlight from the previous part
    selected = part || null;
    if (selected) setGlow(selected.object, 0x1a3a7a); // ✏️ highlight color (hex, like CSS #1a3a7a)
    onSelect?.(selected);
  }

  // --- 8. Keep the picture the right size when the browser window changes size ---
  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix(); // the camera must be told after changing its settings
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // --- 9. The render loop: redraw the scene on every screen refresh (~60x per second) ---
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  // These are the functions main.js and animations.js can call.
  return {
    get parts() {
      return parts;
    },
    select,

    // Loads one model entry from manifest.json (replacing the current one) and returns its parts.
    async load(entry = {}) {
      const loaded = await loadParts(entry);
      clearModel();
      model = new THREE.Group();
      loaded.forEach((p) => model.add(p.object));
      scene.add(model);
      const size = centerModel(model); // move the model to the middle of the view
      prepareExplode(loaded, size, entry.explode); // work out where each part goes in the exploded view
      model.scale.setScalar(MODEL_SIZE / size); // same on-screen size whether the CAD was in mm or m
      parts = loaded;
      this.resetView();
      return parts;
    },

    // t = 0: assembled, t = 1: fully exploded (anything in between works too)
    setExplode(t) {
      parts.forEach((p) => p.object.position.copy(p.basePos).addScaledVector(p.explodeDir, t));
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
    },
    resetView() {
      camera.position.copy(homePosition);
      controls.target.set(0, 0, 0);
    },
  };
}

// Loads the parts of one model entry. Returns a list of parts.
async function loadParts(entry) {
  // Option A: a .glb file exported from Blender.
  // Each top-level object in the file (one per group in scripts/web_models.json)
  // becomes one clickable/explodable part.
  if (entry.glb && (await exists(MODEL_DIR + entry.glb))) {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader(); // needed because our Blender script compresses the file
    draco.setDecoderPath('draco/'); // decoder files live in public/draco/ (copied from node_modules/three)
    loader.setDRACOLoader(draco);
    const gltf = await loader.loadAsync(MODEL_DIR + entry.glb);
    gltf.scene.traverse((o) => [].concat(o.material || []).forEach(makeSeeThrough));
    return [...gltf.scene.children].map((obj) => ({
      name: (obj.name || 'Part').replace(/_/g, ' '), // the Blender exporter turns spaces into "_"
      color: averageColor(obj),
      object: obj,
    }));
  }

  // Option B: separate STL files, one per part (e.g. exported from Fusion 360).
  // CAD programs usually use Z as "up", but Three.js uses Y as "up", so we rotate them.
  const zUp = (entry.upAxis || 'Z').toUpperCase() === 'Z';
  const stlLoader = new STLLoader();
  const loaded = [];
  for (const p of entry.parts || []) {
    if (!(await exists(MODEL_DIR + p.file))) {
      console.info(`Skipping ${p.file}: not found in public/models/`);
      continue;
    }
    const geometry = await stlLoader.loadAsync(MODEL_DIR + p.file); // the shape (triangles)
    if (zUp) geometry.rotateX(-Math.PI / 2); // rotate 90° so "up" is correct
    geometry.computeVertexNormals(); // needed for smooth lighting
    const mesh = new THREE.Mesh(geometry, makeMaterial(p.color, p.opacity)); // mesh = shape + material
    mesh.name = p.name;
    loaded.push({ name: p.name, color: p.color, object: mesh });
  }

  // Option C: nothing found → show the placeholder.
  if (!loaded.length) console.warn(`Model "${entry.label || entry.id}" not found, showing the placeholder.`);
  return loaded.length ? loaded : placeholderParts();
}

// Color of the first material in a part, used for the colored dot in the part list.
function averageColor(object) {
  let color = null;
  object.traverse((o) => {
    if (!color && o.material?.color) color = '#' + o.material.color.getHexString();
  });
  return color;
}

// Creates the surface look of a part (only used for STL files and the placeholder;
// .glb files bring their own materials from Blender).
//   opacity 1  → solid plastic (MeshStandardMaterial)
//   opacity <1 → glass-like (MeshPhysicalMaterial with "transmission"), good for the coverslip
function makeMaterial(color = '#9aa4b1', opacity = 1) {
  if (opacity < 1) {
    return new THREE.MeshPhysicalMaterial({ color, transmission: 0.9, roughness: 0.05, thickness: 0.2, transparent: true, opacity });
  }
  // ✏️ roughness: 0 = mirror-shiny, 1 = matte. metalness: 0 = plastic, 1 = metal.
  return new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.45 });
}

// A simple stand-in chamber made of basic shapes, shown when a model file is missing.
function placeholderParts() {
  // Helper: make one part from a shape, a color and a height (y position).
  const makePart = (name, color, geometry, y, opacity) => {
    const mesh = new THREE.Mesh(geometry, makeMaterial(color, opacity));
    mesh.position.y = y;
    mesh.name = name;
    return { name, color, object: mesh };
  };
  // Helper: a ring (a circle with a round hole), extruded upward by `height`.
  const ring = (outerRadius, innerRadius, height) => {
    const shape = new THREE.Shape().absarc(0, 0, outerRadius, 0, Math.PI * 2);
    shape.holes.push(new THREE.Path().absarc(0, 0, innerRadius, 0, Math.PI * 2, true));
    return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 64 }).rotateX(-Math.PI / 2);
  };
  return [
    //        name                            color      shape                                         y     opacity
    makePart('Base plate (placeholder)',      '#9aa4b1', new THREE.BoxGeometry(3, 0.15, 2),               0),
    makePart('Coverslip (placeholder)',       '#cfefff', new THREE.CylinderGeometry(0.6, 0.6, 0.02, 64),  0.09, 0.35),
    makePart('Imaging well (placeholder)',    '#4f8cff', ring(0.65, 0.5, 0.35),                           0.1),
    makePart('Lid / perfusion (placeholder)', '#f2a65a', new THREE.CylinderGeometry(0.72, 0.72, 0.08, 64), 0.55),
  ];
}

// Moves the model so its center sits at (0, 0, 0), where the camera is looking.
// Returns the model's size (the length of its bounding box diagonal).
function centerModel(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group); // smallest box that fits around the model
  const center = box.getCenter(new THREE.Vector3());
  group.children.forEach((child) => child.position.sub(center));
  group.updateMatrixWorld(true);
  return box.getSize(new THREE.Vector3()).length();
}

// Works out the exploded view. This runs before the model is scaled.
//
// `spec` comes from "explode" in manifest.json:
//   - an object like { "Cap": [0, 0, 15] } → each named part moves that far, using the
//     SAME axes and units as in Blender (X, Y, Z in mm). Parts not listed stay in place.
//   - true → automatic: every part moves straight away from the middle of the model.
function prepareExplode(parts, size, spec) {
  parts.forEach((p) => {
    p.basePos = p.object.position.clone(); // remember the assembled position

    if (spec && typeof spec === 'object') {
      const [x, y, z] = spec[p.name] || [0, 0, 0];
      p.explodeDir = new THREE.Vector3(x, z, -y); // Blender (Z up) → Three.js (Y up)
      return;
    }

    const strength = 0.15; // ✏️ how far apart the parts move in the automatic mode
    const center = new THREE.Box3().setFromObject(p.object).getCenter(new THREE.Vector3());
    const away = center.length() < size * 0.01 ? new THREE.Vector3() : center.clone().normalize();
    p.explodeDir = away.multiplyScalar(size * strength).add(center.multiplyScalar(0.3));
  });
}

// Glass-like materials from Blender use "transmission" (light refracting through the
// material). On the web that looks like frosted glass and hides what's inside the
// chamber, so we turn it into simple see-through transparency instead.
function makeSeeThrough(material) {
  if (!material.transmission) return;
  const seeThrough = 0.85; // ✏️ 0 = solid, 1 = fully invisible (for a material with transmission 1 in Blender)
  material.opacity = Math.max(0.12, 1 - material.transmission * seeThrough);
  material.transmission = 0;
  material.transparent = true;
  material.depthWrite = false; // lets objects behind/inside the transparent part show through
}

// Makes a part glow slightly (used to show which part is selected).
// Note: parts that share one material in Blender will glow together.
function setGlow(object, hexColor) {
  object.traverse((child) => child.material?.emissive?.setHex(hexColor));
}
