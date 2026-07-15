import { useState } from 'react';
import type { WorkOrderItem, Worker } from '../api/types';
import { reportWorkOrderItem, reassignWorkOrderItem } from '../api/endpoints';

interface Props {
  workerName: string;
  dayLabel: string;
  items: WorkOrderItem[];
  coworkers: Worker[]; // остальные работники того же участка — куда можно перекинуть операцию
  canReport: boolean;
  canReassign: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function CellDetailPanel({
  workerName, dayLabel, items, coworkers, canReport, canReassign, onClose, onChanged,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleReport(itemId: string, value: string) {
    const hours = Number(value);
    if (Number.isNaN(hours) || hours < 0) return;
    setBusyId(itemId);
    setError(null);
    try { await reportWorkOrderItem(itemId, hours); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить отчёт'); }
    finally { setBusyId(null); }
  }

  async function handleReassign(itemId: string, workerId: string) {
    if (!workerId) return;
    setBusyId(itemId);
    setError(null);
    try {
      const result = await reassignWorkOrderItem(itemId, { workerId });
      if (result.warning) setError(result.warning);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось переназначить операцию');
    } finally {
      setBusyId(null);
    }
  }

  async function handleHoursChange(itemId: string, value: string) {
    const hours = Number(value);
    if (Number.isNaN(hours) || hours <= 0) return;
    setBusyId(itemId);
    try { await reassignWorkOrderItem(itemId, { hoursPlanned: hours }); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось изменить часы'); }
    finally { setBusyId(null); }
  }

  return (
    <div className="panel accent" style={{ position: 'relative' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, padding: '2px 8px' }}>✕</button>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{workerName} — {dayLabel}</div>
      {error && <div className="login-error">{error}</div>}

      {items.map((item) => (
        <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--grid)' }}>
          <div style={{ fontSize: 13 }}>{item.orderOperation.name}</div>
          <div className="hint" style={{ marginBottom: 8 }}>{item.orderOperation.order.name} · {item.orderOperation.order.client}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              План, ч
              <input
                type="number" min={0.1} step={0.1} defaultValue={item.hoursPlanned}
                disabled={!canReassign || busyId === item.id}
                style={{ width: 70 }}
                onBlur={(e) => e.target.value !== String(item.hoursPlanned) && handleHoursChange(item.id, e.target.value)}
              />
            </label>
            {canReport && (
              <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Факт, ч
                <input
                  type="number" min={0} step={0.1} defaultValue={item.hoursActual ?? ''}
                  placeholder="—" disabled={busyId === item.id} style={{ width: 70 }}
                  onBlur={(e) => e.target.value !== '' && handleReport(item.id, e.target.value)}
                />
              </label>
            )}
            {canReassign && coworkers.length > 0 && (
              <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Перекинуть на
                <select disabled={busyId === item.id} defaultValue="" onChange={(e) => handleReassign(item.id, e.target.value)}>
                  <option value="">— выбрать работника —</option>
                  {coworkers.map((w) => <option key={w.id} value={w.id}>{w.name} (разряд {w.grade})</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
      ))}
      {!items.length && <span className="hint">Нет операций на этот день</span>}
    </div>
  );
}
