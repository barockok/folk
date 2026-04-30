import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/components.css'
import './styles/onboarding.css'

createRoot(document.getElementById('root')!).render(<App />)

// Tear down the inline splash once React's first commit has scheduled. A
// rAF gives the browser one paint with React's tree before we fade the
// splash out, avoiding a flash of the bg color in between.
requestAnimationFrame(() => {
  const splash = document.getElementById('folk-splash')
  if (!splash) return
  splash.classList.add('hide')
  setTimeout(() => splash.remove(), 220)
})
