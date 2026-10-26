import React, { ReactNode, useState } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { Download, X } from 'lucide-react';
import LocationPermissionGate from './LocationPermissionGate';
import { useInstallPrompt } from '../utils/pwaInstall';

interface LayoutProps {
  children: ReactNode;
}

function InstallAppBanner() {
  const { canPromptNatively, standalone, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('vm_install_dismissed') === '1');
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

  const dismiss = () => {
    setDismissed(true);
    try { sessionStorage.setItem('vm_install_dismissed', '1'); } catch {}
  };

  if (dismissed || standalone) return null;
  if (!canPromptNatively && !isIOS) return null;

  const install = async () => {
    const r = await promptInstall();
    if (r !== 'unavailable') dismiss();
  };

  return (
    <div className="flex items-center gap-3 bg-blue-50 border-b border-blue-200 px-4 lg:px-6 py-2.5 text-sm mt-14 lg:mt-0">
      <Download size={15} className="text-blue-600 flex-shrink-0" />
      <p className="text-blue-800 flex-1">
        {isIOS && !canPromptNatively
          ? <><strong>Instala esta app:</strong> toca <strong>Compartir</strong> y luego <strong>"Agregar a inicio"</strong>.</>
          : <><strong>Instala esta app</strong> en tu celular para acceder más rápido, como cualquier otra app.</>}
      </p>
      {canPromptNatively && (
        <button onClick={install} className="btn-primary py-1 px-3 text-xs flex-shrink-0">
          Instalar
        </button>
      )}
      <button onClick={dismiss} className="text-blue-400 hover:text-blue-600 flex-shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}

export default function Layout({ children }: LayoutProps) {
  const { isAdmin } = useAuth();

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto w-full flex flex-col">
        <InstallAppBanner />
        {!isAdmin && <LocationPermissionGate />}
        <div className="p-4 lg:p-6 max-w-7xl mx-auto pt-16 lg:pt-6 w-full flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
