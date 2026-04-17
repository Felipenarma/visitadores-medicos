import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ADMIN_PASSWORD = 'narma2026';

export default function AdminLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Ingresa tu nombre');
      return;
    }

    if (password !== ADMIN_PASSWORD) {
      setError('Clave incorrecta');
      return;
    }

    login({
      name: name.trim(),
      email: 'admin@narma.cl',
      role: 'admin',
    });
    navigate('/admin/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Panel Administrativo</h1>
          <p className="text-gray-500 mt-1 text-sm">Acceso exclusivo para administradores</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input"
              placeholder="Tu nombre"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Clave de acceso</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              placeholder="Ingresa la clave"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button type="submit" className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium">
            <LogIn size={18} />
            Ingresar como Admin
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/visitador" className="text-sm text-blue-600 hover:underline">
            Soy visitador medico
          </Link>
        </div>
      </div>
    </div>
  );
}
