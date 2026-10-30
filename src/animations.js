// =====================================================================
// animations.js — all the motion on the page, made with anime.js.
//
// The basic anime.js pattern is:
//     animate(WHAT, { PROPERTY: [from, to], duration: ms, delay: ms, ease: '...' })
//   WHAT     = a CSS selector like '.card' or a plain JS object
//   duration = how long it takes, in milliseconds (1000 = 1 second)
//   stagger  = start each item a bit after the previous one (a "wave" effect)
//   ease     = the speed curve: 'outCubic', 'inOutCubic', 'outExpo', ...
//              (see https://animejs.com/documentation/ for the list)
//
// ✏️ EDIT: change the duration/delay numbers below to make things faster or slower.
// =====================================================================

import { animate, stagger } from 'animejs';

// Some people turn off animations in their system settings (motion sickness etc.).
// If they did, we skip the motion and just show everything.
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Hero section: text slides up and fades in, numbers count up from 0.
export function introAnimations() {
  if (reduced) {
    document.querySelectorAll('[data-count]').forEach((el) => (el.textContent = el.dataset.count));
    return;
  }

  // Every direct child of .hero-text (eyebrow, title, lede, stats) fades in, one after another.
  animate('.hero-text > *', {
    opacity: [0, 1],
    translateY: [24, 0], // start 24px lower, move up to its normal place
    delay: stagger(120), // each item starts 120 ms after the previous one
    duration: 800,
    ease: 'outCubic',
  });

  // Count-up numbers. The final number comes from data-count="..." in index.html.
  document.querySelectorAll('[data-count]').forEach((el) => {
    const counter = { value: 0 };
    animate(counter, {
      value: Number(el.dataset.count),
      duration: 1600,
      delay: 600,
      ease: 'outExpo',
      onUpdate: () => (el.textContent = Math.round(counter.value)), // write the current number on screen
    });
  });
}

// Sections fade in when you scroll down to them.
// IntersectionObserver is a built-in browser tool that tells us when an element becomes visible.
export function scrollReveal() {
  const revealItems = '.section h2, .card, .timeline .step, .gallery figure';

  if (reduced) return; // CSS already shows everything in this case

  // style.css hides these items at first; we fade them in on scroll.
  document.querySelectorAll(revealItems).forEach((el) => (el.style.opacity = 0));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return; // not on screen yet
        const items = entry.target.querySelectorAll('h2, .card, .timeline .step, .gallery figure');
        animate(items, { opacity: [0, 1], translateY: [30, 0], delay: stagger(90), duration: 700, ease: 'outQuad' });
        observer.unobserve(entry.target); // only animate once
      });
    },
    { threshold: 0.15 }, // start when 15% of the section is visible
  );
  document.querySelectorAll('.section').forEach((section) => observer.observe(section));
}

// When the page opens: move the 3D parts apart, wait, then put them back together.
// This shows visitors right away that the chamber is made of several parts.
export function explodeOnLoad(viewer, slider) {
  if (reduced) return;
  const state = { t: 0 }; // 0 = assembled, 1 = exploded
  const update = () => {
    viewer.setExplode(state.t);
    slider.value = state.t; // keep the slider in sync with the animation
  };
  // Keyframes = several steps in one animation: first go to 1 (apart), then back to 0 (assembled).
  animate(state, {
    t: [
      { to: 1, duration: 1400 },             // take apart
      { to: 0, duration: 1400, delay: 600 }, // wait 0.6 s, then put back together
    ],
    delay: 800, // wait 0.8 s after the page opens
    ease: 'inOutCubic',
    onUpdate: update,
  });
}

// Videos marked with data-autoplay in index.html play only while they are on screen.
// With preload="none" they don't download at all until the visitor scrolls to them,
// so the big time-lapse files don't slow down the first page load.
export function playVideosWhenVisible() {
  const videos = document.querySelectorAll('video[data-autoplay]');
  if (reduced) {
    videos.forEach((v) => (v.controls = true)); // no autoplay: show play buttons instead
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting) video.play().catch(() => (video.controls = true)); // if autoplay is blocked, show controls
        else video.pause();
      });
    },
    { threshold: 0.4 }, // start when 40% of the video is visible
  );
  videos.forEach((v) => observer.observe(v));
}
