import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import 'leaflet/dist/leaflet.css'
import { initConfigSyncBridge } from '@/lib/config-sync-bridge'

function applyEmbedDisplayParams() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('text') === 'black') {
      document.documentElement.classList.add('embed-black-text')
    }
  } catch {
    /* ignore */
  }
}

applyEmbedDisplayParams()
initConfigSyncBridge()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
