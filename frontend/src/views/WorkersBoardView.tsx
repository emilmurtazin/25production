import { useCallback, useEffect, useState } from 'react';
import type { Shop, Resource, Worker, WorkOrder } from '../api/types';
import {
  fetchShops, fetchResources, fetchWorkers, fetchWorkOrders, generateWorkOrdersRange,
  createWorker, updateWorker, deleteWorker,
} from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { ShopsPanel } from '../components/ShopsPanel';
import { CellDetailPanel } from '../components/CellDetailPanel';

const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function dayInfo(dayOffset: number): { label: string; sub: string } {
  const d = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
  const sub = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (dayOffset === 0) return { label: 'Сегодня', sub };
  if (dayOffset === 1) return { label: 'Завтра', sub };
  return { label: WEEKDAY_LABELS[d.getDay()], sub };
}

export function WorkersBoardView() {
  const { user } = useAuth();
  const canManageWorkers = user?.role === 'ADMIN' || user?.role === 'SHOP_MASTER';
  const canGenerate = user?.role === 'ADMIN' || user?.role === 'DISPATCHER' || user?.role === 'SHOP_MASTER';
  const canReport = user?.role === 'ADMIN' || user?.role === 'SHOP_MASTER';

  const [shops, setShops] = useState<Shop[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [weekStart, setWeekStart] = useState(0);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [shopsPanelOpen, setShopsPanelOpen] = useState(false);
  const [workersPanelOpen, setWorkersPanelOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ workerId: string; dayOffset: number } | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => weekStart + i);

  const loadStatic = useCallback(async () => {
    try {
      const [s, r, w] = await Promise.all([fetchShops(), fetchResources(), fetchWorkers()]);
      setShops(s); setResources(r); setWorkers(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить справочники');
    }
  }, []);

  const loadWorkOrders = useCallback(async () => {
    try {
      const rows = await fetchWorkOrders({ fromDayOffset: weekStart, toDayOffset: weekStart + 6 });
      setWorkOrders(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить наряды');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { loadStatic(); }, [loadStatic]);
  useEffect(() => { loadWorkOrders(); }, [loadWorkOrders]);

  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    setError(null);
    try {
      const result = await generateWorkOrdersRange(weekStart, weekStart + 6);
      let totalAssigned = 0;
      let totalUnassigned = 0;
      Object.values(result.days).forEach((dayRes) => {
        Object.values(dayRes).forEach((r) => { totalAssigned += r.assignedHours; totalUnassigned += r.unassignedHours; });
      });
      setGenResult(`Распределено ${totalAssigned.toFixed(1)} ч на неделю.${totalUnassigned > 0 ? ` Не хватило людей на ${totalUnassigned.toFixed(1)} ч.` : ''}`);
      await loadWorkOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сформировать наряды');
    } finally {
      setGenerating(false);
    }
  }

  function cellData(workerId: string, dayOffset: number) {
    const wo = workOrders.find((w) => w.workerId === workerId && w.dayOffset === dayOffset);
    const items = wo?.items ?? [];
    const planned = items.reduce((s, i) => s + i.hoursPlanned, 0);
    const actual = items.reduce((s, i) => s + (i.hoursActual ?? 0), 0);
    const reported = items.length > 0 && items.every((i) => i.hoursActual != null);
    return { items, planned, actual, reported };
  }

  if (loading) return <div className="loading-state">Загружаю загрузку сотрудников…</div>;

  const totalWorkers = workers.filter((w) => w.active).length;
  const totalPlannedWeek = workOrders.reduce((s, wo) => s + wo.items.reduce((s2, i) => s2 + i.hoursPlanned, 0), 0);

  const selectedWorker = selectedCell ? workers.find((w) => w.id === selectedCell.workerId) : null;
  const selectedItems = selectedCell ? cellData(selectedCell.workerId, selectedCell.dayOffset).items : [];
  const coworkers = selectedWorker ? workers.filter((w) => w.resourceId === selectedWorker.resourceId && w.id !== selectedWorker.id && w.active) : [];
  const canReassignSelected = canReport && (user?.role === 'ADMIN' || (user?.role === 'SHOP_MASTER'
    && resources.find((r) => r.id === selectedWorker?.resourceId)?.shopId === user.shopId));

  return (
    <div>
      <div className="header">
        <div className="title-block">
          <span className="eyebrow">MVP · Загрузка сотрудников</span>
          <h1>Кто чем загружен</h1>
          <p>Каждая строка — работник, каждая колонка — день. Видно сразу, кто перегружен, а у кого пусто.</p>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="val">{totalWorkers}</div><div className="lbl">активных работников</div></div>
          <div className="kpi"><div className="val">{totalPlannedWeek.toFixed(0)}</div><div className="lbl">часов на неделю</div></div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        <button onClick={() => setWeekStart((w) => Math.max(0, w - 7))} disabled={weekStart === 0}>← Неделя назад</button>
        <span className="hint">{dayInfo(weekStart).sub} — {dayInfo(weekStart + 6).sub}</span>
        <button onClick={() => setWeekStart((w) => w + 7)}>Неделя вперёд →</button>
        {canGenerate && (
          <button className="primary" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Считаю…' : '⟳ Сформировать/пересчитать наряды на неделю'}
          </button>
        )}
        <button onClick={() => setShopsPanelOpen((v) => !v)}>⚙ Цеха и календарь смен</button>
        {canManageWorkers && (
          <button onClick={() => setWorkersPanelOpen((v) => !v)}>👤 Работники ({workers.length})</button>
        )}
      </div>
      {genResult && <div className="hint" style={{ marginBottom: 14 }}>{genResult}</div>}

      {shopsPanelOpen && <ShopsPanel shops={shops} resources={resources} canEdit={canManageWorkers} onChanged={loadStatic} />}
      {workersPanelOpen && (
        <WorkersManagePanel resources={resources} workers={workers} canManage={canManageWorkers} userShopId={user?.shopId ?? null} isAdmin={user?.role === 'ADMIN'} onChanged={loadStatic} />
      )}

      {selectedCell && selectedWorker && (
        <CellDetailPanel
          workerName={selectedWorker.name}
          dayLabel={`${dayInfo(selectedCell.dayOffset).label} ${dayInfo(selectedCell.dayOffset).sub}`}
          items={selectedItems}
          coworkers={coworkers}
          canReport={!!canReport}
          canReassign={!!canReassignSelected}
          onClose={() => setSelectedCell(null)}
          onChanged={loadWorkOrders}
        />
      )}

      <div className="board">
        <div className="board-scroll">
          {shops.map((shop) => {
            const shopResources = resources.filter((r) => r.shopId === shop.id);
            if (!shopResources.length) return null;
            return (
              <div key={shop.id}>
                <div className="shop-header-row">
                  <span className="shop-header-name">{shop.name}</span>
                </div>
                {shopResources.map((res) => {
                  const resWorkers = workers.filter((w) => w.resourceId === res.id && w.active);
                  if (!resWorkers.length) {
                    return (
                      <div key={res.id} className="grid-row" style={{ padding: '10px 14px' }}>
                        <span className="hint">{res.name} — нет работников (добавьте через «👤 Работники»)</span>
                      </div>
                    );
                  }
                  return (
                    <div key={res.id}>
                      <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--text-dim)', background: 'var(--surface)' }}>{res.name}</div>
                      {resWorkers.map((w) => (
                        <div key={w.id} className="grid-row" style={{ display: 'flex' }}>
                          <div className="res-label" style={{ flex: '0 0 168px' }}>
                            <div className="name">{w.name}</div>
                            <div className="type">разряд {w.grade}</div>
                          </div>
                          <div style={{ display: 'flex', flex: 1 }}>
                            {days.map((d) => {
                              const { planned, actual, reported, items } = cellData(w.id, d);
                              const info = dayInfo(d);
                              const load = planned > 0 ? Math.min(100, Math.round((planned / 8) * 100)) : 0;
                              return (
                                <button
                                  key={d}
                                  onClick={() => items.length && setSelectedCell({ workerId: w.id, dayOffset: d })}
                                  style={{
                                    flex: 1, minWidth: 92, border: '1px solid var(--grid)', borderRadius: 0,
                                    background: planned === 0 ? 'var(--surface)' : 'var(--surface-2)',
                                    padding: '8px 6px', textAlign: 'left', cursor: items.length ? 'pointer' : 'default',
                                    opacity: items.length ? 1 : 0.5,
                                  }}
                                >
                                  <div className="hint" style={{ fontSize: 10 }}>{info.label}</div>
                                  {planned > 0 ? (
                                    <>
                                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 13, fontWeight: 600, color: load > 100 ? 'var(--rose)' : 'var(--cyan)' }}>
                                        {planned.toFixed(1)} ч
                                      </div>
                                      <div className="load" style={{ height: 4, marginTop: 4 }}>
                                        <div className="load-fill" style={{ width: `${load}%`, background: load > 100 ? 'var(--rose)' : 'var(--cyan)' }} />
                                      </div>
                                      {reported && <div className="hint" style={{ fontSize: 9.5, marginTop: 3, color: 'var(--green)' }}>✓ факт {actual.toFixed(1)} ч</div>}
                                    </>
                                  ) : (
                                    <div className="hint" style={{ fontSize: 11 }}>—</div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="footer-note">
        <b>Как читать:</b> цвет и заполнение полоски показывают загрузку относительно 8-часового дня. Клик по ячейке
        с часами открывает список операций — там же можно отчитаться по факту или перекинуть операцию на другого
        работника того же участка. «⟳ Сформировать наряды» пересчитывает всю неделю заново из актуального графика —
        то, что уже сделано (отчитано), учитывается автоматически и не планируется повторно.
      </div>
    </div>
  );
}

function WorkersManagePanel({ resources, workers, canManage, userShopId, isAdmin, onChanged }: {
  resources: Resource[]; workers: Worker[]; canManage: boolean; userShopId: string | null; isAdmin: boolean; onChanged: () => void;
}) {
  const visibleResources = isAdmin ? resources : resources.filter((r) => r.shopId === userShopId);
  const [resourceId, setResourceId] = useState(visibleResources[0]?.id ?? '');
  const [name, setName] = useState('');
  const [grade, setGrade] = useState(1);

  const resourceWorkers = workers.filter((w) => w.resourceId === resourceId);

  async function handleAdd() {
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
    try { await deleteWorker(id); onChanged(); } catch { /* сервер объяснит, если у работника есть наряды */ }
  }

  return (
    <div className="panel accent-cyan">
      <div className="field-row" style={{ alignItems: 'center' }}>
        <span className="hint">Участок:</span>
        <select value={resourceId} onChange={(e) => setResourceId(e.target.value)} style={{ flex: '0 0 220px' }}>
          {visibleResources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0' }}>
        {resourceWorkers.map((w) => (
          <span key={w.id} className="chip" style={{ opacity: w.active ? 1 : 0.5 }}>
            {w.name} · разряд {w.grade}
            {canManage && (
              <>
                <button onClick={() => toggleActive(w)}>{w.active ? '⏸' : '▶'}</button>
                <button onClick={() => handleDelete(w.id)}>✕</button>
              </>
            )}
          </span>
        ))}
        {!resourceWorkers.length && <span className="hint">На этом участке пока нет работников</span>}
      </div>
      {canManage && (
        <div className="field-row">
          <input placeholder="Имя работника" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '0 0 200px' }} />
          <select value={grade} onChange={(e) => setGrade(Number(e.target.value))} style={{ flex: '0 0 120px' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => <option key={g} value={g}>Разряд {g}</option>)}
          </select>
          <button onClick={handleAdd}>+ Добавить работника</button>
        </div>
      )}
    </div>
  );
}
