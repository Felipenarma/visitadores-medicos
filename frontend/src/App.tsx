import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';

import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import Reps from './pages/admin/Reps';
import Doctors from './pages/admin/Doctors';
import BusinessLines from './pages/admin/BusinessLines';
import CardexUpload from './pages/admin/CardexUpload';
import SalesUpload from './pages/admin/SalesUpload';
import AdminCalendar from './pages/admin/AdminCalendar';
import Tracking from './pages/admin/Tracking';
import RepDashboard from './pages/rep/RepDashboard';
import RepCalendar from './pages/rep/RepCalendar';
import AIAgent from './pages/AIAgent';

function PrivateRoute({ children, role }: { children: React.ReactNode; role?: 'admin' | 'rep' }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/rep/dashboard'} replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/rep/dashboard'} replace /> : <Login />} />

      {/* Admin Routes */}
      <Route path="/admin/*" element={
        <PrivateRoute role="admin">
          <Layout>
            <Routes>
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="reps" element={<Reps />} />
              <Route path="doctors" element={<Doctors />} />
              <Route path="business-lines" element={<BusinessLines />} />
              <Route path="calendar" element={<AdminCalendar />} />
              <Route path="tracking" element={<Tracking />} />
              <Route path="cardex" element={<CardexUpload />} />
              <Route path="sales" element={<SalesUpload />} />
              <Route path="agent" element={<AIAgent />} />
            </Routes>
          </Layout>
        </PrivateRoute>
      } />

      {/* Rep Routes */}
      <Route path="/rep/*" element={
        <PrivateRoute role="rep">
          <Layout>
            <Routes>
              <Route path="dashboard" element={<RepDashboard />} />
              <Route path="calendar" element={<RepCalendar />} />
              <Route path="agent" element={<AIAgent />} />
            </Routes>
          </Layout>
        </PrivateRoute>
      } />

      <Route path="/" element={
        user ? <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/rep/dashboard'} replace /> : <Navigate to="/login" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
