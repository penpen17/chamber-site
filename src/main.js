// =====================================================================
// main.js — the "glue" file. The browser runs this first (index.html
// loads it at the bottom with <script type="module" src="/src/main.js">).
//
// It does four things:
//   1. Starts the text animations (from animations.js)
//   2. Creates the 3D viewer (from viewer.js)
//   3. Makes one tab per model listed in public/models/manifest.json
//   4. Connects the tabs, buttons and slider to the 3D viewer
//
// You usually don't need to edit this file.
// =====================================================================

// "import" pulls in functions written in other files.
import { createViewer, loadManifest } from './viewer.js';
import { introAnimations, scrollReveal, explodeOnLoad, playVideosWhenVisible } from './animations.js';

// Start the text animations first, so the page text always shows up
// even if the 3D part fails (for example, an old computer without WebGL).
introAnimations();
scrollReveal();
playVideosWhenVisible();

// document.getElementById('xyz') finds the HTML element with id="xyz" in index.html.
const viewerEl = document.getElementById('viewer');
const tabsEl = document.getElementById('model-tabs'); // one button per model
const captionEl = document.getElementById('model-caption'); // sentence under the viewer
const listEl = document.getElementById('part-list'); // list of part names on top of the 3D view
const explodeLabel = document.getElementById('explode-label'); // "Explode" text + slider
const explodeEl = document.getElementById('explode'); // the slider itself
const rotateBtn = document.getElementById('autorotate');
const resetBtn = document.getElementById('reset');

try {
  const viewer = createViewer(viewerEl, {
    // Runs whenever a part is selected (by clicking the model or the list):
    // highlights the matching name in the list.
    onSelect(part) {
      [...listEl.children].forEach((li) => li.classList.toggle('active', li.textContent === part?.name));
    },
  });

  const models = await loadManifest(); // "await" = wait until the file has been read

  // Shows one model: loads it, then updates the part list, caption and slider.
  async function show(index) {
    const entry = models[index] || {};
    [...tabsEl.children].forEach((btn, i) => btn.classList.toggle('on', i === index));
    viewerEl.classList.add('loading');
    const parts = await viewer.load(entry);
    viewerEl.classList.remove('loading');

    listEl.innerHTML = parts
      .map((p, i) => `<li data-i="${i}"><i style="background:${p.color || '#9aa4b1'}"></i>${p.name}</li>`)
      .join('');
    captionEl.textContent = entry.caption || '';
    explodeLabel.hidden = !entry.explode; // only show the slider where exploding makes sense
    explodeEl.value = 0;
    return entry;
  }

  // One tab button per model in manifest.json.
  tabsEl.innerHTML = models.map((m, i) => `<button type="button" data-i="${i}">${m.label || m.id}</button>`).join('');
  tabsEl.hidden = models.length < 2; // no tabs needed for a single model
  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) show(Number(btn.dataset.i));
  });

  // Clicking a name in the list selects that part in 3D.
  listEl.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) viewer.select(viewer.parts[li.dataset.i]);
  });

  // Moving the slider moves the parts apart (0 = assembled, 1 = fully exploded).
  explodeEl.addEventListener('input', () => viewer.setExplode(Number(explodeEl.value)));

  // classList.toggle('on') adds/removes the "on" style and returns true if it's now on.
  rotateBtn.addEventListener('click', () => viewer.setAutoRotate(rotateBtn.classList.toggle('on')));
  resetBtn.addEventListener('click', () => viewer.resetView());

  // Show the first model (or the one in the link, e.g. yoursite.com/?model=printing),
  // and play the "take apart, then put back together" animation once.
  const wanted = new URLSearchParams(location.search).get('model');
  const first = await show(Math.max(0, models.findIndex((m) => m.id === wanted)));
  if (first.explode) explodeOnLoad(viewer, explodeEl);
} catch (err) {
  // If anything above fails, show a message instead of an empty box.
  // The real error is printed in the browser console (right-click → Inspect → Console).
  console.error('3D viewer failed to load:', err);
  viewerEl.innerHTML = '<p class="viewer-error">The 3D model could not be loaded.</p>';
}
