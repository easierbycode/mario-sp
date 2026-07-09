import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'

console.log('🍄 Super Mario Land — 5velte-ph4ser edition loaded!')

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
