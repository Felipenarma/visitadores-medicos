import axios from 'axios';
import type {
  BusinessLine, MedicalRep, Doctor, Visit, Sale, SalesSummaryItem,
  DashboardStats, TodayVisit, RepStats, RepDetail, AgentMessage
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
  mergeInto: (fromId: number, toId: number) => api.post(`/doctors/${fromId}/merge-into/${toId}`).then(r => r.data),
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
  getVisitsByRep: (month?: number, year?: number) => api.get<{ rep_name: string; completed: number; total: number; rep_id: number }[]>('/dashboard/visits-by-rep', { params: { ...(month && { month }), ...(year && { year }) } }).then(r => r.data),
  getSalesByBusinessLine: () => api.get<{ name: string; value: number; color: string }[]>('/dashboard/sales-by-business-line').then(r => r.data),
  getRepStats: (rep_id: number) => api.get<RepStats>(`/dashboard/rep/${rep_id}/stats`).then(r => r.data),
  getRepDetail: (rep_id: number) => api.get<RepDetail>(`/dashboard/rep/${rep_id}/detail`).then(r => r.data),
  getDailyTracking: (date?: string) => api.get<{
    date: string;
    reps: { rep_id: number; rep_name: string; total: number; completed: number; pending: number; missed: number; completion_rate: number }[];
  }>('/dashboard/daily-tracking', { params: date ? { date } : {} }).then(r => r.data),
  getDoctorRanking: (month: number, year: number) =>
    api.get('/dashboard/doctor-ranking', { params: { month, year } }).then(r => r.data),
  getNewDoctors: (month: number, year: number) =>
    api.get('/dashboard/new-doctors', { params: { month, year } }).then(r => r.data),
  getRepCommissions: (month: number, year: number) =>
    api.get('/dashboard/rep-commissions', { params: { month, year } }).then(r => r.data),
  getSalesByDoctor: (month: number, year: number, top = 20) =>
    api.get<{ doctor_name: string; rut: string; rep_name: string; units_current: number; units_prev: number; amount_current: number; amount_prev: number }[]>(
      '/dashboard/sales-by-doctor', { params: { month, year, top } }
    ).then(r => r.data),
};

// Consolidated Sales
export const consolidatedSalesApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/sales/upload-consolidado', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);
  },
  getLastUpload: () => api.get<{ id: number; filename: string; upload_date: string; rows_processed: number } | null>('/sales/uploads/last').then(r => r.data),
  getUploads: () => api.get<{ id: number; filename: string; upload_date: string; rows_processed: number; sales_count: number }[]>('/sales/uploads').then(r => r.data),
  deleteUpload: (id: number) => api.delete(`/sales/uploads/${id}`).then(r => r.data),
};

// AI Agent
export const agentApi = {
  chat: (data: { message: string; rep_id: number; conversation_history: AgentMessage[] }) =>
    api.post<{ response: string; conversation_history: AgentMessage[] }>('/agent/chat', data).then(r => r.data),
};

// Knowledge Base
export const knowledgeApi = {
  getAll: (category?: string) => api.get('/knowledge', { params: category ? { category } : {} }).then(r => r.data),
  getCategories: () => api.get('/knowledge/categories').then(r => r.data),
  create: (data: any) => api.post('/knowledge', data).then(r => r.data),
  update: (id: number, data: any) => api.put(`/knowledge/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/knowledge/${id}`).then(r => r.data),
  upload: (file: File, category: string, businessLineId?: number) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    if (businessLineId) formData.append('business_line_id', String(businessLineId));
    return api.post('/knowledge/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  uploadMultiple: (files: File[], category: string, businessLineId?: number) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    formData.append('category', category);
    if (businessLineId) formData.append('business_line_id', String(businessLineId));
    return api.post('/knowledge/upload-multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  reprocess: (id: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/knowledge/${id}/reprocess`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
};

// Images
export const imagesApi = {
  getAll: (category?: string) => api.get('/images', { params: category ? { category } : {} }).then(r => r.data),
  upload: (file: File, name: string, description: string, category: string, businessLineId?: number) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('description', description);
    formData.append('category', category);
    if (businessLineId) formData.append('business_line_id', String(businessLineId));
    return api.post('/images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  delete: (id: number) => api.delete(`/images/${id}`).then(r => r.data),
  getUrl: (id: number) => `${API_URL}/images/${id}/file`,
};

// Seed
export const seedApi = {
  seed: () => api.post('/seed').then(r => r.data),
};

export default api;
