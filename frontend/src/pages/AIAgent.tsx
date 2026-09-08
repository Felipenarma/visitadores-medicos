import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Download, ExternalLink, Mic, Square } from 'lucide-react';
import { agentApi, repsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import type { AgentMessage, MedicalRep } from '../types';

function RenderMessage({ content, isUser }: { content: string; isUser: boolean }) {
  // Clean markdown bold/italic before processing
  let cleaned = content.replace(/\*\*/g, '').replace(/\*/g, '');

  // Find all URLs in text
  const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
  const imageApiPattern = /\/api\/images\/\d+\/file/;

  const parts: { type: 'text' | 'url' | 'image'; value: string }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlPattern.exec(cleaned)) !== null) {
    // Add text before URL
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: cleaned.slice(lastIndex, match.index) });
    }

    const url = match[1].replace(/[)\].,;:!?]+$/, ''); // Clean trailing punctuation
    const isImage = imageApiPattern.test(url) || /\.(png|jpg|jpeg|gif|webp)$/i.test(url);
    parts.push({ type: isImage ? 'image' : 'url', value: url });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    parts.push({ type: 'text', value: cleaned.slice(lastIndex) });
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', value: cleaned });
  }

  return (
    <div className="whitespace-pre-wrap leading-relaxed break-words">
      {parts.map((part, i) => {
        if (part.type === 'image') {
          return (
            <div key={i} className="my-3">
              <img src={part.value} alt="QR / Imagen" className="w-48 max-w-full rounded-lg border border-gray-200 shadow-sm" />
              <div className="flex gap-2 mt-2">
                <a href={part.value} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium">
                  <ExternalLink size={14} /> Abrir
                </a>
                <a href={part.value} download="qr-code.png"
                  className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 font-medium">
                  <Download size={14} /> Descargar
                </a>
              </div>
            </div>
          );
        }

        if (part.type === 'url') {
          return (
            <a key={i} href={part.value} target="_blank" rel="noopener noreferrer"
              className={`underline break-all ${isUser ? 'text-blue-100 hover:text-white' : 'text-blue-600 hover:text-blue-800'}`}>
              {part.value.length > 50 ? part.value.slice(0, 50) + '...' : part.value}
            </a>
          );
        }

        return <span key={i}>{part.value}</span>;
      })}
    </div>
  );
}

export default function AIAgent() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [repInfo, setRepInfo] = useState<MedicalRep | null>(null);
  const [selectedRepId, setSelectedRepId] = useState<number | undefined>(user?.rep_id);
  const [allReps, setAllReps] = useState<MedicalRep[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Dictado por voz (Web Speech API) ─────────────────────────────────────
  // Gratis, sin backend: funciona en Chrome/Android y Safari 14.5+/iPhone.
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const keepRecordingRef = useRef(false);
  const baseTextRef = useRef('');
  const SpeechRecognitionAPI =
    typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const speechSupported = !!SpeechRecognitionAPI;

  useEffect(() => {
    return () => {
      keepRecordingRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  const startRecording = () => {
    if (!speechSupported || isRecording) return;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'es-CL';
    recognition.continuous = true;
    recognition.interimResults = true;

    baseTextRef.current = input.trim() ? input.trim() + ' ' : '';
    keepRecordingRef.current = true;

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      if (finalTranscript) {
        baseTextRef.current = baseTextRef.current + finalTranscript + ' ';
      }
      setInput(baseTextRef.current + interimTranscript);
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' y algunos 'network' son transitorios: se reintenta en onend.
      if (event.error !== 'no-speech' && event.error !== 'network') {
        keepRecordingRef.current = false;
        setIsRecording(false);
      }
    };

    recognition.onend = () => {
      if (keepRecordingRef.current) {
        // Chrome/Safari cortan el reconocimiento tras ~60s de silencio;
        // se reinicia automáticamente para que el dictado no se corte solo.
        try { recognition.start(); } catch { /* ya estaba corriendo */ }
      } else {
        setIsRecording(false);
      }
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
  };

  const stopRecording = () => {
    keepRecordingRef.current = false;
    recognitionRef.current?.stop();
    setIsRecording(false);
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      repsApi.getAll().then(setAllReps).catch(console.error);
    } else if (user?.rep_id) {
      repsApi.getOne(user.rep_id).then(setRepInfo).catch(console.error);
    }
  }, [user]);

  useEffect(() => {
    if (selectedRepId && user?.role === 'admin') {
      repsApi.getOne(selectedRepId).then(setRepInfo).catch(console.error);
    }
  }, [selectedRepId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cargar la conversación guardada en el servidor para este visitador
  // (persiste entre recargas de página y entre dispositivos).
  useEffect(() => {
    const effectiveRepId = selectedRepId || user?.rep_id;
    if (!effectiveRepId) return;
    agentApi.getHistory(effectiveRepId)
      .then(res => {
        setMessages(res.messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
      })
      .catch(console.error);
  }, [selectedRepId, user?.rep_id]);

  const handleSend = async () => {
    const repId = selectedRepId || user?.rep_id;
    if (!input.trim() || !repId || loading) return;

    const userMsg: AgentMessage = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await agentApi.chat({
        message: userMsg.content,
        rep_id: repId,
        conversation_history: messages,
      });
      const assistantMsg: AgentMessage = { role: 'assistant', content: res.response };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      const errMsg: AgentMessage = {
        role: 'assistant',
        content: e.response?.data?.detail || 'Error al conectar con el agente. Verifica que ANTHROPIC_API_KEY esté configurada.',
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const repId = selectedRepId || user?.rep_id;

  const suggestions = [
    '¿Cuáles son mis visitas de hoy?',
    '¿Qué médicos tengo asignados?',
    'Muéstrame mis próximas visitas esta semana',
    '¿Cuál es el médico con más visitas?',
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agente IA</h1>
          <p className="text-gray-500 text-sm mt-1">Asistente inteligente para visitadores médicos</p>
        </div>
        {user?.role === 'admin' && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 whitespace-nowrap">Contexto de visitador:</label>
            <select
              className="input w-48"
              value={selectedRepId || ''}
              onChange={e => setSelectedRepId(e.target.value ? parseInt(e.target.value) : undefined)}
            >
              <option value="">Seleccionar visitador</option>
              {allReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Rep context banner */}
      {repInfo && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
            {repInfo.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium text-blue-900">{repInfo.name}</p>
            <p className="text-xs text-blue-600">{[repInfo.territory, repInfo.zone].filter(Boolean).join(' · ') || 'Sin territorio asignado'}</p>
          </div>
        </div>
      )}

      {!repId && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-sm text-orange-700">
            {user?.role === 'admin'
              ? 'Selecciona un visitador para usar el agente IA'
              : 'No tienes un ID de visitador configurado. Contacta al administrador.'}
          </p>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
              <Bot size={32} className="text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Asistente de Visitadores Médicos</h3>
            <p className="text-gray-500 text-sm max-w-md mb-6">
              Puedo ayudarte a gestionar tu agenda, consultar información de médicos y registrar visitas.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-left text-sm p-3 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 rounded-lg border border-gray-200 hover:border-blue-200 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                  msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-100'
                }`}>
                  {msg.role === 'user'
                    ? <User size={16} className="text-white" />
                    : <Bot size={16} className="text-gray-600" />
                  }
                </div>
                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                  <RenderMessage content={msg.content} isUser={msg.role === 'user'} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  <Bot size={16} className="text-gray-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 size={16} className="text-gray-400 animate-spin" />
                  <span className="text-sm text-gray-400">Procesando...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-3">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!repId || loading}
          placeholder={
            !repId
              ? 'Selecciona un visitador para continuar'
              : isRecording
                ? 'Escuchando... habla ahora'
                : 'Escribe tu mensaje... (Enter para enviar, Shift+Enter para nueva línea)'
          }
          rows={2}
          className={`flex-1 input resize-none ${isRecording ? 'ring-2 ring-red-400' : ''}`}
        />
        {speechSupported && (
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!repId || loading}
            title={isRecording ? 'Detener dictado' : 'Dictar por voz'}
            className={`px-4 flex items-center justify-center self-end rounded-xl border transition-colors ${
              isRecording
                ? 'bg-red-500 border-red-500 text-white animate-pulse'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {isRecording ? <Square size={18} /> : <Mic size={20} />}
          </button>
        )}
        <button
          onClick={handleSend}
          disabled={!input.trim() || !repId || loading}
          className="btn-primary px-4 flex items-center justify-center self-end"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
        </button>
      </div>

      {messages.length > 0 && (
        <div className="mt-2 text-center">
          <button
            onClick={() => {
              setMessages([]);
              if (repId) agentApi.clearHistory(repId).catch(console.error);
            }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Limpiar conversación
          </button>
        </div>
      )}
    </div>
  );
}
