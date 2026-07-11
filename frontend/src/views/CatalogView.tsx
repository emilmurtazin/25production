import { Fragment, useEffect, useState, type FormEvent } from 'react';
import type { CatalogOperation, Modification, Resource } from '../api/types';
import {
  fetchCatalog, createCatalogOperation, deleteCatalogOperation,
  createMeasurement, deleteMeasurement, applyAverageAsNorm,
  fetchModifications, createModification, deleteModification,
  fetchResources,
} from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { LiveTimer } from '../components/LiveTimer';

export function CatalogView() {
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'NORMIROVSHIK';

  const [catalog, setCatalog] = useState<CatalogOperation[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [activeTimer, setActiveTimer] = useState<{ catalogOperationId: string; startTs: number } | null>(null);

  const [node, setNode] = useState('');
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('');
  const [requiredGrade, setRequiredGrade] = useState(1);
  const [resourceId, setResourceId] = useState('');

  const [modBuilderOpen, setModBuilderOpen] = useState(false);

  async function load() {
    try {
      const [cat, res, mods] = await Promise.all([fetchCatalog(), fetchResources(), fetchModifications()]);
      setCatalog(cat);
      setResources(res);
      setModifications(mods);
      if (!resourceId && res.length) setResourceId(res[0].id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить справочник');
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!node.trim() || !name.trim() || !minutes || !resourceId) return;
    try {
      await createCatalogOperation({ node: node.trim(), name: name.trim(), normMinutes: Number(minutes), requiredGrade, resourceId });
      setNode(''); setName(''); setMinutes(''); setRequiredGrade(1);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить операцию');
    }
  }

  async function handleDelete(id: string) {
    try { await deleteCatalogOperation(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось удалить операцию'); }
  }

  function startTimer(catalogOperationId: string) {
    if (activeTimer) return;
    setActiveTimer({ catalogOperationId, startTs: Date.now() });
    setOpenRowId(catalogOperationId);
  }

  async function stopTimer() {
    if (!activeTimer) return;
    const elapsedMinutes = (Date.now() - activeTimer.startTs) / 60000;
    try {
      await createMeasurement(activeTimer.catalogOperationId, +elapsedMinutes.toFixed(2));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить замер');
    } finally {
      setActiveTimer(null);
    }
  }

  async function handleApplyAverage(id: string) {
    try { await applyAverageAsNorm(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось применить норму'); }
  }

  async function handleDeleteMeasurement(id: string) {
    try { await deleteMeasurement(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось удалить замер'); }
  }

  async function handleDeleteModification(id: string) {
    try { await deleteModification(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось удалить модификацию'); }
  }

  if (loading) return <div className="loading-state">Загружаю справочник…</div>;

  return (
    <div>
      <div className="header">
        <div className="title-block">
          <span className="eyebrow">MVP · Нормирование</span>
          <h1>Справочник технологических операций</h1>
          <p>Норма в часах и выработка за смену считаются от нормы в минутах. Замер времени — прямо из интерфейса, секундомером.</p>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="val">{catalog.length}</div><div className="lbl">операций</div></div>
          <div className="kpi"><div className="val">{new Set(catalog.map((c) => c.node)).size}</div><div className="lbl">узлов сборки</div></div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="board">
        <table className="data-table">
          <thead>
            <tr>
              <th>Узел сборки</th><th>Операция</th>
              <th className="num">Норма, мин</th><th className="num">Норма, час</th>
              <th className="num">Мин. разряд</th>
              <th>Ресурс</th><th />
            </tr>
          </thead>
          <tbody>
            {catalog.map((c) => {
              const isOpen = openRowId === c.id;
              const isTiming = activeTimer?.catalogOperationId === c.id;
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td>{c.node}</td>
                    <td>{c.name}</td>
                    <td className="num">{c.normMinutes}</td>
                    <td className="num">{c.normHours}</td>
                    <td className="num">{c.requiredGrade}</td>
                    <td>{resources.find((r) => r.id === c.resourceId)?.name ?? c.resourceId}</td>
                    <td>
                      <button
                        className={`icon-btn ${isOpen ? 'active' : ''}`}
                        onClick={() => setOpenRowId(isOpen ? null : c.id)}
                        title="Замер времени"
                      >
                        ⏱{c.measurements.length ? ` ${c.measurements.length}` : ''}
                      </button>
                      {canEdit && <button className="icon-btn" onClick={() => handleDelete(c.id)}>✕</button>}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} style={{ background: 'var(--surface-2)' }}>
                        <div style={{ padding: '10px 0' }}>
                          <div className="timer-controls">
                            {isTiming ? (
                              <>
                                <LiveTimer startTs={activeTimer!.startTs} />
                                <button className="primary" onClick={stopTimer}>⏹ Остановить замер</button>
                              </>
                            ) : (
                              <button className="primary" onClick={() => startTimer(c.id)} disabled={!!activeTimer}>
                                ▶ Начать замер
                              </button>
                            )}
                            {activeTimer && !isTiming && <span className="hint">Идёт другой замер — остановите его сначала</span>}
                          </div>
                          {c.measurements.length > 0 ? (
                            <>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                {c.measurements.slice(0, 6).map((m) => (
                                  <span key={m.id} className="chip">
                                    {m.minutes.toFixed(2)} мин
                                    {canEdit && <button onClick={() => handleDeleteMeasurement(m.id)}>✕</button>}
                                  </span>
                                ))}
                              </div>
                              <div className="timer-summary">
                                Замеров: {c.measurements.length} · среднее:{' '}
                                <b>{(c.measurements.reduce((s, m) => s + m.minutes, 0) / c.measurements.length).toFixed(2)} мин</b>
                                {canEdit && <button onClick={() => handleApplyAverage(c.id)}>Применить среднее как норму</button>}
                              </div>
                            </>
                          ) : (
                            <span className="hint">Замеров пока нет — нажмите «Начать замер» во время выполнения операции</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {canEdit && (
          <form className="field-row" style={{ padding: 14, background: 'var(--surface-2)' }} onSubmit={handleAdd}>
            <input placeholder="Узел сборки" value={node} onChange={(e) => setNode(e.target.value)} />
            <input placeholder="Операция" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 2 }} />
            <input type="number" min={0.1} step={0.1} placeholder="Норма, мин" value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ flex: '0 1 120px' }} />
            <select value={requiredGrade} onChange={(e) => setRequiredGrade(Number(e.target.value))} style={{ flex: '0 1 130px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => <option key={g} value={g}>Мин. разряд {g}</option>)}
            </select>
            <select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button type="submit" className="primary">+ Добавить операцию</button>
          </form>
        )}
      </div>

      <div className="title-block" style={{ margin: '26px 0 12px' }}>
        <h1 style={{ fontSize: 17 }}>Модификации изделия</h1>
        <p>Готовые наборы операций для конкретного варианта продукта.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
        {modifications.map((m) => (
          <div key={m.id} className="panel" style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b style={{ fontSize: 13.5 }}>{m.name}</b>
              {canEdit && <button className="icon-btn" onClick={() => handleDeleteModification(m.id)}>✕</button>}
            </div>
            <div className="hint" style={{ margin: '8px 0' }}>{m.items.length} операций · {m.totalHours} ч трудозатрат</div>
          </div>
        ))}
        {canEdit && (
          <div className="panel" style={{ marginBottom: 0, borderStyle: 'dashed', display: 'flex', alignItems: modBuilderOpen ? 'stretch' : 'center', justifyContent: 'center' }}>
            {modBuilderOpen
              ? <ModificationBuilder catalog={catalog} onDone={() => { setModBuilderOpen(false); load(); }} onCancel={() => setModBuilderOpen(false)} />
              : <button className="primary" onClick={() => setModBuilderOpen(true)}>+ Новая модификация</button>}
          </div>
        )}
      </div>

      <div className="footer-note">
        <b>Замер времени:</b> нормировщик засекает реальное выполнение операции секундомером — замеры копятся в истории,
        среднее из них одним кликом становится новой нормой вместо значения «на глаз».
      </div>
    </div>
  );
}

function ModificationBuilder({ catalog, onDone, onCancel }: {
  catalog: CatalogOperation[]; onDone: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [items, setItems] = useState<{ catalogOperationId: string; qty: number }[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  function addItem() {
    if (!selected) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.catalogOperationId === selected);
      if (existing) return prev.map((i) => (i.catalogOperationId === selected ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { catalogOperationId: selected, qty: 1 }];
    });
  }

  async function save() {
    if (!name.trim() || !items.length) return;
    setBusy(true);
    try { await createModification({ name: name.trim(), items }); onDone(); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ width: '100%' }}>
      <input placeholder="Название модификации" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
      <div className="field-row">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ flex: 1 }}>
          <option value="">— выберите операцию —</option>
          {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={addItem} type="button">+ Добавить</button>
      </div>
      {items.map((it) => {
        const cat = catalog.find((c) => c.id === it.catalogOperationId);
        return <div key={it.catalogOperationId} className="hint" style={{ padding: '4px 0' }}>{cat?.name} × {it.qty}</div>;
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={onCancel}>Отмена</button>
        <button type="button" className="primary" onClick={save} disabled={busy}>Сохранить модификацию</button>
      </div>
    </div>
  );
}
