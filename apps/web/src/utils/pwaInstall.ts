export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type PwaWindow = Window & { __comitivasInstallPrompt?: InstallPromptEvent | null };

export function guardarPromptInstalacao(event: Event) {
  event.preventDefault();
  (window as PwaWindow).__comitivasInstallPrompt = event as InstallPromptEvent;
  window.dispatchEvent(new CustomEvent('comitivas-install-available'));
}

export function obterPromptInstalacao(): InstallPromptEvent | null {
  return (window as PwaWindow).__comitivasInstallPrompt || null;
}

export function limparPromptInstalacao() {
  (window as PwaWindow).__comitivasInstallPrompt = null;
}

export function emModoAplicativo() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function plataformaMovel() {
  const ua = navigator.userAgent.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return { ios, android: /android/.test(ua) };
}
