import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import { visitsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { Visit } from '../../types';
import Modal from '../../components/Modal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ status: '', notes: '', scheduled_date: '', scheduled_time: '' });
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    if (!user?.rep_id) return;
    const v = await visitsApi.getAll({ rep_id: user.rep_id });
    setVisits(v);
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

  const handleEventClick = (info: any) => {
    const visit: Visit = info.event.extendedProps.visit;
    setSelectedVisit(visit);
    const dateObj = new Date(visit.scheduled_date);
    const dateStr = dateObj.toISOString().slice(0, 10);
    const timeStr = dateObj.toTimeString().slice(0, 5);
    setForm({ status: visit.status, notes: visit.notes || '', scheduled_date: dateStr, scheduled_time: timeStr });
    setModalOpen(true);
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
      setModalOpen(false);
      load();
    } catch { alert('Error al actualizar'); }
    finally { setUpdating(false); }
  };

  if (!user?.rep_id) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p>ID de visitador no configurado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi Calendario</h1>
        <p className="text-gray-500 text-sm mt-1">Tus visitas programadas</p>
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
          height={620}
          locale="es"
          buttonText={{
            today: 'Hoy',
            month: 'Mes',
            list: 'Lista'
          }}
        />
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Actualizar Visita">
        {selectedVisit && (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{selectedVisit.doctor_name}</p>
                  <p className="text-sm text-gray-500">{selectedVisit.doctor_specialty || 'Sin especialidad'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-700">
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
              <button onClick={() => setModalOpen(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleUpdate} disabled={updating} className="btn-primary flex-1">
                {updating ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
