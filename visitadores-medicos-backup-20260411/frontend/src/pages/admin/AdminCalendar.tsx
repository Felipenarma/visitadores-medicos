import React, { useEffect, useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { visitsApi, repsApi } from '../../api';
import type { Visit, MedicalRep } from '../../types';
import Modal from '../../components/Modal';

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3B82F6',
  completed: '#10B981',
  missed: '#EF4444',
  cancelled: '#6B7280',
};

export default function AdminCalendar() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [reps, setReps] = useState<MedicalRep[]>([]);
  const [filterRep, setFilterRep] = useState('');
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [form, setForm] = useState({ status: '', notes: '' });

  const load = async () => {
    const params: any = {};
    if (filterRep) params.rep_id = parseInt(filterRep);
    const [v, r] = await Promise.all([visitsApi.getAll(params), repsApi.getAll()]);
    setVisits(v);
    setReps(r);
  };

  useEffect(() => { load(); }, [filterRep]);

  const events = visits.map(v => ({
    id: String(v.id),
    title: `${v.doctor_name || 'Dr.'} - ${v.rep_name || ''}`,
    start: v.scheduled_date,
    backgroundColor: STATUS_COLORS[v.status] || STATUS_COLORS.scheduled,
    borderColor: STATUS_COLORS[v.status] || STATUS_COLORS.scheduled,
    extendedProps: { visit: v },
  }));

  const handleEventClick = (info: any) => {
    const visit: Visit = info.event.extendedProps.visit;
    setSelectedVisit(visit);
    setForm({ status: visit.status, notes: visit.notes || '' });
    setModalOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedVisit) return;
    setUpdating(true);
    try {
      await visitsApi.update(selectedVisit.id, {
        status: form.status as Visit['status'],
        notes: form.notes,
        actual_date: form.status === 'completed' ? new Date().toISOString() : undefined,
      });
      setModalOpen(false);
      load();
    } catch { alert('Error al actualizar la visita'); }
    finally { setUpdating(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendario de Visitas</h1>
          <p className="text-gray-500 text-sm mt-1">Vista global de todas las visitas</p>
        </div>
        <select
          className="input w-48"
          value={filterRep}
          onChange={e => setFilterRep(e.target.value)}
        >
          <option value="">Todos los visitadores</option>
          {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-gray-600 capitalize">{
              { scheduled: 'Programada', completed: 'Completada', missed: 'Perdida', cancelled: 'Cancelada' }[status]
            }</span>
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
            right: 'dayGridMonth,timeGridWeek,listWeek'
          }}
          events={events}
          eventClick={handleEventClick}
          height={620}
          locale="es"
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            week: 'Semana',
            list: 'Lista'
          }}
        />
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Detalle de Visita">
        {selectedVisit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400 text-xs mb-1">Médico</p>
                <p className="font-medium">{selectedVisit.doctor_name}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Especialidad</p>
                <p className="font-medium">{selectedVisit.doctor_specialty || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Visitador</p>
                <p className="font-medium">{selectedVisit.rep_name}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs mb-1">Fecha programada</p>
                <p className="font-medium">
                  {selectedVisit.scheduled_date
                    ? new Date(selectedVisit.scheduled_date).toLocaleDateString('es-MX', { dateStyle: 'medium' })
                    : '—'}
                </p>
              </div>
            </div>

            <div>
              <label className="label">Estado</label>
              <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="scheduled">Programada</option>
                <option value="completed">Completada</option>
                <option value="missed">Perdida</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="label">Notas</label>
              <textarea className="input" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Agrega notas..." />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cerrar</button>
              <button onClick={handleUpdate} disabled={updating} className="btn-primary flex-1">
                {updating ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
