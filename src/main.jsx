import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import 'leaflet/dist/leaflet.css'
import { initConfigSyncBridge } from '@/lib/config-sync-bridge'

initConfigSyncBridge()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
