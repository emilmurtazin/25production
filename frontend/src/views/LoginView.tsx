import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export function LoginView() {
  const { login } = useAuth();
  const [email, setEmail] = useState('dispatcher@example.com');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="title-block">
          <span className="eyebrow">MVP · APS-планировщик</span>
        </div>
        <h1>Вход в систему</h1>
        <p>Диспетчер, нормировщик, мастер цеха или администратор — доступ зависит от роли.</p>
        {error && <div className="login-error">{error}</div>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="primary" style={{ width: '100%' }} disabled={submitting}>
          {submitting ? 'Вхожу…' : 'Войти'}
        </button>
        <p style={{ marginTop: 14, marginBottom: 0 }}>
          Демо-пользователи (см. README backend): dispatcher@example.com, normirovshik@example.com,
          master1@example.com, admin@example.com — пароль задаётся при сидировании БД.
        </p>
      </form>
    </div>
  );
}
