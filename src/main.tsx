import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'
import { browserEnv } from './app/env'
import { createAppStore } from './app/store'
import { App } from './ui/App'

// Точка входа: собирает окружение браузера и рисует приложение.
const store = createAppStore(browserEnv())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
)
