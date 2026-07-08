import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ScheduleResponse, ScheduledOperation, CatalogOperation, Modification, Project } from '../api/types';
import { fetchSchedule, fetchCatalog, fetchModifications, fetchProjects, createUrgentOrder } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { isWorkingHour, fmtHour } from '../utils/calendar';
import { ShopsPanel } from '../components/ShopsPanel';
import { OrderBuilderPanel } from '../components/OrderBuilderPanel';
import { PinEditor } from '../components/PinEditor';

const WINDOW_HOURS = 168;
const PX_PER_HOUR = 16;
const ORDER_COLORS = ['#4fd1c5', '#8b7cf6', '#5cc98a', '#e0a3ff', '#6fb3ff', '#d6c46a'];

export function BoardView() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogOperation[]>([]);
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [shopsPanelOpen, setShopsPanelOpen] = useState(false);
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [urgentBusy, setUrgentBusy] = useState(false);

  const canManageOrders = user?.role === 'ADMIN' || user?.role === 'DISPATCHER';
  const canManageShops = user?.role === 'ADMIN' || user?.role === 'DISPATCHER';

  const load = useCallback(async () => {
    try {
      const [sched, cat, mods, projs] = await Promise.all([
        fetchSchedule(), fetchCatalog(), fetchModifications(), fetchProjects(),
      ]);
      setSchedule(sched);
      setCatalog(cat);
      setModifications(mods);
      setProjects(projs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить график');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleUrgentOrder() {
    setUrgentBusy(true);
    try {
      await createUrgentOrder();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать срочный заказ');
    } finally {
      setUrgentBusy(false);
    }
  }

  const colorByOrder = useMemo(() => {
    const map = new Map<string, string>();
    let i = 0;
    schedule?.operations.forEach((op) => {
      if (!map.has(op.orderId) && op.priority !== 'URGENT') {
        map.set(op.orderId, ORDER_COLORS[i % ORDER_COLORS.length]);
        i += 1;
      }
    });
    return map;
  }, [schedule]);

  function availableHoursInWindow(alwaysOn: boolean, calendar: { workStart: number; workEnd: number; workDays: number[] }): number {
    if (alwaysOn) return WINDOW_HOURS;
    let n = 0;
    for (let h = 0; h < WINDOW_HOURS; h += 1) if (isWorkingHour(h, false, calendar)) n += 1;
    return n;
  }

  if (loading) return <div className="loading-state">Загружаю график…</div>;
  if (!schedule) return <div className="error-banner">{error ?? 'Не удалось загрузить данные'}</div>;

  const totalCapacity = schedule.resources.reduce((s, r) => s + availableHoursInWindow(r.alwaysOn, r.calendar), 0);
  const totalBusy = schedule.operations.reduce((s, o) => s + o.durationHours, 0);
  const utilization = totalCapacity > 0 ? Math.round((totalBusy / totalCapacity) * 100) : 0;
  const overloaded = schedule.resources.filter((r) => {
    const busy = schedule.operations.filter((o) => o.effectiveResourceId === r.id).reduce((s, o) => s + o.durationHours, 0);
    return busy > availableHoursInWindow(r.alwaysOn, r.calendar) * 0.85;
  }).length;

  const selectedOp = schedule.operations.find((o) => o.id === selectedOpId) ?? null;
  const selectedOpResource = selectedOp ? schedule.resources.find((r) => r.id === selectedOp.effectiveResourceId) : null;
  const canEditSelected = canManageOrders
    || (user?.role === 'SHOP_MASTER' && selectedOpResource?.shopId === user.shopId);

  return (
    <div>
      <div className="header">
        <div className="title-block">
          <span className="eyebrow">MVP · APS-планировщик</span>
          <h1>Загрузка производства</h1>
          <p>Расчёт приходит с backend — тот же алгоритм, что был в прототипе, теперь против реальной БД.</p>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="val">{schedule.operations.length}</div><div className="lbl">операций в плане</div></div>
          <div className={`kpi ${utilization > 75 ? 'warn' : 'good'}`}><div className="val">{utilization}%</div><div className="lbl">загрузка участков</div></div>
          <div className={`kpi ${overloaded > 0 ? 'warn' : 'good'}`}><div className="val">{overloaded}</div><div className="lbl">перегружено линий</div></div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="toolbar">
        {canManageOrders && (
          <button className="primary" onClick={() => setBuilderOpen((v) => !v)}>
            {builderOpen ? '× Закрыть конструктор' : '+ Новый заказ из справочника'}
          </button>
        )}
        {canManageOrders && (
          <button onClick={handleUrgentOrder} disabled={urgentBusy}>+ Срочный заказ (авто)</button>
        )}
        <button onClick={() => setShopsPanelOpen((v) => !v)}>
          ⚙ Цеха и календарь смен ({schedule.shops.length})
        </button>
        <span className="hint">// клик по блоку операции — закрепить вручную или снять закрепление</span>
      </div>

      {shopsPanelOpen && (
        <ShopsPanel shops={schedule.shops} resources={schedule.resources} canEdit={canManageShops} onChanged={load} />
      )}

      {builderOpen && canManageOrders && (
        <OrderBuilderPanel
          catalog={catalog}
          modifications={modifications}
          projects={projects}
          onClose={() => setBuilderOpen(false)}
          onCreated={load}
        />
      )}

      {selectedOp && (
        <PinEditor
          op={selectedOp}
          resources={schedule.resources}
          canEdit={!!canEditSelected}
          onClose={() => setSelectedOpId(null)}
          onChanged={load}
        />
      )}

      <div className="legend">
        <span><span className="sw" style={{ background: ORDER_COLORS[0] }} /> обычный заказ (свой цвет)</span>
        <span><span className="sw" style={{ background: 'repeating-linear-gradient(135deg, var(--amber) 0 4px, #d68f14 4px 8px)' }} /> срочный заказ</span>
        <span><span className="sw" style={{ background: 'var(--night)', border: '1px solid var(--grid-strong)' }} /> нерабочее время</span>
      </div>

      <div className="board">
        <div className="board-scroll">
          <div className="grid-row header-row">
            <div className="res-label" style={{ display: 'flex', alignItems: 'center' }}>
              <span className="hint">РЕСУРС / ЛИНИЯ</span>
            </div>
            <div className="timeline">
              <HourGrid isHeader />
            </div>
          </div>

          {schedule.shops.map((shop) => {
            const shopResources = schedule.resources.filter((r) => r.shopId === shop.id);
            if (!shopResources.length) return null;
            return (
              <div key={shop.id}>
                <div className="shop-header-row">
                  <span className="shop-header-name">{shop.name}</span>
                  <span className="shop-header-cal">
                    {shop.workDays.map((d) => 'ВПВСЧПС'[d]).join('')} · {shop.workStart}–{shop.workEnd}ч
                  </span>
                </div>
                {shopResources.map((res) => {
                  const resOps = schedule.operations.filter((o) => o.effectiveResourceId === res.id);
                  const busy = resOps.reduce((s, o) => s + o.durationHours, 0);
                  const avail = availableHoursInWindow(res.alwaysOn, res.calendar);
                  const pct = avail > 0 ? Math.min(100, Math.round((busy / avail) * 100)) : 0;
                  return (
                    <div className="grid-row" key={res.id}>
                      <div className="res-label">
                        <div className="name">
                          {res.name}
                          {res.alwaysOn && <span className="always-on-badge">24/7</span>}
                        </div>
                        <div className="type">{res.type}</div>
                        <div className="load"><div className="load-fill" style={{ width: `${pct}%`, background: pct > 85 ? 'var(--rose)' : 'var(--cyan)' }} /></div>
                        <div className="load-pct">{pct}% загрузка окна</div>
                      </div>
                      <div className="timeline">
                        <HourGrid alwaysOn={res.alwaysOn} calendar={res.calendar} />
                        {resOps.map((op) => (
                          <OpBlocks key={op.id} op={op} color={colorByOrder.get(op.orderId)} onClick={() => setSelectedOpId(op.id)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="footer-note">
        <b>Как считает бэкенд:</b> все не закреплённые вручную операции сортируются по приоритету → сроку проекта → порядку внутри
        заказа, затем каждой присваивается старт = max(когда освободится ресурс; когда закончилась предыдущая операция этого же
        заказа), после чего наматываются рабочие часы по календарю цеха (пропуская ночи/выходные). Закреплённые вручную операции
        календарь игнорируют. Клик по блоку операции открывает редактор закрепления выше графика.
      </div>
    </div>
  );
}

function HourGrid({ isHeader, alwaysOn, calendar }: {
  isHeader?: boolean;
  alwaysOn?: boolean;
  calendar?: { workStart: number; workEnd: number; workDays: number[] };
}) {
  const cols = [];
  for (let h = 0; h < WINDOW_HOURS; h += 1) {
    const left = h * PX_PER_HOUR;
    const isDayStart = h % 24 === 0;
    const nonWorking = !isHeader && calendar && !isWorkingHour(h, !!alwaysOn, calendar);
    cols.push(
      <div
        key={h}
        className={`hour-col ${isDayStart ? 'day-start' : ''} ${nonWorking ? 'night' : ''}`}
        style={{ left, width: PX_PER_HOUR }}
      />,
    );
    if (isHeader && isDayStart) {
      cols.push(
        <div key={`tick-${h}`} className="day-tick" style={{ left: left + 4 }}>{fmtHour(h)}</div>,
      );
    }
  }
  return (
    <>
      <div className="now-line" style={{ left: 0 }} />
      {cols}
      <div style={{ position: 'absolute', width: WINDOW_HOURS * PX_PER_HOUR, height: 1 }} />
    </>
  );
}

function OpBlocks({ op, color, onClick }: { op: ScheduledOperation; color?: string; onClick: () => void }) {
  const isUrgent = op.priority === 'URGENT';
  const segs = op.segments.length ? op.segments : [{ start: op.start, end: op.end }];

  return (
    <>
      {segs.map((seg, i) => {
        const left = seg.start * PX_PER_HOUR;
        const width = Math.max((seg.end - seg.start) * PX_PER_HOUR - (segs.length > 1 ? 2 : 3), 10);
        const isFirst = i === 0;
        return (
          <div
            key={i}
            className={`op-block ${isUrgent ? 'urgent' : ''} ${op.pinned ? 'pinned' : ''}`}
            style={{
              left, width,
              ...(isUrgent ? {} : { background: `${color}22`, borderColor: `${color}88`, color }),
            }}
            onClick={onClick}
            title={op.pinned ? 'Закреплено вручную' : 'Клик — закрепить/открыть детали'}
          >
            {op.pinned && isFirst && <span className="pin-mark">📌</span>}
            <div className="oname">{isFirst ? op.name : `⋯ ${op.name}`}</div>
            {isFirst && <div className="odur">{op.durationHours}ч · {fmtHour(op.start)}</div>}
          </div>
        );
      })}
    </>
  );
}
