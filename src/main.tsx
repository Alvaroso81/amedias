import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './services/supabase'
import App from './App.tsx'
import { PwaConnectionStatus } from './components/PwaConnectionStatus.tsx'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PwaConnectionStatus />
    <PwaUpdatePrompt />
  </StrictMode>,
)
