import { useEffect, useState, type FormEvent } from 'react';
import type { Resource, Worker, WorkOrder } from '../api/types';
import {
  fetchResources, fetchWorkers, createWorker, updateWorker, deleteWorker,
  generateWorkOrders, fetchWorkOrders, reportWorkOrderItem,
} from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const DAY_LABELS = ['Сегодня', 'Завтра', 'Послезавтра'];

export function WorkOrdersView() {
  const { user } = useAuth();
  const canManageWorkers = user?.role === 'ADMIN' || user?.role === 'SHOP_MASTER';
  const canGenerate = user?.role === 'ADMIN' || user?.role === 'DISPATCHER' || user?.role === 'SHOP_MASTER';
  const canReport = user?.role === 'ADMIN' || user?.role === 'SHOP_MASTER';

  const [resources, setResources] = useState<Resource[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState<string>('');
  const [dayOffset, setDayOffset] = useState(0);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<string | null>(null);

  const visibleResources = user?.role === 'SHOP_MASTER'
    ? resources.filter((r) => r.shopId === user.shopId)
    : resources;

  async function loadStatic() {
    try {
      const res = await fetchResources();
      setResources(res);
      if (!selectedResourceId) {
        const scoped = user?.role === 'SHOP_MASTER' ? res.filter((r) => r.shopId === user.shopId) : res;
        if (scoped[0]) setSelectedResourceId(scoped[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить участки');
    }
  }

  async function loadWorkers() {
    if (!selectedResourceId) return;
    try {
      setWorkers(await fetchWorkers(selectedResourceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить работников');
    }
  }

  async function loadWorkOrders() {
    try {
      setWorkOrders(await fetchWorkOrders({ dayOffset }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить наряды');
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadStatic(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadWorkers(); }, [selectedResourceId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadWorkOrders(); }, [dayOffset]);

  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    setError(null);
    try {
      const result = await generateWorkOrders(dayOffset);
      const totalAssigned = Object.values(result.resources).reduce((s, r) => s + r.assignedHours, 0);
      const totalUnassigned = Object.values(result.resources).reduce((s, r) => s + r.unassignedHours, 0);
      setGenResult(`Распределено ${totalAssigned.toFixed(1)} ч. ${totalUnassigned > 0 ? `Не хватило людей на ${totalUnassigned.toFixed(1)} ч (нет подходящих по разряду или все заняты).` : ''}`);
      await loadWorkOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сформировать наряды');
    } finally {
      setGenerating(false);
    }
  }

  async function handleReport(itemId: string, value: string) {
    const hours = Number(value);
    if (Number.isNaN(hours) || hours < 0) return;
    try {
      await reportWorkOrderItem(itemId, hours);
      await loadWorkOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить отчёт');
    }
  }

  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const groupedByResource = new Map<string, WorkOrder[]>();
  workOrders.forEach((wo) => {
    const list = groupedByResource.get(wo.resourceId) ?? [];
    list.push(wo);
    groupedByResource.set(wo.resourceId, list);
  });

  if (loading) return <div className="loading-state">Загружаю наряды…</div>;

  return (
    <div>
      <div className="header">
        <div className="title-block">
          <span className="eyebrow">MVP · Наряды</span>
          <h1>Работники и наряды</h1>
          <p>Система распределяет часы графика по конкретным людям на день — с учётом разряда и равномерной загрузки.</p>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="val">{workOrders.length}</div><div className="lbl">нарядов на день</div></div>
          <div className="kpi"><div className="val">{workers.length}</div><div className="lbl">работников участка</div></div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        {DAY_LABELS.map((label, idx) => (
          <button key={idx} className={dayOffset === idx ? 'primary' : ''} onClick={() => setDayOffset(idx)}>
            {label}
          </button>
        ))}
        <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          или день +
          <input type="number" min={0} max={60} value={dayOffset} onChange={(e) => setDayOffset(Number(e.target.value))} style={{ width: 60 }} />
        </label>
        {canGenerate && (
          <button className="primary" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Считаю…' : '⟳ Сформировать/пересчитать наряды на этот день'}
          </button>
        )}
      </div>
      {genResult && <div className="hint" style={{ marginBottom: 14 }}>{genResult}</div>}

      {/* ---- Работники выбранного участка ---- */}
      <div className="panel">
        <div className="field-row" style={{ alignItems: 'center' }}>
          <span className="hint">Участок:</span>
          <select value={selectedResourceId} onChange={(e) => setSelectedResourceId(e.target.value)} style={{ flex: '0 0 220px' }}>
            {visibleResources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <WorkersList
          workers={workers}
          resourceId={selectedResourceId}
          canManage={canManageWorkers}
          onChanged={loadWorkers}
        />
      </div>

      {/* ---- Наряды на выбранный день ---- */}
      {Array.from(groupedByResource.entries()).map(([resId, list]) => (
        <div key={resId} className="panel">
          <div style={{ fontWeight: 600, marginBottom: 10 }}>{resourceById.get(resId)?.name ?? resId}</div>
          {list.map((wo) => {
            const totalPlanned = wo.items.reduce((s, i) => s + i.hoursPlanned, 0);
            const totalActual = wo.items.reduce((s, i) => s + (i.hoursActual ?? 0), 0);
            return (
              <div key={wo.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--grid)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <b>{wo.worker.name} <span className="hint">(разряд {wo.worker.grade})</span></b>
                  <span className="hint">
                    план {totalPlanned.toFixed(2)} ч · факт {totalActual.toFixed(2)} ч
                  </span>
                </div>
                {wo.items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0', fontSize: 12.5 }}>
                    <div style={{ flex: 1 }}>
                      {item.orderOperation.name}
                      <span className="hint"> · {item.orderOperation.order.name}</span>
                    </div>
                    <span className="hint" style={{ width: 70, textAlign: 'right' }}>{item.hoursPlanned.toFixed(2)} ч план</span>
                    {canReport ? (
                      <input
                        type="number" min={0} step={0.1}
                        defaultValue={item.hoursActual ?? ''}
                        placeholder="факт, ч"
                        style={{ width: 80 }}
                        onBlur={(e) => e.target.value !== '' && handleReport(item.id, e.target.value)}
                      />
                    ) : (
                      <span style={{ width: 80, textAlign: 'right' }}>{item.hoursActual ?? '—'}</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
      {workOrders.length === 0 && (
        <div className="panel"><span className="hint">На выбранный день наряды ещё не сформированы — нажмите кнопку выше.</span></div>
      )}

      <div className="footer-note">
        <b>Как это работает:</b> «Сформировать/пересчитать наряды» берёт актуальный график, вырезает часы на выбранный день
        и раздаёт их наименее загруженным сегодня работникам среди тех, кто по разряду допущен к операции. Отчёт по факту
        сразу уменьшает остаток операции — при следующем формировании нарядов (в т.ч. на следующий день) система уже
        учитывает, что сделано, и распределяет только то, что осталось.
      </div>
    </div>
  );
}

function WorkersList({ workers, resourceId, canManage, onChanged }: {
  workers: Worker[]; resourceId: string; canManage: boolean; onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [grade, setGrade] = useState(1);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !resourceId) return;
    await createWorker({ name: name.trim(), grade, resourceId });
    setName(''); setGrade(1);
    onChanged();
  }

  async function toggleActive(w: Worker) {
    await updateWorker(w.id, { active: !w.active });
    onChanged();
  }

  async function handleDelete(id: string) {
    try { await deleteWorker(id); onChanged(); }
    catch { /* сервер вернёт понятную ошибку, если у работника есть наряды */ }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: canManage ? 12 : 0 }}>
        {workers.map((w) => (
          <span key={w.id} className="chip" style={{ opacity: w.active ? 1 : 0.5 }}>
            {w.name} · разряд {w.grade}
            {canManage && (
              <>
                <button onClick={() => toggleActive(w)} title={w.active ? 'Деактивировать' : 'Активировать'}>
                  {w.active ? '⏸' : '▶'}
                </button>
                <button onClick={() => handleDelete(w.id)}>✕</button>
              </>
            )}
          </span>
        ))}
        {!workers.length && <span className="hint">На этом участке пока нет работников</span>}
      </div>
      {canManage && (
        <form className="field-row" onSubmit={handleAdd}>
          <input placeholder="Имя работника" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '0 0 200px' }} />
          <select value={grade} onChange={(e) => setGrade(Number(e.target.value))} style={{ flex: '0 0 120px' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => <option key={g} value={g}>Разряд {g}</option>)}
          </select>
          <button type="submit">+ Добавить работника</button>
        </form>
      )}
    </div>
  );
}
