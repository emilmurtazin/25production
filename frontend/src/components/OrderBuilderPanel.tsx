import { useState } from 'react';
import type { CatalogOperation, Product, Priority } from '../api/types';
import { createOrder } from '../api/endpoints';

interface ProductLine { productId: string; qty: number; }
interface AdHocItem { catalogOperationId: string; qty: number; }

interface Props {
  catalog: CatalogOperation[];
  products: Product[];
  onClose: () => void;
  onCreated: () => void;
}

function defaultDeadline(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function OrderBuilderPanel({ catalog, products, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [deadlineDate, setDeadlineDate] = useState(defaultDeadline());
  const [priority, setPriority] = useState<Priority>('NORMAL');

  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [adHocItems, setAdHocItems] = useState<AdHocItem[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = new Map<string, CatalogOperation[]>();
  catalog.forEach((c) => {
    const list = grouped.get(c.node) ?? [];
    list.push(c);
    grouped.set(c.node, list);
  });

  function addProductLine() {
    if (!selectedProductId) return;
    setProductLines((prev) => {
      const existing = prev.find((p) => p.productId === selectedProductId);
      if (existing) return prev.map((p) => (p.productId === selectedProductId ? { ...p, qty: p.qty + 1 } : p));
      return [...prev, { productId: selectedProductId, qty: 1 }];
    });
  }
  function changeProductQty(id: string, delta: number) {
    setProductLines((prev) => prev.map((p) => (p.productId === id ? { ...p, qty: Math.max(1, p.qty + delta) } : p)));
  }
  function removeProductLine(id: string) {
    setProductLines((prev) => prev.filter((p) => p.productId !== id));
  }

  function addAdHocItem() {
    if (!selectedCatalogId) return;
    setAdHocItems((prev) => {
      const existing = prev.find((i) => i.catalogOperationId === selectedCatalogId);
      if (existing) return prev.map((i) => (i.catalogOperationId === selectedCatalogId ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { catalogOperationId: selectedCatalogId, qty: 1 }];
    });
  }
  function changeAdHocQty(id: string, delta: number) {
    setAdHocItems((prev) => prev.map((i) => (i.catalogOperationId === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)));
  }
  function removeAdHocItem(id: string) {
    setAdHocItems((prev) => prev.filter((i) => i.catalogOperationId !== id));
  }

  const totalHours = productLines.reduce((s, line) => {
    const product = products.find((p) => p.id === line.productId);
    return s + (product ? product.totalHours * line.qty : 0);
  }, 0) + adHocItems.reduce((s, it) => {
    const cat = catalog.find((c) => c.id === it.catalogOperationId);
    return s + (cat ? cat.normHours * it.qty : 0);
  }, 0);

  async function handleSubmit() {
    if (!client.trim()) { setError('Укажите клиента'); return; }
    if (!deadlineDate) { setError('Укажите срок сдачи'); return; }
    if (!productLines.length && !adHocItems.length) { setError('Добавьте хотя бы одно изделие или операцию'); return; }
    setBusy(true);
    setError(null);
    try {
      await createOrder({
        name: name || undefined,
        client: client.trim(),
        deadlineDate,
        priority,
        products: productLines.length ? productLines : undefined,
        items: adHocItems.length ? adHocItems : undefined,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать заказ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel accent">
      {error && <div className="login-error">{error}</div>}

      <div className="field-row">
        <input placeholder="Название заказа (авто, если пусто)" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Клиент" value={client} onChange={(e) => setClient(e.target.value)} />
        <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Срок сдачи
          <input type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} />
        </label>
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          <option value="NORMAL">Обычный приоритет</option>
          <option value="URGENT">Срочный</option>
        </select>
      </div>

      <div style={{ fontWeight: 600, fontSize: 13, margin: '14px 0 8px' }}>Изделия в заказе</div>
      <div className="field-row">
        <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} style={{ flex: 1 }}>
          <option value="">— выберите изделие —</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.totalHours} ч/шт)</option>)}
        </select>
        <button onClick={addProductLine}>+ Добавить изделие</button>
      </div>

      {productLines.length === 0 && <div className="hint" style={{ padding: '6px 0' }}>Изделия ещё не добавлены</div>}
      {productLines.map((line) => {
        const product = products.find((p) => p.id === line.productId);
        if (!product) return null;
        return (
          <div key={line.productId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
            <div style={{ flex: 1, fontSize: 13 }}>
              {product.name}
              <div className="hint" style={{ marginTop: 2 }}>{product.totalHours} ч/шт · {product.items.length} операций</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => changeProductQty(line.productId, -1)} style={{ padding: '2px 9px' }}>−</button>
              <span>{line.qty} шт</span>
              <button onClick={() => changeProductQty(line.productId, 1)} style={{ padding: '2px 9px' }}>+</button>
            </div>
            <div style={{ width: 80, textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--cyan)' }}>
              {(product.totalHours * line.qty).toFixed(1)} ч
            </div>
            <button className="icon-btn" onClick={() => removeProductLine(line.productId)}>✕</button>
          </div>
        );
      })}

      <button type="button" onClick={() => setAdvancedOpen((v) => !v)} style={{ marginTop: 14, fontSize: 12 }}>
        {advancedOpen ? '× Скрыть отдельные операции' : '+ Добавить отдельную операцию вручную (для нетиповых заказов)'}
      </button>

      {advancedOpen && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--grid-strong)' }}>
          <div className="field-row">
            <select value={selectedCatalogId} onChange={(e) => setSelectedCatalogId(e.target.value)} style={{ flex: 1 }}>
              <option value="">— выберите операцию —</option>
              {Array.from(grouped.entries()).map(([node, ops]) => (
                <optgroup key={node} label={node}>
                  {ops.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.normHours} ч)</option>)}
                </optgroup>
              ))}
            </select>
            <button onClick={addAdHocItem}>+ Добавить операцию</button>
          </div>
          {adHocItems.map((it) => {
            const cat = catalog.find((c) => c.id === it.catalogOperationId);
            if (!cat) return null;
            return (
              <div key={it.catalogOperationId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 0' }}>
                <div style={{ flex: 1, fontSize: 12.5 }}>{cat.name}</div>
                <button onClick={() => changeAdHocQty(it.catalogOperationId, -1)} style={{ padding: '2px 9px' }}>−</button>
                <span>{it.qty}</span>
                <button onClick={() => changeAdHocQty(it.catalogOperationId, 1)} style={{ padding: '2px 9px' }}>+</button>
                <span className="hint">{(cat.normHours * it.qty).toFixed(2)} ч</span>
                <button className="icon-btn" onClick={() => removeAdHocItem(it.catalogOperationId)}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--grid-strong)' }}>
        <div>Итого трудозатрат: <b style={{ color: 'var(--amber)', fontFamily: 'IBM Plex Mono, monospace' }}>{totalHours.toFixed(2)} ч</b></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose}>Отмена</button>
          <button className="primary" onClick={handleSubmit} disabled={busy}>Создать заказ</button>
        </div>
      </div>
    </div>
  );
}
