import { useState } from 'react';
import type { ScheduledOperation, Resource } from '../api/types';
import { pinOperation, unpinOperation } from '../api/endpoints';
import { fmtHour } from '../utils/calendar';

interface Props {
  op: ScheduledOperation;
  resources: Resource[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function PinEditor({ op, resources, canEdit, onClose, onChanged }: Props) {
  const [start, setStart] = useState(Math.round(op.start));
  const [resourceId, setResourceId] = useState(op.effectiveResourceId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePin() {
    setBusy(true);
    setError(null);
    try {
      await pinOperation(op.id, start, resourceId !== op.resourceId ? resourceId : undefined);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось закрепить операцию');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnpin() {
    setBusy(true);
    setError(null);
    try {
      await unpinOperation(op.id);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось снять закрепление');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel accent" style={{ position: 'relative' }}>
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 10, right: 10, padding: '2px 8px' }}
      >
        ✕
      </button>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{op.name}</div>
      <div className="hint" style={{ marginBottom: 12 }}>
        {op.orderName} · {op.projectName} · сейчас: {fmtHour(op.start)} — {fmtHour(op.end)}
        {op.pinned && ' · закреплено вручную'}
      </div>

      {!canEdit && (
        <div className="hint">
          У вас нет прав редактировать эту операцию (мастер цеха может закреплять только операции своего цеха).
        </div>
      )}

      {canEdit && (
        <>
          {error && <div className="login-error">{error}</div>}
          <div className="field-row">
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Начало (час от текущего момента):
              <input
                type="number"
                min={0}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
            <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary" onClick={handlePin} disabled={busy}>Закрепить здесь</button>
            {op.pinned && <button onClick={handleUnpin} disabled={busy}>Вернуть авторасчёт</button>}
          </div>
        </>
      )}
    </div>
  );
}
