import { TrendingUp } from "lucide-react";
import { useApp } from "../context";
import type { Attempt } from "../types";
export default function ActivityChart({
  attempts,
}: { attempts?: Attempt[] } = {}) {
  const { data } = useApp();
  const activity = attempts ?? data.attempts;
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 13 + i);
    return {
      key: d.toLocaleDateString("sv-SE"),
      label: d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }),
      count: 0,
      correct: 0,
    };
  });
  activity.forEach((a) => {
    const day = days.find(
      (d) => d.key === new Date(a.created_at).toLocaleDateString("sv-SE"),
    );
    if (day) {
      day.count++;
      if (a.status === "correct") day.correct++;
    }
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <section className="panel activity-panel">
      <div className="spread">
        <div>
          <h2>Ритм обучения</h2>
          <p className="muted">Попытки решения за последние 14 дней</p>
        </div>
        <span className="chart-legend">
          <i />
          Верные
          <span className="legend-total" />
          Остальные
        </span>
      </div>
      {activity.length ? (
        <>
          <div
            className="activity-chart"
            role="img"
            aria-label="Количество попыток по дням"
          >
            <div className="chart-axis">
              <span>{max}</span>
              <span>{Math.round(max / 2)}</span>
              <span>0</span>
            </div>
            <div className="chart-columns">
              {days.map((d, i) => (
                <div
                  className="chart-column"
                  key={d.key}
                  title={`${d.label}: ${d.count} попыток, ${d.correct} верных`}
                >
                  <div className="chart-bar-area">
                    <div
                      className="chart-bar"
                      style={{ height: `${(d.count / max) * 100}%` }}
                    >
                      <i
                        style={{
                          height: `${d.count ? (d.correct / d.count) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <small>{i % 3 === 0 || i === 13 ? d.label : ""}</small>
                </div>
              ))}
            </div>
          </div>
          <details className="chart-data">
            <summary>Данные графика</summary>
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Попытки</th>
                  <th>Верные</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.key}>
                    <td>{d.label}</td>
                    <td>{d.count}</td>
                    <td>{d.correct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : (
        <div className="chart-empty">
          <TrendingUp size={30} />
          <strong>У каждой привычки есть начало</strong>
          <p>График появится после первого отправленного ответа.</p>
        </div>
      )}
    </section>
  );
}
