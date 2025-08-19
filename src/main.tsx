import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// Attempt to expose a lightweight debug API for HID diagnostics in dev builds
// This avoids relying on dynamic ESM import from the DevTools console when module resolution fails.
type JoycoreDebugAPI = {
  invoke: <T=unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>
  hidDiag: () => Promise<unknown>
  hidMap: () => Promise<unknown>
  hidFull: () => Promise<unknown>
  hidStates: () => Promise<unknown>
}

declare global {
  interface Window { joycore?: JoycoreDebugAPI }
}

if (import.meta.env.DEV) {
  // Lazy load to avoid bundling cost if unused
  import('@tauri-apps/api/core').then(core => {
    window.joycore = {
      invoke: core.invoke,
      hidDiag: () => core.invoke('hid_button_bit_diagnostics'),
      hidMap: () => core.invoke('hid_mapping_details'),
      hidFull: () => core.invoke('debug_full_hid_report'),
      hidStates: () => core.invoke('read_button_states'),
    }
  console.log('[JoyCore-X] Debug API available: window.joycore.{invoke,hidDiag,hidMap,hidFull,hidStates}')
  }).catch(() => {/* ignore */})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
