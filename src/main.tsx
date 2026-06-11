import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootstrapDisplayFromCache } from './lib/settingsLoader'

// Apply cached display settings BEFORE React mounts. Prevents theme flash
// on reload — the user-saved theme/font/radius is applied to the DOM
// synchronously from localStorage, then the real values load from Supabase
// in SettingsProvider and override if different.
bootstrapDisplayFromCache()

// ─── Disable scroll-wheel on <input type="number"> ────────────────────────
// Browser default: scrolling while a number input has focus changes the
// value as if you pressed arrow keys (up/down = +1/-1 each tick).
// On a trackpad you can fire dozens of ticks accidentally while looking
// at the form. Result: 352,800 silently becomes 352,782 — silent data
// corruption that's only visible after posting.
//
// Fix: when a number input is focused, capture the wheel event before
// the browser's default handler fires, and prevent it. The page still
// scrolls because we re-dispatch the wheel event one level up. The
// number input's increment behaviour is the only thing killed.
const blockWheelOnNumberInputs = () => {
  document.addEventListener(
    'wheel',
    (e) => {
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLInputElement &&
        target.type === 'number' &&
        document.activeElement === target
      ) {
        e.preventDefault()
        // Re-emit the wheel event on the document so the page still scrolls.
        // The input's number-value increment is the only behaviour killed.
        window.scrollBy({
          top: e.deltaY,
          left: e.deltaX,
          behavior: 'auto',
        })
      }
    },
    // Must NOT be passive — we need preventDefault to work
    { passive: false }
  )
}
blockWheelOnNumberInputs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
