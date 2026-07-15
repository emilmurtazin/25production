import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { WorkersBoardView } from '../views/WorkersBoardView';
import { OrdersView } from '../views/OrdersView';
import { CatalogView } from '../views/CatalogView';
import { AnalyticsView } from '../views/AnalyticsView';

type Tab = 'board' | 'orders' | 'catalog' | 'analytics';

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
          👷 Кто чем загружен
        </button>
        <button className={`tab-btn ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
          📋 Заказы
        </button>
        <button className={`tab-btn ${tab === 'catalog' ? 'active' : ''}`} onClick={() => setTab('catalog')}>
          📖 Справочник и изделия
        </button>
        <button className={`tab-btn ${tab === 'analytics' ? 'active' : ''}`} onClick={() => setTab('analytics')}>
          📊 Аналитика
        </button>
      </div>

      {tab === 'board' && <WorkersBoardView />}
      {tab === 'orders' && <OrdersView />}
      {tab === 'catalog' && <CatalogView />}
      {tab === 'analytics' && <AnalyticsView />}
    </div>
  );
}
