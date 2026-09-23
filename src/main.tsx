import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initTheme } from './hooks/useTheme'
import { applyLegacyHashRouteConversion } from './utils/legacyHashRoute'
import './index.css'

// Convert old hash links (e.g. /#/login, /#/pay/42) to clean paths BEFORE the
// router mounts, so BrowserRouter picks up the right initial location.
applyLegacyHashRouteConversion()

// Initialize theme BEFORE React renders
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
