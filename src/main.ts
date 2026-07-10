import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'

console.log('🍄 Super Mario Land — 5velte-ph4ser edition loaded!')

// Orbitron — the CMG launcher's display face, self-hosted so it also works
// offline from the CMG Network cache. Loaded via the FontFace API to stay
// BASE_URL-relative (a CSS url() would break under a subpath deploy).
const orbitron = new FontFace(
  'Orbitron',
  `url(${import.meta.env.BASE_URL}assets/font/Orbitron-Variable.woff2)`,
  { weight: '400 900', display: 'swap' },
)
orbitron
  .load()
  .then((face) => document.fonts.add(face))
  .catch(() => {
    // font unavailable — the touch controls fall back to Courier New
  })

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
