// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import config from './site.config.mjs';

import svelte from '@astrojs/svelte';
import { fileURLToPath } from 'node:url';
import { depotLocal } from './scripts/lib/depot-local.mjs';

const racine = fileURLToPath(new URL('.', import.meta.url));

// https://astro.build/config
export default defineConfig({
  // Chemin de base sur GitHub Pages (voir site.config.mjs).
  base: config.base,

  trailingSlash: 'ignore',

  build: {
    // Un dossier par page : les URL restent propres sur GitHub Pages.
    format: 'directory',
  },

  vite: {
    // depotLocal : l'éditeur lit et écrit « content/ » pendant « npm run dev ».
    plugins: [tailwindcss(), depotLocal({ racine })],
  },

  integrations: [svelte()],
});