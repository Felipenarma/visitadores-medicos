import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { repsApi } from '../api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<'admin' | 'rep'>('admin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [repId, setRepId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim()) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (role === 'rep' && !repId) {
      setError('Selecciona tu ID de visitador');
      return;
    }

    setLoading(true);
    try {
      login({
        name: name.trim(),
        email: email.trim(),
        role,
        rep_id: role === 'rep' ? parseInt(repId) : undefined,
      });
      navigate(role === 'admin' ? '/admin/dashboard' : '/rep/dashboard');
    } catch {
      setError('Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Stethoscope size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Visitadores</h1>
          <p className="text-gray-500 mt-1 text-sm">Sistema de administración médica</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Role selector */}
          <div>
            <label className="label">Tipo de acceso</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  role === 'admin'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Administrador
              </button>
              <button
                type="button"
                onClick={() => setRole('rep')}
                className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  role === 'rep'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Visitador Médico
              </button>
            </div>
          </div>

          <div>
            <label className="label">Nombre completo</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input"
              placeholder="Tu nombre completo"
            />
          </div>

          <div>
            <label className="label">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              placeholder="correo@empresa.com"
            />
          </div>

          {role === 'rep' && (
            <div>
              <label className="label">ID de Visitador</label>
              <input
                type="number"
                value={repId}
                onChange={e => setRepId(e.target.value)}
                className="input"
                placeholder="ID asignado (ej. 1, 2, 3...)"
                min="1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Ingresa el ID numérico asignado por el administrador
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            <LogIn size={18} />
            {loading ? 'Iniciando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 font-medium mb-2">Accesos de demostración:</p>
          <div className="space-y-1 text-xs text-gray-500">
            <p>Admin: cualquier nombre + correo</p>
            <p>Visitador: cualquier nombre + correo + ID 1, 2 o 3</p>
          </div>
        </div>
      </div>
    </div>
  );
}
