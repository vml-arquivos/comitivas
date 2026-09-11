import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
import { guardarPromptInstalacao } from './utils/pwaInstall'

// O evento pode ocorrer antes da página /aplicativo ser aberta. Capturá-lo no
// bootstrap permite que qualquer CTA inicie imediatamente o diálogo do Android.
window.addEventListener('beforeinstallprompt', guardarPromptInstalacao)

const navigatorIOS = navigator as Navigator & { standalone?: boolean }
const dispositivoIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const modoInstalado = window.matchMedia('(display-mode: standalone)').matches
  || navigatorIOS.standalone === true

if (dispositivoIOS && modoInstalado) {
  document.documentElement.classList.add('ios-pwa-standalone')
  document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.setAttribute(
    'content',
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('[PWA] Falha ao registrar service worker:', error);
    });
  });
}
