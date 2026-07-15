import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // relative asset paths in the build so the app runs from any subpath — the
  // CMG launcher serves the offline-cached copy from /cmg-net/mario-land/,
  // where absolute /assets/… would escape to the launcher root. Dev keeps the
  // root base (relative base confuses the HMR client).
  base: command === 'build' ? './' : '/',
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
}))
