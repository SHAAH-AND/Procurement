import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// HashRouter, deliberately: the client is static files under /app on Catalyst
// web hosting, which returns 404 for any path that is not a real file. Every
// in-app URL therefore lives after the hash (/app/#/workspace/pr), which also
// survives a hard reload and can be bookmarked.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
