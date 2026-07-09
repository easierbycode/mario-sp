import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // svelte-phaser is consumed from source (github: dependency) — make sure
    // it shares this app's phaser and svelte instances
    dedupe: ['phaser', 'svelte'],
  },
  optimizeDeps: {
    // its .svelte.ts source must go through the Svelte plugin, not esbuild
    // prebundling
    exclude: ['svelte-phaser'],
  },
})
