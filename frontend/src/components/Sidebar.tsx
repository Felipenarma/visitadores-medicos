import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCheck, Briefcase, Upload, TrendingUp,
  Calendar, Bot, Activity, LogOut, Stethoscope, BookOpen, Menu, X, QrCode,
  BarChart2, UserPlus, DollarSign, FolderOpen, Sparkles, Search
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { visitsApi, doctorsApi, repsApi } from '../api';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const adminNav: NavItem[] = [
  { to: '/admin/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { to: '/admin/reps', icon: <Users size={20} />, label: 'Visitadores' },
  { to: '/admin/doctors', icon: <Stethoscope size={20} />, label: 'Medicos' },
  { to: '/admin/business-lines', icon: <Briefcase size={20} />, label: 'Lineas de Negocio' },
  { to: '/admin/calendar', icon: <Calendar size={20} />, label: 'Calendario' },
  { to: '/admin/tracking', icon: <Activity size={20} />, label: 'Seguimiento' },
  { to: '/admin/cardex', icon: <Upload size={20} />, label: 'Cardex' },
  { to: '/admin/sales', icon: <TrendingUp size={20} />, label: 'Ventas' },
  { to: '/admin/sales-files', icon: <FolderOpen size={20} />, label: 'Archivos de Ventas' },
  { to: '/admin/sales-ranking', icon: <BarChart2 size={20} />, label: 'Ranking Médicos' },
  { to: '/admin/new-doctors', icon: <UserPlus size={20} />, label: 'Médicos Nuevos' },
  { to: '/admin/commissions', icon: <DollarSign size={20} />, label: 'Comisiones' },
  { to: '/admin/mike', icon: <Sparkles size={20} />, label: 'Mike (IA Admin)' },
  { to: '/admin/agent', icon: <Bot size={20} />, label: 'Agente IA' },
  { to: '/admin/knowledge', icon: <BookOpen size={20} />, label: 'Base de Conocimiento' },
  { to: '/admin/images', icon: <QrCode size={20} />, label: 'Imagenes y QR' },
];

const repNav: NavItem[] = [
  { to: '/rep/dashboard', icon: <LayoutDashboard size={20} />, label: 'Mi Dashboard' },
  { to: '/rep/calendar', icon: <Calendar size={20} />, label: 'Mi Calendario' },
  { to: '/rep/doctors', icon: <Stethoscope size={20} />, label: 'Mis Medicos' },
  { to: '/rep/commissions', icon: <DollarSign size={20} />, label: 'Mis Comisiones' },
  { to: '/rep/agent', icon: <Bot size={20} />, label: 'Agente IA' },
];

type SearchResult = { type: 'doctor' | 'rep'; id: number; name: string; sub?: string };

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth();
  const navItems = isAdmin ? adminNav : repNav;
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingToday, setPendingToday] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.rep_id) return;
    const today = new Date().toISOString().split('T')[0];
    visitsApi.getAll({ rep_id: user.rep_id, status: 'scheduled', date_from: today, date_to: today })
      .then(visits => setPendingToday(visits.length))
      .catch(() => {});
  }, [user?.rep_id, location.pathname]);

  // Close mobile menu on route change
  React.useEffect(() => {
    setOpen(false);
    setSearchQuery('');
    setSearchOpen(false);
  }, [location.pathname]);

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (q.trim().length < 2) { setSearchResults([]); setSearchOpen(false); return; }
    searchRef.current = setTimeout(async () => {
      try {
        const results: SearchResult[] = [];
        if (isAdmin) {
          const [docs, reps] = await Promise.all([
            doctorsApi.getAll({ search: q, is_active: true }),
            repsApi.getAll(),
          ]);
          docs.slice(0, 5).forEach((d: any) => results.push({
            type: 'doctor', id: d.id, name: d.name,
            sub: [d.specialty, d.rep_name].filter(Boolean).join(' · ')
          }));
          reps.filter((r: any) => r.name.toLowerCase().includes(q.toLowerCase())).slice(0, 3)
            .forEach((r: any) => results.push({ type: 'rep', id: r.id, name: r.name, sub: 'Visitador' }));
        } else {
          const docs = await doctorsApi.getAll({ search: q, rep_id: user?.rep_id, is_active: true });
          docs.slice(0, 6).forEach((d: any) => results.push({
            type: 'doctor', id: d.id, name: d.name, sub: d.specialty || undefined
          }));
        }
        setSearchResults(results);
        setSearchOpen(results.length > 0);
      } catch { setSearchResults([]); }
    }, 300);
  };

  const handleSearchSelect = (r: SearchResult) => {
    setSearchQuery('');
    setSearchOpen(false);
    if (r.type === 'doctor') {
      navigate(isAdmin ? '/admin/doctors' : '/rep/doctors');
    } else {
      navigate(`/admin/reps/${r.id}`);
    }
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 lg:p-6 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Stethoscope size={20} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">Visitadores</p>
            <p className="text-xs text-gray-500">Medicos</p>
          </div>
        </div>
        {/* Close button mobile */}
        <button onClick={() => setOpen(false)} className="lg:hidden p-1 hover:bg-gray-100 rounded-lg">
          <X size={20} className="text-gray-500" />
        </button>
      </div>

      {/* User info */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-blue-600 font-semibold text-sm">
              {user?.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500">{isAdmin ? 'Administrador' : 'Visitador'}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 lg:px-4 py-2 border-b border-gray-100 relative">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchInputRef}
            className="w-full text-sm pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-colors"
            placeholder="Buscar médico o visitador..."
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          />
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
            {searchResults.map((r, i) => (
              <button
                key={i}
                onMouseDown={() => handleSearchSelect(r)}
                className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-center gap-2.5 border-b border-gray-50 last:border-0"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${r.type === 'doctor' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                  {r.type === 'doctor' ? <Stethoscope size={12} /> : <Users size={12} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                  {r.sub && <p className="text-xs text-gray-400 truncate">{r.sub}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 lg:p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const showBadge = !isAdmin && item.to === '/rep/calendar' && pendingToday > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
                  {pendingToday}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-3 lg:p-4 border-t border-gray-200">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 w-full transition-colors"
        >
          <LogOut size={20} />
          Cerrar Sesion
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setOpen(true)} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <Menu size={22} className="text-gray-700" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <Stethoscope size={16} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 text-sm">Narma</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-600 font-semibold text-xs">
              {user?.name.charAt(0).toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-white flex flex-col h-full shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col h-screen sticky top-0">
        {sidebarContent}
      </aside>
    </>
  );
}
