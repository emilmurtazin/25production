import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { BoardView } from '../views/BoardView';
import { ProjectsView } from '../views/ProjectsView';
import { CatalogView } from '../views/CatalogView';
import { WorkOrdersView } from '../views/WorkOrdersView';
import { AnalyticsView } from '../views/AnalyticsView';

type Tab = 'board' | 'projects' | 'catalog' | 'workOrders' | 'analytics';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Администратор',
  DISPATCHER: 'Диспетчер',
  NORMIROVSHIK: 'Нормировщик',
  SHOP_MASTER: 'Мастер цеха',
};

export function Shell() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('board');

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="eyebrow">MVP · APS-планировщик</span>
          Планирование производства
        </div>
        <div className="user-box">
          <span className="role-badge">{ROLE_LABELS[user!.role] ?? user!.role}</span>
          <span>{user!.name}</span>
          <button onClick={logout}>Выйти</button>
        </div>
      </div>

      <div className="tabbar">
        <button className={`tab-btn ${tab === 'board' ? 'active' : ''}`} onClick={() => setTab('board')}>
          📅 График загрузки
        </button>
        <button className={`tab-btn ${tab === 'projects' ? 'active' : ''}`} onClick={() => setTab('projects')}>
          📁 Проекты
        </button>
        <button className={`tab-btn ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>
          📖 Справочник операций
        </button>
        <button className={`tab-btn ${tab === 'workOrders' ? 'active' : ''}`} onClick={() => setTab('workOrders')}>
          👷 Работники и наряды
        </button>
        <button className={`tab-btn ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>
          📊 Аналитика
        </button>
      </div>

      {tab === 'board' && <BoardView />}
      {tab === 'projects' && <ProjectsView />}
      {tab === 'catalog' && <CatalogView />}
      {tab === 'workOrders' && <WorkOrdersView />}
      {tab === 'analytics' && <AnalyticsView />}
    </div>
  );
}
