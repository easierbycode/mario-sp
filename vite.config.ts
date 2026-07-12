import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  // honor a harness-assigned port (vite doesn't read PORT on its own)
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  plugins: [svelte()],
  resolve: {
    // 5velte-ph4ser and 5velte-ps2 are consumed from raw TS source — make
    // sure they share this app's phaser and svelte instances
    dedupe: ['phaser', 'svelte'],
  },
  optimizeDeps: {
    // their raw .ts/.svelte.ts source must go through the Svelte plugin /
    // vite pipeline, not esbuild prebundling
    exclude: ['5velte-ph4ser', '5velte-ps2'],
  },
})
