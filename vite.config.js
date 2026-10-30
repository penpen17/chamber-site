import { defineConfig } from 'vite';

// base: './' keeps asset paths relative so the build works on GitHub Pages sub-paths.
// es2022 allows top-level await in main.js.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
