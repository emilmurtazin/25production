import { useEffect, useState, type FormEvent } from 'react';
import type { Project } from '../api/types';
import { fetchProjects, createProject, updateProject, deleteProject } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export function ProjectsView() {
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'DISPATCHER';

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [object, setObject] = useState('');
  const [deadline, setDeadline] = useState(96);

  async function load() {
    try {
      setProjects(await fetchProjects());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить проекты');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !client.trim()) return;
    try {
      await createProject({ name: name.trim(), client: client.trim(), object: object.trim() || '—', deadlineHours: deadline });
      setName(''); setClient(''); setObject(''); setDeadline(96);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать проект');
    }
  }

  async function handleDeadlineChange(id: string, value: string) {
    try { await updateProject(id, { deadlineHours: Number(value) }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось обновить срок'); }
  }

  async function handleDelete(id: string) {
    try { await deleteProject(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось удалить проект'); }
  }

  if (loading) return <div className="loading-state">Загружаю проекты…</div>;

  return (
    <div>
      <div className="header">
        <div className="title-block">
          <span className="eyebrow">MVP · Проекты</span>
          <h1>Проекты</h1>
          <p>Заказы группируются в проект под одного клиента/объекта с общим сроком сдачи.</p>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="val">{projects.length}</div><div className="lbl">проектов</div></div>
          <div className="kpi"><div className="val">{projects.reduce((s, p) => s + (p.orders?.length ?? 0), 0)}</div><div className="lbl">заказов всего</div></div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="board">
        <table className="data-table">
          <thead>
            <tr>
              <th>Проект</th><th>Клиент</th><th>Объект</th>
              <th className="num">Срок, ч</th><th className="num">Заказов</th><th />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b></td>
                <td>{p.client}</td>
                <td>{p.object}</td>
                <td className="num">
                  <input
                    type="number" min={1} defaultValue={p.deadlineHours} disabled={!canEdit}
                    style={{ width: 64 }}
                    onBlur={(e) => e.target.value !== String(p.deadlineHours) && handleDeadlineChange(p.id, e.target.value)}
                  />
                </td>
                <td className="num">{p.orders?.length ?? 0}</td>
                <td>{canEdit && <button className="icon-btn" onClick={() => handleDelete(p.id)}>✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {canEdit && (
          <form className="field-row" style={{ padding: 14, background: 'var(--surface-2)' }} onSubmit={handleCreate}>
            <input placeholder="Название проекта" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 160px' }} />
            <input placeholder="Клиент" value={client} onChange={(e) => setClient(e.target.value)} style={{ flex: '1 1 160px' }} />
            <input placeholder="Объект" value={object} onChange={(e) => setObject(e.target.value)} style={{ flex: '1 1 160px' }} />
            <input type="number" min={1} placeholder="Срок, ч" value={deadline} onChange={(e) => setDeadline(Number(e.target.value))} style={{ flex: '0 1 100px' }} />
            <button type="submit" className="primary">+ Добавить проект</button>
          </form>
        )}
      </div>

      <div className="footer-note">
        <b>Как это работает:</b> проект — это клиент, объект и общий срок сдачи. Заказы, созданные из конструктора на графике,
        выбирают проект из списка и наследуют его срок для сортировки приоритетов.
      </div>
    </div>
  );
}
