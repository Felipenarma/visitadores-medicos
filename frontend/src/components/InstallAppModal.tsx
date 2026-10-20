import React, { useState } from 'react';
import { X, Share, PlusSquare, MoreVertical, Smartphone, Copy, Check } from 'lucide-react';
import { detectPlatform } from '../utils/pwaInstall';

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{n}</span>
      <span className="text-sm text-gray-700 leading-relaxed">{children}</span>
    </li>
  );
}

export default function InstallAppModal({ onClose }: { onClose: () => void }) {
  const platform = detectPlatform();
  const [copied, setCopied] = useState(false);
  const url = window.location.origin;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  let content: React.ReactNode;
  if (platform === 'in-app') {
    content = (
      <>
        <p className="text-sm text-gray-600 mb-3">
          Estás dentro del navegador de otra app (WhatsApp, Instagram, etc.), que no permite instalar. Ábrela en tu navegador:
        </p>
        <ol className="space-y-3">
          <Step n={1}>Toca el menú <MoreVertical size={14} className="inline" /> o <strong>···</strong> arriba a la derecha.</Step>
          <Step n={2}>Elige <strong>"Abrir en Chrome"</strong> (Android) o <strong>"Abrir en Safari"</strong> (iPhone).</Step>
          <Step n={3}>Vuelve a tocar <strong>"Descargar app"</strong> en el menú.</Step>
        </ol>
      </>
    );
  } else if (platform === 'ios-other') {
    content = (
      <>
        <p className="text-sm text-gray-600 mb-3">En iPhone la app solo se puede instalar desde <strong>Safari</strong>.</p>
        <ol className="space-y-3">
          <Step n={1}>Copia el enlace con el botón de abajo.</Step>
          <Step n={2}>Abre <strong>Safari</strong>, pega el enlace e ingresa.</Step>
          <Step n={3}>Toca <Share size={14} className="inline" /> <strong>Compartir</strong> → <PlusSquare size={14} className="inline" /> <strong>"Agregar a inicio"</strong>.</Step>
        </ol>
      </>
    );
  } else if (platform === 'ios-safari') {
    content = (
      <ol className="space-y-3">
        <Step n={1}>Toca el botón <Share size={14} className="inline" /> <strong>Compartir</strong> (abajo al centro, o arriba en iPad).</Step>
        <Step n={2}>Desliza hacia abajo y elige <PlusSquare size={14} className="inline" /> <strong>"Agregar a inicio"</strong>.</Step>
        <Step n={3}>Toca <strong>"Agregar"</strong>. El ícono de Narma quedará en tu pantalla de inicio.</Step>
      </ol>
    );
  } else if (platform === 'android') {
    content = (
      <ol className="space-y-3">
        <Step n={1}>Abre esta página en <strong>Google Chrome</strong>.</Step>
        <Step n={2}>Toca el menú <MoreVertical size={14} className="inline" /> (arriba a la derecha).</Step>
        <Step n={3}>Elige <strong>"Instalar app"</strong> o <strong>"Agregar a pantalla principal"</strong>.</Step>
        <Step n={4}>Confirma con <strong>"Instalar"</strong>.</Step>
      </ol>
    );
  } else {
    content = (
      <ol className="space-y-3">
        <Step n={1}>En el celular, abre <strong>{url}</strong> en Chrome (Android) o Safari (iPhone).</Step>
        <Step n={2}>Inicia sesión y toca <strong>"Descargar app"</strong> en el menú.</Step>
        <Step n={3}>En computador (Chrome/Edge) también puedes usar el ícono de instalar en la barra de direcciones.</Step>
      </ol>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl p-5 pb-8 sm:pb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <Smartphone size={18} className="text-white" />
            </div>
            <h2 className="font-bold text-gray-900">Instalar la app Narma</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-500" /></button>
        </div>
        {content}
        <button onClick={copyLink} className="mt-5 w-full flex items-center justify-center gap-2 border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {copied ? <><Check size={16} className="text-green-600" /> Enlace copiado</> : <><Copy size={16} /> Copiar enlace de la app</>}
        </button>
      </div>
    </div>
  );
}
