import { useEffect, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import './App.css'

export function App() {
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    CapacitorApp.addListener('backButton', () => {
      // Implementar lógica de volta
    })

    setAppReady(true)
  }, [])

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <img src="/assets/brand/icon.svg" alt="Comitiva" className="logo" />
          <h1>Comitiva</h1>
        </div>
      </header>

      <main className="app-content">
        {appReady ? (
          <div className="welcome-section">
            <h2>Bem-vindo ao Comitiva</h2>
            <p>Aplicativo de excursões e eventos</p>
            <button className="btn-primary">Começar</button>
          </div>
        ) : (
          <div className="loading">Carregando...</div>
        )}
      </main>

      <footer className="app-footer">
        <p>&copy; 2024 Comitiva. Todos os direitos reservados.</p>
      </footer>
    </div>
  )
}
