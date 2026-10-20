import { useEffect, useState } from 'react';

// Captura GLOBAL del evento `beforeinstallprompt`.
// Debe importarse en main.tsx antes de renderizar: Chrome/Android dispara el
// evento una sola vez y muy temprano (normalmente en la pantalla de login),
// así que si lo escuchamos recién dentro del Layout se pierde.

let deferredPrompt: any = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return installed
    || window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as any).standalone === true;
}

export type Platform = 'ios-safari' | 'ios-other' | 'android' | 'in-app' | 'desktop';

export function detectPlatform(): Platform {
  const ua = window.navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Navegadores internos de WhatsApp, Instagram, Facebook, LinkedIn, etc.
  const inApp = /FBAN|FBAV|Instagram|Line\/|WhatsApp|LinkedInApp|; wv\)/i.test(ua);
  if (inApp) return 'in-app';
  if (isIOS) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? 'ios-other' : 'ios-safari';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const p = deferredPrompt;
  p.prompt();
  const choice = await p.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferredPrompt = null;
  if (choice?.outcome === 'accepted') installed = true;
  notify();
  return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
}

export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', l);
    return () => { listeners.delete(l); mq.removeEventListener?.('change', l); };
  }, []);
  return {
    canPromptNatively: !!deferredPrompt,
    standalone: isStandalone(),
    promptInstall,
  };
}
