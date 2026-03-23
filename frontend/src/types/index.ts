export interface BusinessLine {
  id: number;
  name: string;
  description?: string;
  color: string;
  created_at?: string;
  doctor_count?: number;
}

export interface MedicalRep {
  id: number;
  name: string;
  email: string;
  phone?: string;
  territory?: string;
  zone?: string;
  is_active: boolean;
  created_at?: string;
  doctor_count?: number;
}

export interface Doctor {
  id: number;
  name: string;
  specialty?: string;
  address?: string;
  phone?: string;
  email?: string;
  notes?: string;
  business_line_id?: number;
  rep_id?: number;
  prescribes_products?: string;
  visit_frequency?: number;
  is_active: boolean;
  created_at?: string;
  business_line_name?: string;
  rep_name?: string;
  last_visit_date?: string;
  visits_count?: number;
  has_sales?: boolean;
}

export interface Visit {
  id: number;
  doctor_id: number;
  rep_id: number;
  scheduled_date: string;
  actual_date?: string;
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled';
  notes?: string;
  created_at?: string;
  doctor_name?: string;
  rep_name?: string;
  doctor_specialty?: string;
}

export interface Sale {
  id: number;
  doctor_id?: number;
  doctor_name_raw?: string;
  product?: string;
  amount?: number;
  sale_date?: string;
  upload_id?: number;
  created_at?: string;
  doctor_name?: string;
}

export interface SalesSummaryItem {
  doctor_id?: number;
  doctor_name: string;
  total_sales: number;
  sales_count: number;
  visits_count: number;
  has_visits: boolean;
}

export interface DashboardStats {
  total_doctors: number;
  active_reps: number;
  visits_today: number;
  visits_this_week: number;
  total_visits: number;
  completed_visits: number;
  missed_visits: number;
}

export interface TodayVisit {
  visit_id: number;
  doctor_name: string;
  doctor_specialty?: string;
  rep_name: string;
  rep_id: number;
  scheduled_date: string;
  status: string;
  notes?: string;
}

export interface RepStats {
  rep_id: number;
  rep_name: string;
  doctor_count: number;
  visits_today: number;
  visits_this_week: number;
  completed_this_month: number;
  missed_this_month: number;
  upcoming_visits: UpcomingVisit[];
}

export interface UpcomingVisit {
  visit_id: number;
  doctor_name: string;
  doctor_specialty?: string;
  scheduled_date: string;
  status: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface User {
  id?: number;
  name: string;
  email: string;
  role: 'admin' | 'rep';
  rep_id?: number;
}
