import { useEffect, useState } from 'react';
import type { Order, CatalogOperation, Product } from '../api/types';
import { fetchOrders, deleteOrder, fetchCatalog, fetchProducts, createUrgentOrder } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { OrderBuilderPanel } from '../components/OrderBuilderPanel';

export function OrdersView() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'DISPATCHER';

  const [orders, setOrders] = useState<Order[]>([]);
  const [catalog, setCatalog] = useState<CatalogOperation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [urgentBusy, setUrgentBusy] = useState(false);

  async function load() {
    try {
      const [o, c, p] = await Promise.all([fetchOrders(), fetchCatalog(), fetchProducts()]);
      setOrders(o);
      setCatalog(c);
      setProducts(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleUrgent() {
    setUrgentBusy(true);
    try { await createUrgentOrder(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось создать срочный заказ'); }
    finally { setUrgentBusy(false); }
  }

  async function handleDelete(id: string) {
    try { await deleteOrder(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось удалить заказ'); }
  }

  if (loading) return <div className="loading-state">Загружаю заказы…</div>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="header">
        <div className="title-block">
          <span className="eyebrow">MVP · Заказы</span>
          <h1>Заказы</h1>
          <p>Один заказ = один клиент, один срок сдачи. Состав — изделия с количеством, при необходимости — отдельные операции вручную.</p>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="val">{orders.length}</div><div className="lbl">заказов</div></div>
          <div className="kpi"><div className="val">{products.length}</div><div className="lbl">изделий в справочнике</div></div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {canManage && (
        <div className="toolbar">
          <button className="primary" onClick={() => setBuilderOpen((v) => !v)}>
            {builderOpen ? '× Закрыть' : '+ Новый заказ'}
          </button>
          <button onClick={handleUrgent} disabled={urgentBusy}>+ Срочный заказ (авто)</button>
        </div>
      )}

      {builderOpen && (
        <OrderBuilderPanel catalog={catalog} products={products} onClose={() => setBuilderOpen(false)} onCreated={load} />
      )}

      <div className="board">
        <table className="data-table">
          <thead>
            <tr>
              <th>Заказ</th><th>Клиент</th><th className="num">Срок сдачи</th>
              <th>Приоритет</th><th className="num">Операций</th><th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td>{o.client}</td>
                <td className="num" style={{ color: o.deadlineDate < today ? 'var(--rose)' : undefined }}>{o.deadlineDate}</td>
                <td>{o.priority === 'URGENT' ? <span className="chip urgent">срочный</span> : <span className="hint">обычный</span>}</td>
                <td className="num">{o.operations.length}</td>
                <td>{canManage && <button className="icon-btn" onClick={() => handleDelete(o.id)}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && <div style={{ padding: 16 }}><span className="hint">Заказов пока нет</span></div>}
      </div>

      <div className="footer-note">
        <b>Как это работает:</b> изделие в заказе умножает весь свой набор операций на указанное количество —
        например, «Турникет базовый × 3» превращается в 3-кратный объём каждой операции этого изделия.
        Отдельные операции вручную — для случаев, когда типового изделия не существует.
      </div>
    </div>
  );
}
