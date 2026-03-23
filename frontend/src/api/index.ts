import axios from 'axios';
import type {
  BusinessLine, MedicalRep, Doctor, Visit, Sale, SalesSummaryItem,
  DashboardStats, TodayVisit, RepStats, AgentMessage
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Business Lines
export const businessLinesApi = {
  getAll: () => api.get<BusinessLine[]>('/business-lines/').then(r => r.data),
  create: (data: Partial<BusinessLine>) => api.post<BusinessLine>('/business-lines/', data).then(r => r.data),
  update: (id: number, data: Partial<BusinessLine>) => api.put<BusinessLine>(`/business-lines/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/business-lines/${id}`).then(r => r.data),
};

// Medical Reps
export const repsApi = {
  getAll: () => api.get<MedicalRep[]>('/reps/').then(r => r.data),
  getOne: (id: number) => api.get<MedicalRep>(`/reps/${id}`).then(r => r.data),
  create: (data: Partial<MedicalRep>) => api.post<MedicalRep>('/reps/', data).then(r => r.data),
  update: (id: number, data: Partial<MedicalRep>) => api.put<MedicalRep>(`/reps/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/reps/${id}`).then(r => r.data),
};

// Doctors
export const doctorsApi = {
  getAll: (params?: {
    rep_id?: number;
    business_line_id?: number;
    specialty?: string;
    is_active?: boolean;
    has_sales?: boolean;
    search?: string;
  }) => api.get<Doctor[]>('/doctors/', { params }).then(r => r.data),
  getOne: (id: number) => api.get<Doctor>(`/doctors/${id}`).then(r => r.data),
  create: (data: Partial<Doctor>) => api.post<Doctor>('/doctors/', data).then(r => r.data),
  update: (id: number, data: Partial<Doctor>) => api.put<Doctor>(`/doctors/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/doctors/${id}`).then(r => r.data),
  assignRep: (id: number, rep_id: number) => api.put<Doctor>(`/doctors/${id}/assign-rep`, { rep_id }).then(r => r.data),
};

// Visits
export const visitsApi = {
  getAll: (params?: {
    rep_id?: number;
    doctor_id?: number;
    status?: string;
    date_from?: string;
    date_to?: string;
  }) => api.get<Visit[]>('/visits/', { params }).then(r => r.data),
  getOne: (id: number) => api.get<Visit>(`/visits/${id}`).then(r => r.data),
  create: (data: Partial<Visit>) => api.post<Visit>('/visits/', data).then(r => r.data),
  update: (id: number, data: Partial<Visit>) => api.put<Visit>(`/visits/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/visits/${id}`).then(r => r.data),
  generate: (data: { rep_id?: number; months_ahead?: number }) =>
    api.post('/visits/generate', data).then(r => r.data),
};

// Sales
export const salesApi = {
  getAll: () => api.get<Sale[]>('/sales/').then(r => r.data),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/sales/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);
  },
  getSummary: () => api.get<SalesSummaryItem[]>('/sales/summary').then(r => r.data),
};

// Cardex
export const cardexApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/cardex/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);
  },
  downloadTemplate: () => {
    return api.get('/cardex/template', { responseType: 'blob' }).then(r => r.data);
  },
};

// Dashboard
export const dashboardApi = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats').then(r => r.data),
  getTodayVisits: () => api.get<TodayVisit[]>('/dashboard/today').then(r => r.data),
  getVisitsByRep: () => api.get<{ rep_name: string; visits: number; rep_id: number }[]>('/dashboard/visits-by-rep').then(r => r.data),
  getSalesByBusinessLine: () => api.get<{ name: string; value: number; color: string }[]>('/dashboard/sales-by-business-line').then(r => r.data),
  getRepStats: (rep_id: number) => api.get<RepStats>(`/dashboard/rep/${rep_id}/stats`).then(r => r.data),
};

// AI Agent
export const agentApi = {
  chat: (data: { message: string; rep_id: number; conversation_history: AgentMessage[] }) =>
    api.post<{ response: string; conversation_history: AgentMessage[] }>('/agent/chat', data).then(r => r.data),
};

// Seed
export const seedApi = {
  seed: () => api.post('/seed').then(r => r.data),
};

export default api;
