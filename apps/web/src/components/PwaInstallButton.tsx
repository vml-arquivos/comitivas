import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { emModoAplicativo, limparPromptInstalacao, obterPromptInstalacao, plataformaMovel } from '../utils/pwaInstall';

export function PwaInstallButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const [disponivel, setDisponivel] = useState(Boolean(obterPromptInstalacao()));
  const [instalado, setInstalado] = useState(emModoAplicativo());
  const plataforma = plataformaMovel();
  useEffect(() => {
    const pronto = () => setDisponivel(true);
    const concluido = () => { setInstalado(true); setDisponivel(false); };
    window.addEventListener('comitivas-install-available', pronto);
    window.addEventListener('appinstalled', concluido);
    return () => { window.removeEventListener('comitivas-install-available', pronto); window.removeEventListener('appinstalled', concluido); };
  }, []);
  if (instalado) return null;
  const instalar = async () => {
    const prompt = obterPromptInstalacao();
    if (prompt) {
      await prompt.prompt();
      const escolha = await prompt.userChoice;
      limparPromptInstalacao();
      setDisponivel(false);
      if (escolha.outcome === 'accepted') setInstalado(true);
      return;
    }
    navigate(`/aplicativo?platform=${plataforma.ios ? 'ios' : plataforma.android ? 'android' : 'desktop'}`);
  };
  return <button type="button" onClick={() => void instalar()} className={className} aria-label="Instalar aplicativo Excursão das Comitivas">
    <Download size={17} /> {disponivel ? 'Instalar agora' : plataforma.ios ? 'Instalar no iPhone' : 'Instalar aplicativo'}
  </button>;
}
