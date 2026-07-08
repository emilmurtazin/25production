import { useState } from 'react';
import type { CatalogOperation, Modification, Project, Priority } from '../api/types';
import { createOrder } from '../api/endpoints';

interface BuilderItem { catalogOperationId: string; qty: number; }

interface Props {
  catalog: CatalogOperation[];
  modifications: Modification[];
  projects: Project[];
  onClose: () => void;
  onCreated: () => void;
}

export function OrderBuilderPanel({ catalog, modifications, projects, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = new Map<string, CatalogOperation[]>();
  catalog.forEach((c) => {
    const list = grouped.get(c.node) ?? [];
    list.push(c);
    grouped.set(c.node, list);
  });

  function addItem() {
    if (!selectedCatalogId) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.catalogOperationId === selectedCatalogId);
      if (existing) {
        return prev.map((i) => (i.catalogOperationId === selectedCatalogId ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { catalogOperationId: selectedCatalogId, qty: 1 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setItems((prev) => prev.map((i) => (i.catalogOperationId === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.catalogOperationId !== id));
  }

  function loadModification(mod: Modification) {
    setItems(mod.items.map((it) => ({ catalogOperationId: it.catalogOperationId, qty: it.qty })));
    if (!name) setName(mod.name);
  }

  const totalHours = items.reduce((s, it) => {
    const cat = catalog.find((c) => c.id === it.catalogOperationId);
    return s + (cat ? cat.normHours * it.qty : 0);
  }, 0);

  async function handleSubmit() {
    if (!projectId) { setError('Выберите проект'); return; }
    if (!items.length) { setError('Добавьте хотя бы одну операцию'); return; }
    setBusy(true);
    setError(null);
    try {
      await createOrder({ name: name || undefined, projectId, priority, items });
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
      {modifications.length > 0 && (
        <div className="field-row" style={{ borderBottom: '1px solid var(--grid)', paddingBottom: 12 }}>
          <span className="hint">Загрузить шаблон:</span>
          {modifications.map((m) => (
            <button key={m.id} onClick={() => loadModification(m)} style={{ flex: '0 0 auto' }}>
              {m.name} <span className="hint" style={{ color: 'var(--cyan)' }}>{m.totalHours} ч</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="login-error">{error}</div>}

      <div className="field-row">
        <input placeholder="Название заказа (авто, если пусто)" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">— выберите проект —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.client})</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          <option value="NORMAL">Обычный приоритет</option>
          <option value="URGENT">Срочный</option>
        </select>
      </div>

      <div className="field-row">
        <select value={selectedCatalogId} onChange={(e) => setSelectedCatalogId(e.target.value)} style={{ flex: 1 }}>
          <option value="">— выберите операцию —</option>
          {Array.from(grouped.entries()).map(([node, ops]) => (
            <optgroup key={node} label={node}>
              {ops.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.normHours} ч)</option>)}
            </optgroup>
          ))}
        </select>
        <button onClick={addItem}>+ Добавить операцию</button>
      </div>

      <div style={{ borderTop: '1px solid var(--grid)', paddingTop: 8 }}>
        {items.length === 0 && <div className="hint">Операции ещё не добавлены</div>}
        {items.map((it) => {
          const cat = catalog.find((c) => c.id === it.catalogOperationId);
          if (!cat) return null;
          return (
            <div key={it.catalogOperationId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
              <div style={{ flex: 1, fontSize: 13 }}>
                {cat.name}
                <div className="hint" style={{ marginTop: 2 }}>{cat.normHours} ч/шт</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => changeQty(it.catalogOperationId, -1)} style={{ padding: '2px 9px' }}>−</button>
                <span>{it.qty}</span>
                <button onClick={() => changeQty(it.catalogOperationId, 1)} style={{ padding: '2px 9px' }}>+</button>
              </div>
              <div style={{ width: 70, textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--cyan)' }}>
                {(cat.normHours * it.qty).toFixed(2)} ч
              </div>
              <button className="icon-btn" onClick={() => removeItem(it.catalogOperationId)}>✕</button>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grid-strong)' }}>
        <div>Итого трудозатрат: <b style={{ color: 'var(--amber)', fontFamily: 'IBM Plex Mono, monospace' }}>{totalHours.toFixed(2)} ч</b></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose}>Отмена</button>
          <button className="primary" onClick={handleSubmit} disabled={busy}>Создать заказ и добавить в план</button>
        </div>
      </div>
    </div>
  );
}
