import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, BarChart2, TrendingUp, Users, Activity } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { AgentMessage } from '../../types';
import api from '../../api';

const BASE = '/mike';

const mikeApi = {
  chat: (data: { message: string; conversation_history: AgentMessage[] }) =>
    api.post<{ response: string; conversation_history: AgentMessage[] }>(`${BASE}/chat`, data).then(r => r.data),
};

function RenderMessage({ content, isUser }: { content: string; isUser: boolean }) {
  const cleaned = content.replace(/\*\*/g, '').replace(/\*/g, '');
  return (
    <div className="whitespace-pre-wrap leading-relaxed break-words text-sm">
      {cleaned}
    </div>
  );
}

const SUGGESTIONS = [
  { icon: <BarChart2 size={16} />, text: '¿Cómo va el desempeño de los visitadores este mes?' },
  { icon: <TrendingUp size={16} />, text: '¿Cuáles son los 10 médicos con más ventas en abril 2026?' },
  { icon: <Users size={16} />, text: '¿Cuántos médicos nuevos tuvimos este mes?' },
  { icon: <Activity size={16} />, text: 'Muéstrame la tendencia de ventas de los últimos 6 meses' },
  { icon: <BarChart2 size={16} />, text: '¿Qué visitador tiene la tasa de cumplimiento más baja?' },
  { icon: <TrendingUp size={16} />, text: '¿Qué médicos no han sido visitados en los últimos 45 días?' },
];

export default function Mike() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: AgentMessage = { role: 'user', content: msg };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await mikeApi.chat({
        message: userMsg.content,
        conversation_history: messages,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.response }]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: e.response?.data?.detail || 'Error al conectar con Mike. Verifica que ANTHROPIC_API_KEY esté configurada.',
      }]);
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

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
          <Sparkles size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mike</h1>
          <p className="text-gray-500 text-sm">Agente IA de análisis — Narma</p>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-xl p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-purple-200 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <Sparkles size={32} className="text-violet-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1 text-lg">Hola Felipe, soy Mike</h3>
            <p className="text-gray-500 text-sm max-w-md mb-6">
              Tu asistente de análisis para Narma. Puedo ayudarte a revisar el desempeño de visitadores,
              analizar ventas, identificar oportunidades y gestionar tu cartera de médicos.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s.text)}
                  className="flex items-center gap-2 text-left text-sm p-3 bg-gray-50 hover:bg-violet-50 hover:text-violet-700 rounded-lg border border-gray-200 hover:border-violet-200 transition-colors"
                >
                  <span className="text-gray-400">{s.icon}</span>
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                  msg.role === 'user'
                    ? 'bg-violet-600'
                    : 'bg-gradient-to-br from-violet-100 to-purple-200'
                }`}>
                  {msg.role === 'user'
                    ? <User size={15} className="text-white" />
                    : <Sparkles size={15} className="text-violet-600" />
                  }
                </div>
                <div className={`max-w-[78%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white rounded-tr-sm'
                    : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                  <RenderMessage content={msg.content} isUser={msg.role === 'user'} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-100 to-purple-200 flex items-center justify-center">
                  <Sparkles size={15} className="text-violet-600" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 size={15} className="text-violet-400 animate-spin" />
                  <span className="text-sm text-gray-400">Analizando...</span>
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
          disabled={loading}
          placeholder="Pregúntame sobre ventas, visitadores, médicos... (Enter para enviar)"
          rows={2}
          className="flex-1 input resize-none"
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white flex items-center justify-center self-end transition-colors"
        >
          {loading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
        </button>
      </div>

      {messages.length > 0 && (
        <div className="mt-2 text-center">
          <button
            onClick={() => setMessages([])}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Limpiar conversación
          </button>
        </div>
      )}
    </div>
  );
}
