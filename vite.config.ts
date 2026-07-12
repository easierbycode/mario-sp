import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig({
  // honor a harness-assigned port (vite doesn't read PORT on its own)
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
  plugins: [svelte()],
  resolve: {
    // svelte-phaser and 5velte-ps2 are consumed from source (github:/file:
    // dependencies) — make sure they share this app's phaser and svelte
    // instances
    dedupe: ['phaser', 'svelte'],
  },
  optimizeDeps: {
    // their raw .ts/.svelte.ts source must go through the Svelte plugin /
    // vite pipeline, not esbuild prebundling
    exclude: ['svelte-phaser', '5velte-ps2'],
  },
})
