import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Stethoscope, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { repsApi } from '../api';

export default function RepLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [reps, setReps] = useState<any[]>([]);
  const [repId, setRepId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    repsApi.getAll()
      .then(data => {
        // Filter out placeholder reps
        const active = data.filter((r: any) => r.is_active);
        setReps(active);
      })
      .catch(() => setReps([]))
      .finally(() => setLoading(false));
  }, []);

  const handleRepSelect = (id: string) => {
    setRepId(id);
    const selected = reps.find(r => r.id === parseInt(id));
    if (selected) {
      setName(selected.name);
      setEmail(selected.email);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!repId) {
      setError('Selecciona tu perfil');
      return;
    }

    login({
      name,
      email,
      role: 'rep',
      rep_id: parseInt(repId),
    });
    navigate('/rep/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Stethoscope size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Visitador Medico</h1>
          <p className="text-gray-500 mt-1 text-sm">Ingresa a tu panel de gestion</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label">Selecciona tu perfil</label>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <select
                value={repId}
                onChange={e => handleRepSelect(e.target.value)}
                className="input"
              >
                <option value="">-- Selecciona tu nombre --</option>
                {reps.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </div>

          {repId && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-sm font-medium text-blue-800">{name}</p>
              <p className="text-xs text-blue-600 mt-1">{email}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!repId}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogIn size={18} />
            Ingresar
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/admin-login" className="text-sm text-gray-500 hover:underline">
            Acceso administrador
          </Link>
        </div>
      </div>
    </div>
  );
}
