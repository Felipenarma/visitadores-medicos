import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Bot, User, Loader2, Sparkles, BarChart2, TrendingUp, Users, Activity, Download
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import type { AgentMessage } from '../../types';
import api from '../../api';

const BASE = '/mike';

// ── Types ──────────────────────────────────────────────────────────────────

interface ChartData {
  type: 'bar' | 'line';
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  yKey2?: string;
}

interface MikeApiResponse {
  response: string;
  conversation_history: AgentMessage[];
  charts?: ChartData[];
  export_url?: string;
}

interface DisplayMessage extends AgentMessage {
  charts?: ChartData[];
  export_url?: string;
}

// ── API ────────────────────────────────────────────────────────────────────

const mikeApi = {
  chat: (data: { message: string; conversation_history: AgentMessage[] }) =>
    api.post<MikeApiResponse>(`${BASE}/chat`, data).then(r => r.data),
};

// ── Chart component ────────────────────────────────────────────────────────

function MikeChart({ chart }: { chart: ChartData }) {
  const VIOLET = '#8b5cf6';
  const VIOLET2 = '#a78bfa';

  return (
    <div className="mt-3 bg-white border border-gray-200 rounded-xl p-3">
      <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">{chart.title}</p>
      <ResponsiveContainer width="100%" height={220}>
        {chart.type === 'line' ? (
          <LineChart data={chart.data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={50} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey={chart.yKey} stroke={VIOLET} strokeWidth={2} dot={false} />
            {chart.yKey2 && (
              <Line type="monotone" dataKey={chart.yKey2} stroke={VIOLET2} strokeWidth={2} dot={false} />
            )}
          </LineChart>
        ) : (
          <BarChart data={chart.data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={50} />
            <Tooltip />
            <Bar dataKey={chart.yKey} fill={VIOLET} radius={[3, 3, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// ── Download button ────────────────────────────────────────────────────────

function DownloadButton({ exportUrl }: { exportUrl: string }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await api.get(exportUrl, { responseType: 'blob' });
      const blob = new Blob([response.data as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = (response.headers['content-disposition'] as string) || '';
      const match = disposition.match(/filename=([^;]+)/);
      a.download = match ? match[1] : 'mike_export.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // silently ignore download errors
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="mt-2 flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
    >
      {downloading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Download size={14} />
      )}
      {downloading ? 'Descargando...' : 'Descargar Excel'}
    </button>
  );
}

// ── Message renderer ───────────────────────────────────────────────────────

function RenderMessage({ content }: { content: string }) {
  const cleaned = content.replace(/\*\*/g, '').replace(/\*/g, '');
  return (
    <div className="whitespace-pre-wrap leading-relaxed break-words text-sm">
      {cleaned}
    </div>
  );
}

// ── Suggestions ────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { icon: <BarChart2 size={16} />, text: '¿Cómo va el desempeño de los visitadores este mes?' },
  { icon: <TrendingUp size={16} />, text: '¿Cuáles son los 10 médicos con más ventas en abril 2026?' },
  { icon: <Users size={16} />, text: '¿Cuántos médicos nuevos tuvimos este mes?' },
  { icon: <Activity size={16} />, text: 'Muéstrame la tendencia de ventas de los últimos 6 meses' },
  { icon: <BarChart2 size={16} />, text: '¿Qué visitador tiene la tasa de cumplimiento más baja?' },
  { icon: <TrendingUp size={16} />, text: 'Exporta el ranking de médicos de este mes a Excel' },
];

// ── Main component ─────────────────────────────────────────────────────────

const STORAGE_KEY = 'mike_history';

export default function Mike() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DisplayMessage[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored) as DisplayMessage[];
    } catch {
      // ignore parse errors
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist messages to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // ignore storage errors
    }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: DisplayMessage = { role: 'user', content: msg };
    // Build history from current messages for API (only role/content)
    const historyForApi: AgentMessage[] = messages.map(m => ({ role: m.role, content: m.content }));

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await mikeApi.chat({
        message: userMsg.content,
        conversation_history: historyForApi,
      });
      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content: res.response,
        charts: res.charts,
        export_url: res.export_url ?? undefined,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err.response?.data?.detail || 'Error al conectar con Mike. Verifica que ANTHROPIC_API_KEY esté configurada.',
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

  const handleClear = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
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
                <div className={`max-w-[78%] ${msg.role === 'user' ? '' : 'flex-1'}`}>
                  <div className={`rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-tr-sm'
                      : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                  }`}>
                    <RenderMessage content={msg.content} />
                  </div>

                  {/* Charts below assistant messages */}
                  {msg.role === 'assistant' && msg.charts && msg.charts.length > 0 && (
                    <div className="space-y-2">
                      {msg.charts.map((chart, ci) => (
                        <MikeChart key={ci} chart={chart} />
                      ))}
                    </div>
                  )}

                  {/* Download button when export is ready */}
                  {msg.role === 'assistant' && msg.export_url && (
                    <DownloadButton exportUrl={msg.export_url} />
                  )}
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
            onClick={handleClear}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Limpiar conversación
          </button>
        </div>
      )}
    </div>
  );
}
