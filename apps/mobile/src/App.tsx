import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { App as WebApp } from '../../web/src/App';

export function App() {
  useEffect(() => {
    let ativo = true;
    const registrar = async () => {
      const listener = await CapacitorApp.addListener('backButton', () => {
        if (window.history.length > 1) window.history.back();
        else CapacitorApp.exitApp();
      });
      if (!ativo) await listener.remove();
      return listener;
    };

    let remover: (() => Promise<void>) | undefined;
    registrar().then((listener) => {
      remover = () => listener.remove();
    });

    return () => {
      ativo = false;
      remover?.();
    };
  }, []);

  return <WebApp />;
}

export default App;
