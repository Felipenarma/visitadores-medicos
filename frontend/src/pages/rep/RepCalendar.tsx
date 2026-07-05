import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { visitsApi, doctorsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { Visit, Doctor } from '../../types';
import Modal from '../../components/Modal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Search, Phone, Mail, MapPin, Building2, UserCheck } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3B82F6',
  completed: '#10B981',
  missed: '#EF4444',
  cancelled: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programada',
  completed: 'Completada',
  missed: 'Perdida',
  cancelled: 'Cancelada',
};

export default function RepCalendar() {
  const { user } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form, setForm] = useState({ status: '', notes: '', scheduled_date: '', scheduled_time: '' });
  const [createForm, setCreateForm] = useState({ doctor_id: 0, scheduled_date: '', scheduled_time: '09:00', notes: '' });
  const [doctorSearch, setDoctorSearch] = useState('');
  const [updating, setUpdating]       = useState(false);
  const [creating, setCreating]       = useState(false);
  const [visitDoctor, setVisitDoctor] = useState<Doctor | null>(null);
  const [assigning, setAssigning]     = useState(false);

  const load = async () => {
    if (!user?.rep_id) return;
    const [v, d] = await Promise.all([
      visitsApi.getAll({ rep_id: user.rep_id }),
      doctorsApi.getAll({ rep_id: user.rep_id, is_active: true }),
    ]);
    setVisits(v);
    setDoctors(d);
  };

  useEffect(() => { load(); }, [user?.rep_id]);

  const events = visits.map(v => ({
    id: String(v.id),
    title: v.doctor_name || 'Visita',
    start: v.scheduled_date,
    backgroundColor: STATUS_COLORS[v.status],
    borderColor: STATUS_COLORS[v.status],
    extendedProps: { visit: v },
  }));

  const handleEventClick = async (info: any) => {
    const visit: Visit = info.event.extendedProps.visit;
    setSelectedVisit(visit);
    const dateObj = new Date(visit.scheduled_date);
    const dateStr = dateObj.toISOString().slice(0, 10);
    const timeStr = dateObj.toTimeString().slice(0, 5);
    setForm({ status: visit.status, notes: visit.notes || '', scheduled_date: dateStr, scheduled_time: timeStr });
    setVisitDoctor(null);
    setEditModalOpen(true);
    // Fetch full doctor info
    if (visit.doctor_id) {
      try {
        const doc = await doctorsApi.getOne(visit.doctor_id);
        setVisitDoctor(doc);
      } catch { /* silently ignore */ }
    }
  };

  const handleAssignMe = async () => {
    if (!visitDoctor || !user?.rep_id) return;
    setAssigning(true);
    try {
      await doctorsApi.update(visitDoctor.id, { rep_id: user.rep_id });
      setVisitDoctor({ ...visitDoctor, rep_id: user.rep_id, rep_name: user.name });
      load();
    } catch { /* silently ignore */ }
    finally { setAssigning(false); }
  };

  const handleDateClick = (info: any) => {
    setCreateForm({ doctor_id: 0, scheduled_date: info.dateStr, scheduled_time: '09:00', notes: '' });
    setDoctorSearch('');
    setCreateModalOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedVisit) return;
    setUpdating(true);
    try {
      const newDate = form.scheduled_date && form.scheduled_time
        ? `${form.scheduled_date}T${form.scheduled_time}:00`
        : undefined;
      await visitsApi.update(selectedVisit.id, {
        status: form.status as Visit['status'],
        notes: form.notes,
        scheduled_date: newDate,
        actual_date: form.status === 'completed' ? new Date().toISOString() : undefined,
      });
      setEditModalOpen(false);
      load();
    } catch { alert('Error al actualizar'); }
    finally { setUpdating(false); }
  };

  const handleCreate = async () => {
    if (!user?.rep_id || !createForm.doctor_id) return;
    setCreating(true);
    try {
      await visitsApi.create({
        doctor_id: createForm.doctor_id,
        rep_id: user.rep_id,
        scheduled_date: `${createForm.scheduled_date}T${createForm.scheduled_time}:00`,
        status: 'scheduled',
        notes: createForm.notes || undefined,
      });
      setCreateModalOpen(false);
      load();
    } catch { alert('Error al crear la cita'); }
    finally { setCreating(false); }
  };

  const openCreateModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    setCreateForm({ doctor_id: 0, scheduled_date: today, scheduled_time: '09:00', notes: '' });
    setDoctorSearch('');
    setCreateModalOpen(true);
  };

  const filteredDoctors = doctors.filter(d =>
    d.name.toLowerCase().includes(doctorSearch.toLowerCase()) ||
    (d.specialty || '').toLowerCase().includes(doctorSearch.toLowerCase()) ||
    (d.medical_center || '').toLowerCase().includes(doctorSearch.toLowerCase())
  );

  const selectedDoctor = doctors.find(d => d.id === createForm.doctor_id);

  if (!user?.rep_id) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p>ID de visitador no configurado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi Calendario</h1>
          <p className="text-gray-500 text-sm mt-1">Tus visitas programadas — haz click en un día para agendar</p>
        </div>
        <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          Nueva Cita
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-gray-600">{STATUS_LABELS[status]}</span>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,listWeek'
          }}
          events={events}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          height={620}
          locale="es"
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            list: 'Lista'
          }}
        />
      </div>

      {/* Modal Editar Visita */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Actualizar Visita">
        {selectedVisit && (
          <div className="space-y-4">
            {/* Doctor contact card */}
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-gray-900 text-base">{selectedVisit.doctor_name}</p>
                  <p className="text-sm text-blue-700">{selectedVisit.doctor_specialty || 'Sin especialidad'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-700">
                    {selectedVisit.scheduled_date
                      ? format(new Date(selectedVisit.scheduled_date), "d 'de' MMMM", { locale: es })
                      : '—'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {selectedVisit.scheduled_date
                      ? format(new Date(selectedVisit.scheduled_date), 'HH:mm')
                      : ''}
                  </p>
                </div>
              </div>

              {/* Contact details — shown once doctor is loaded */}
              {visitDoctor ? (
                <div className="space-y-1.5 pt-1 border-t border-blue-100">
                  {visitDoctor.medical_center && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Building2 size={14} className="text-blue-400 shrink-0" />
                      <span>{visitDoctor.medical_center}</span>
                    </div>
                  )}
                  {visitDoctor.address && (
                    <div className="flex items-start gap-2 text-sm text-gray-700">
                      <MapPin size={14} className="text-blue-400 shrink-0 mt-0.5" />
                      <span>{visitDoctor.address}{visitDoctor.city ? `, ${visitDoctor.city}` : ''}</span>
                    </div>
                  )}
                  {!visitDoctor.address && visitDoctor.city && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <MapPin size={14} className="text-blue-400 shrink-0" />
                      <span>{visitDoctor.city}</span>
                    </div>
                  )}
                  {visitDoctor.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone size={14} className="text-blue-400 shrink-0" />
                      <a href={`tel:${visitDoctor.phone}`} className="text-blue-600 hover:underline font-medium">
                        {visitDoctor.phone}
                      </a>
                    </div>
                  )}
                  {visitDoctor.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail size={14} className="text-blue-400 shrink-0" />
                      <a href={`mailto:${visitDoctor.email}`} className="text-blue-600 hover:underline">
                        {visitDoctor.email}
                      </a>
                    </div>
                  )}

                  {/* Assign button */}
                  <button
                    onClick={handleAssignMe}
                    disabled={assigning}
                    className={`mt-2 w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                      visitDoctor.rep_id === user?.rep_id
                        ? 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                        : 'bg-white border border-blue-300 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    <UserCheck size={15} />
                    {assigning ? 'Asignando…' : visitDoctor.rep_id === user?.rep_id ? '✓ Asignado a mí — Reconfirmar' : 'Asignarme este médico'}
                  </button>
                </div>
              ) : (
                <div className="pt-1 border-t border-blue-100">
                  <div className="h-3 bg-blue-100 rounded animate-pulse w-2/3" />
                </div>
              )}
            </div>

            <div>
              <label className="label">Estado de la visita</label>
              <div className="grid grid-cols-2 gap-2">
                {(['scheduled', 'completed', 'missed', 'cancelled'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm({ ...form, status: s })}
                    className={`p-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                      form.status === s
                        ? 'border-current'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                    style={form.status === s ? { borderColor: STATUS_COLORS[s], color: STATUS_COLORS[s], backgroundColor: `${STATUS_COLORS[s]}10` } : {}}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Reagendar fecha y hora</label>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  className="input"
                  value={form.scheduled_date}
                  onChange={e => setForm({ ...form, scheduled_date: e.target.value })}
                />
                <input
                  type="time"
                  className="input"
                  value={form.scheduled_time}
                  onChange={e => setForm({ ...form, scheduled_time: e.target.value })}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Cambia la fecha u hora si necesitas reagendar esta visita</p>
            </div>

            <div>
              <label className="label">Notas de la visita</label>
              <textarea
                className="input"
                rows={3}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="¿Qué pasó en la visita? Comentarios sobre el médico..."
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEditModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleUpdate} disabled={updating} className="btn-primary flex-1">
                {updating ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Crear Cita */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Nueva Cita">
        <div className="space-y-4">
          {/* Doctor selector */}
          <div>
            <label className="label">Médico</label>
            {selectedDoctor ? (
              <div className="flex items-center justify-between bg-blue-50 rounded-lg p-3">
                <div>
                  <p className="font-semibold text-gray-900">{selectedDoctor.name}</p>
                  <p className="text-sm text-gray-500">
                    {[selectedDoctor.specialty, selectedDoctor.medical_center].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  onClick={() => setCreateForm({ ...createForm, doctor_id: 0 })}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="input pl-9 w-full"
                    placeholder="Buscar médico por nombre, especialidad..."
                    value={doctorSearch}
                    onChange={e => setDoctorSearch(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-lg mt-2 divide-y">
                  {filteredDoctors.length === 0 ? (
                    <p className="text-sm text-gray-400 p-3 text-center">No se encontraron médicos</p>
                  ) : (
                    filteredDoctors.map(d => (
                      <button
                        key={d.id}
                        onClick={() => { setCreateForm({ ...createForm, doctor_id: d.id }); setDoctorSearch(''); }}
                        className="w-full text-left p-3 hover:bg-blue-50 transition-colors"
                      >
                        <p className="font-medium text-gray-900 text-sm">{d.name}</p>
                        <p className="text-xs text-gray-500">
                          {[d.specialty, d.medical_center, d.city, d.commune].filter(Boolean).join(' · ')}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha</label>
              <input
                type="date"
                className="input w-full"
                value={createForm.scheduled_date}
                onChange={e => setCreateForm({ ...createForm, scheduled_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Hora</label>
              <input
                type="time"
                className="input w-full"
                value={createForm.scheduled_time}
                onChange={e => setCreateForm({ ...createForm, scheduled_time: e.target.value })}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notas (opcional)</label>
            <textarea
              className="input w-full"
              rows={2}
              value={createForm.notes}
              onChange={e => setCreateForm({ ...createForm, notes: e.target.value })}
              placeholder="Motivo de la visita, productos a presentar..."
            />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setCreateModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button
              onClick={handleCreate}
              disabled={creating || !createForm.doctor_id || !createForm.scheduled_date}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {creating ? 'Creando...' : 'Crear Cita'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
