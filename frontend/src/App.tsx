import { useAuth } from './context/AuthContext';
import { LoginView } from './views/LoginView';
import { Shell } from './components/Shell';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-state">Проверяю авторизацию…</div>;
  }
  if (!user) {
    return <LoginView />;
  }
  return <Shell />;
}
