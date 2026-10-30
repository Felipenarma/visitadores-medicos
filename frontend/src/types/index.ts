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
  business_lines?: BusinessLine[];
  business_line_ids?: number[];
}

export interface Doctor {
  id: number;
  name: string;
  rut?: string;
  medical_center?: string;
  specialty?: string;
  city?: string;
  commune?: string;
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
  created_from?: string;
}

export interface Visit {
  id: number;
  doctor_id: number;
  rep_id: number;
  scheduled_date: string;
  actual_date?: string;
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled';
  notes?: string;
  origin?: string | null;  // 'low_sales' = agendada automáticamente por venta baja
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
  doctor_rut?: string;
  total_units: number;
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
  doctor_id?: number;
  doctor_name: string;
  doctor_specialty?: string;
  scheduled_date: string;
  status: string;
  origin?: string | null;
  notes?: string | null;
}

export interface RepDetailVisit {
  visit_id: number;
  doctor_id?: number;
  doctor_name: string;
  doctor_specialty?: string;
  doctor_address?: string;
  scheduled_date: string;
  actual_date?: string;
  status: 'scheduled' | 'completed' | 'missed' | 'cancelled';
  notes?: string;
}

export interface RepDetailPeriod {
  start: string;
  end: string;
  total: number;
  completed: number;
  missed: number;
  pending: number;
  cancelled: number;
  completion_rate: number;
  visits: RepDetailVisit[];
}

export interface RepDoctorRanking {
  doctor_id?: number;
  doctor_name: string;
  rut?: string;
  specialty?: string;
  units: number;
  total_amount: number;
  categorias: string[];
}

export interface RepEffectiveness {
  total_assigned: number;
  doctors_visited: number;
  doctors_with_sales: number;
  doctors_visited_with_sales: number;
  conversion_rate: number;
  penetration_rate: number;
  visit_rate: number;
}

export interface RepCommissionsSummary {
  total_amount: number;   // con IVA
  net_amount?: number;    // sin IVA
  sales_count: number;
  doctors_with_sales: number;
  new_doctors_count: number;
  new_doctors: string[];
  categories: Record<string, number>;
}

export interface RepDetail {
  rep: {
    id: number;
    name: string;
    email: string;
    phone?: string;
    territory?: string;
    zone?: string;
    is_active: boolean;
    doctor_count: number;
  };
  effectiveness?: RepEffectiveness;
  is_current_month: boolean;
  query_month: number;
  query_year: number;
  week: RepDetailPeriod;
  month: RepDetailPeriod;
  doctor_ranking: RepDoctorRanking[];
  commissions?: RepCommissionsSummary;
  sales_goal?: RepSalesGoal;
}

export interface RepSalesGoal {
  net_amount: number;
  gross_amount: number;
  units: number;
  prev_net_amount: number;
  growth_target_pct: number;
  goal_net_amount: number | null;
  pct_of_goal: number | null;
  growth_vs_prev_pct: number | null;
  is_current_month: boolean;
  days_elapsed: number;
  days_in_month: number;
  expected_to_date: number | null;
  projection_net_amount: number | null;
}

export interface RepSalesTrendPoint {
  month: number;
  year: number;
  label: string;
  units: number;
  total_amount: number;
  net_amount: number;
  goal_net_amount: number | null;
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

export type DoctorInfoField = 'phone' | 'email' | 'medical_center' | 'specialty';

export interface DataCompletenessPoint {
  date: string;
  total: number;
  complete: number;
  pct_complete: number;
  pct_phone: number;
  pct_email: number;
  pct_center: number;
  pct_specialty: number;
}

export interface RepDataCompleteness {
  rep_id: number;
  as_of: string;
  total: number;
  complete: number;
  pct_complete: number;
  with_phone: number;
  with_email: number;
  with_center: number;
  with_specialty: number;
  pct_phone: number;
  pct_email: number;
  pct_center: number;
  pct_specialty: number;
  change_7d: number | null;
  change_30d: number | null;
  tracking_since: string;
  history: DataCompletenessPoint[];
  incomplete: { id: number; name: string; missing: DoctorInfoField[] }[];
  pending: number;
  weekly_goal: number;
  done_this_week: number;
  done_this_week_names: string[];
  suggestions: {
    id: number;
    name: string;
    missing: DoctorInfoField[];
    score: number;
    reasons: ('visit' | 'sales' | 'quick' | 'recent')[];
    next_visit: string | null;
  }[];
}
