import { useState } from 'react';
import type { Shop, Resource } from '../api/types';
import { updateShop, createShop, deleteShop, updateResource, createResource, deleteResource } from '../api/endpoints';
import { WEEKDAY_LABELS } from '../utils/calendar';

interface Props {
  shops: Shop[];
  resources: Resource[];
  canEdit: boolean;
  onChanged: () => void;
}

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function ShopsPanel({ shops, resources, canEdit, onChanged }: Props) {
  const [selectedShopId, setSelectedShopId] = useState(shops[0]?.id ?? '');
  const [newShopName, setNewShopName] = useState('');
  const [newResourceName, setNewResourceName] = useState('');
  const [newResourceType, setNewResourceType] = useState('участок');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shop = shops.find((s) => s.id === selectedShopId) ?? shops[0];
  if (!shop) return null;
  const shopResources = resources.filter((r) => r.shopId === shop.id);

  async function toggleDay(day: number) {
    if (!canEdit || busy) return;
    const days = shop.workDays.includes(day) ? shop.workDays.filter((d) => d !== day) : [...shop.workDays, day];
    setBusy(true);
    try { await updateShop(shop.id, { workDays: days }); onChanged(); } finally { setBusy(false); }
  }

  async function handleWorkStart(v: string) {
    const val = Math.max(0, Math.min(23, Number(v) || 0));
    if (val >= shop.workEnd) return;
    setBusy(true);
    try { await updateShop(shop.id, { workStart: val }); onChanged(); } finally { setBusy(false); }
  }

  async function handleWorkEnd(v: string) {
    const val = Math.max(1, Math.min(24, Number(v) || 24));
    if (val <= shop.workStart) return;
    setBusy(true);
    try { await updateShop(shop.id, { workEnd: val }); onChanged(); } finally { setBusy(false); }
  }

  async function handleAddShop() {
    if (!newShopName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createShop({ name: newShopName.trim() });
      setNewShopName('');
      setSelectedShopId(created.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать цех');
    } finally { setBusy(false); }
  }

  async function handleDeleteShop() {
    setBusy(true);
    setError(null);
    try {
      await deleteShop(shop.id);
      setSelectedShopId('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить цех');
    } finally { setBusy(false); }
  }

  async function toggleAlwaysOn(resourceId: string, current: boolean) {
    setBusy(true);
    try { await updateResource(resourceId, { alwaysOn: !current }); onChanged(); } finally { setBusy(false); }
  }

  async function handleAddResource() {
    if (!newResourceName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createResource({ name: newResourceName.trim(), type: newResourceType, shopId: shop.id });
      setNewResourceName('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать участок');
    } finally { setBusy(false); }
  }

  async function handleDeleteResource(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteResource(id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить участок');
    } finally { setBusy(false); }
  }

  return (
    <div className="panel accent-cyan">
      {error && <div className="login-error">{error}</div>}

      <div className="field-row" style={{ alignItems: 'center' }}>
        <span className="hint">Цех:</span>
        {shops.map((s) => (
          <button
            key={s.id}
            className={s.id === shop.id ? 'primary' : ''}
            onClick={() => setSelectedShopId(s.id)}
            style={{ flex: '0 0 auto' }}
          >
            {s.name}
          </button>
        ))}
        {canEdit && (
          <>
            <input
              placeholder="Название нового цеха"
              value={newShopName}
              onChange={(e) => setNewShopName(e.target.value)}
              style={{ flex: '0 0 200px' }}
            />
            <button onClick={handleAddShop} disabled={busy}>+ Новый цех</button>
            <button className="danger" onClick={handleDeleteShop} disabled={busy || shops.length <= 1} title={shops.length <= 1 ? 'Должен остаться хотя бы один цех' : 'Удалить этот цех'}>
              ✕ Удалить «{shop.name}»
            </button>
          </>
        )}
      </div>

      <div className="field-row" style={{ alignItems: 'center' }}>
        <span className="hint">Смена «{shop.name}»:</span>
        <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          с
          <input
            type="number" min={0} max={23} value={shop.workStart} disabled={!canEdit}
            onChange={(e) => handleWorkStart(e.target.value)} style={{ width: 60 }}
          />
        </label>
        <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          до
          <input
            type="number" min={1} max={24} value={shop.workEnd} disabled={!canEdit}
            onChange={(e) => handleWorkEnd(e.target.value)} style={{ width: 60 }}
          />
        </label>
        <span className="hint">({shop.workEnd - shop.workStart} ч/день)</span>
      </div>

      <div className="field-row" style={{ alignItems: 'center' }}>
        <span className="hint">Рабочие дни:</span>
        {DAY_ORDER.map((d) => (
          <button
            key={d}
            disabled={!canEdit}
            className={shop.workDays.includes(d) ? 'primary' : ''}
            onClick={() => toggleDay(d)}
            style={{ flex: '0 0 auto', padding: '6px 10px' }}
          >
            {WEEKDAY_LABELS[d]}
          </button>
        ))}
      </div>

      <div className="field-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="hint">Участки цеха:</span>
        {shopResources.map((r) => (
          <span key={r.id} className="chip" style={{ gap: 8 }}>
            {r.name}
            {canEdit && (
              <>
                <button
                  onClick={() => toggleAlwaysOn(r.id, r.alwaysOn)}
                  style={{ padding: '2px 6px', color: r.alwaysOn ? 'var(--cyan)' : undefined }}
                >
                  24/7
                </button>
                <button onClick={() => handleDeleteResource(r.id)} title="Удалить участок">✕</button>
              </>
            )}
            {!canEdit && r.alwaysOn && <span className="always-on-badge">24/7</span>}
          </span>
        ))}
        {!shopResources.length && <span className="hint">В этом цехе пока нет участков</span>}
      </div>

      {canEdit && (
        <div className="field-row" style={{ alignItems: 'center', marginTop: 4 }}>
          <input
            placeholder="Название участка"
            value={newResourceName}
            onChange={(e) => setNewResourceName(e.target.value)}
            style={{ flex: '0 0 200px' }}
          />
          <select value={newResourceType} onChange={(e) => setNewResourceType(e.target.value)} style={{ flex: '0 0 140px' }}>
            <option value="участок">участок</option>
            <option value="бригада">бригада</option>
          </select>
          <button onClick={handleAddResource} disabled={busy}>+ Добавить участок в «{shop.name}»</button>
        </div>
      )}
    </div>
  );
}
