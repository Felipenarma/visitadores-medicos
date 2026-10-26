// Criterio de "información completa" de un médico.
// Debe mantenerse igual a backend/app/completeness.py
import type { DoctorInfoField } from '../types';

const INFO_PLACEHOLDERS = new Set(['', '-', '--', '.', '0', 'na', 'n/a', 's/i', 'si', 'sin', 'sin dato', 'sin datos',
  'sin info', 'no', 'no tiene', 'pendiente', 'x', 'null', 'none', 'nan']);

export const FIELD_LABELS: Record<DoctorInfoField, string> = {
  phone: 'Teléfono',
  email: 'Correo',
  medical_center: 'Centro médico',
  specialty: 'Especialidad',
};

export function hasInfo(v?: string | null): boolean {
  return v != null && !INFO_PLACEHOLDERS.has(String(v).trim().toLowerCase());
}

export function doctorMissingFields(d: { phone?: string | null; email?: string | null; medical_center?: string | null; specialty?: string | null }): DoctorInfoField[] {
  const miss: DoctorInfoField[] = [];
  if (!hasInfo(d.phone)) miss.push('phone');
  if (!hasInfo(d.email) || !String(d.email).includes('@')) miss.push('email');
  if (!hasInfo(d.medical_center)) miss.push('medical_center');
  if (!hasInfo(d.specialty)) miss.push('specialty');
  return miss;
}

export function missingLabel(miss: DoctorInfoField[]): string {
  return miss.map(f => FIELD_LABELS[f].toLowerCase()).join(', ');
}
