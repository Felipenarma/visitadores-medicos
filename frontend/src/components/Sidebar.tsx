import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCheck, Briefcase, Upload, TrendingUp,
  Calendar, Bot, Activity, LogOut, Stethoscope, BookOpen, Menu, X, QrCode
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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
  { to: '/admin/agent', icon: <Bot size={20} />, label: 'Agente IA' },
  { to: '/admin/knowledge', icon: <BookOpen size={20} />, label: 'Base de Conocimiento' },
  { to: '/admin/images', icon: <QrCode size={20} />, label: 'Imagenes y QR' },
];

const repNav: NavItem[] = [
  { to: '/rep/dashboard', icon: <LayoutDashboard size={20} />, label: 'Mi Dashboard' },
  { to: '/rep/calendar', icon: <Calendar size={20} />, label: 'Mi Calendario' },
  { to: '/rep/doctors', icon: <Stethoscope size={20} />, label: 'Mis Medicos' },
  { to: '/rep/agent', icon: <Bot size={20} />, label: 'Agente IA' },
];

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth();
  const navItems = isAdmin ? adminNav : repNav;
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  React.useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

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

      {/* Navigation */}
      <nav className="flex-1 p-3 lg:p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
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
            {item.label}
          </NavLink>
        ))}
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
