import { useEffect, useState } from 'react';
import type { AnalyticsOverview } from '../api/types';
import { fetchAnalyticsOverview } from '../api/endpoints';

export function AnalyticsView() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setData(await fetchAnalyticsOverview());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить аналитику');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="loading-state">Считаю аналитику…</div>;
  if (!data) return <div className="error-banner">{error ?? 'Нет данных'}</div>;

  const atRiskProjects = data.projects.filter((p) => p.atRisk);
  const okProjects = data.projects.filter((p) => !p.atRisk);

  return (
    <div>
      <div className="header">
        <div className="title-block">
          <span className="eyebrow">MVP · Аналитика</span>
          <h1>Загрузка, сроки, эффективность</h1>
          <p>Прогноз завершения проектов считается тем же алгоритмом, что и график — это не отдельная догадка, а прямое следствие текущего плана.</p>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="val">{data.totals.activeProjects}</div><div className="lbl">проектов</div></div>
          <div className={`kpi ${data.totals.atRiskProjects > 0 ? 'warn' : 'good'}`}><div className="val">{data.totals.atRiskProjects}</div><div className="lbl">под угрозой срыва</div></div>
          <div className="kpi"><div className="val">{data.totals.totalRemainingHours}</div><div className="lbl">часов осталось</div></div>
          <div className="kpi good"><div className="val">{data.totals.overallCompletionPercent}%</div><div className="lbl">выполнено всего</div></div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      <button onClick={load} style={{ marginBottom: 16 }}>↻ Обновить</button>

      {/* ---- Срывы сроков ---- */}
      <div className="panel" style={atRiskProjects.length ? { borderColor: 'var(--rose)' } : undefined}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Сроки проектов</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Проект</th><th>Клиент</th>
              <th className="num">Срок, ч</th><th className="num">Прогноз, ч</th>
              <th className="num">Отставание</th><th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {[...atRiskProjects, ...okProjects].map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.client}</td>
                <td className="num">{p.deadlineHours}</td>
                <td className="num">{p.projectedCompletionHours ?? '—'}</td>
                <td className="num" style={{ color: p.atRisk ? 'var(--rose)' : undefined }}>
                  {p.atRisk ? `+${p.overdueByHours} ч` : '—'}
                </td>
                <td>
                  {p.projectedCompletionHours === null
                    ? <span className="hint">выполнен / нет заказов</span>
                    : p.atRisk
                      ? <span style={{ color: 'var(--rose)' }}>⚠ риск срыва</span>
                      : <span style={{ color: 'var(--green)' }}>в графике</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Загрузка цехов ---- */}
      <div className="panel">
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Загрузка цехов (окно {data.windowHours / 24} дней)</div>
        {data.shops.map((s) => (
          <div key={s.id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
              <span>{s.name}</span>
              <span className="hint">{s.totalRemainingHours} ч осталось · {s.overloadedResources > 0 ? `${s.overloadedResources} участок(ов) перегружено` : 'без перегрузок'}</span>
            </div>
            <div className="load" style={{ height: 8 }}>
              <div className="load-fill" style={{ width: `${Math.min(100, s.utilizationPercent)}%`, background: s.utilizationPercent > 85 ? 'var(--rose)' : 'var(--cyan)' }} />
            </div>
            <div className="hint" style={{ marginTop: 2 }}>{s.utilizationPercent}% загрузки</div>
          </div>
        ))}
      </div>

      {/* ---- Загрузка по участкам ---- */}
      <div className="panel">
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Загрузка по участкам</div>
        <table className="data-table">
          <thead>
            <tr><th>Участок</th><th>Цех</th><th className="num">Осталось, ч</th><th className="num">Фонд, ч</th><th className="num">Загрузка</th></tr>
          </thead>
          <tbody>
            {data.resources.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.shopName}</td>
                <td className="num">{r.remainingHours}</td>
                <td className="num">{r.availableHours}</td>
                <td className="num" style={{ color: r.overloaded ? 'var(--rose)' : undefined }}>{r.utilizationPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---- Эффективность работников ---- */}
      <div className="panel">
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Работники — план vs факт</div>
        <div className="hint" style={{ marginBottom: 10 }}>За период {data.reportPeriod.from} — {data.reportPeriod.to}</div>
        {data.workers.length ? (
          <table className="data-table">
            <thead>
              <tr><th>Работник</th><th className="num">Разряд</th><th className="num">План, ч</th><th className="num">Факт, ч</th><th className="num">Эффективность</th><th className="num">Отчитано</th></tr>
            </thead>
            <tbody>
              {data.workers.map((w) => (
                <tr key={w.workerId}>
                  <td>{w.name}</td>
                  <td className="num">{w.grade}</td>
                  <td className="num">{w.plannedHours}</td>
                  <td className="num">{w.actualHours}</td>
                  <td className="num" style={{ color: w.efficiencyPercent !== null && w.efficiencyPercent < 80 ? 'var(--rose)' : undefined }}>
                    {w.efficiencyPercent !== null ? `${w.efficiencyPercent}%` : '—'}
                  </td>
                  <td className="num">{w.reportRatePercent !== null ? `${w.reportRatePercent}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="hint">За этот период нарядов ещё не было — сформируйте наряды на вкладке «Работники и наряды»</span>
        )}
      </div>

      <div className="footer-note">
        <b>Как считается:</b> «Прогноз» — это самая поздняя точка окончания среди ещё не выполненных операций
        заказов проекта в текущем графике (тот же расчёт, что использует доска планирования). «Загрузка» —
        отношение оставшихся часов к фонду рабочего времени участка/цеха за ближайшую неделю с учётом календаря
        смен. «Эффективность» работника — факт делить на план по нарядам за последние 7 календарных дней;
        «отчитано» — доля позиций наряда, по которым вообще был подан отчёт (остальное — либо ещё не сделано,
        либо забыли отчитаться).
      </div>
    </div>
  );
}
