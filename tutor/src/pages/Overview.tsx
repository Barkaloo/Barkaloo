import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Target,
  CheckCircle2,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../context";
import { formatDate } from "../lib/api";
import { type Attempt } from "../types";
import { Empty } from "../components/ui";
import ActivityChart from "../components/ActivityChart";
import ReviewModal from "../components/ReviewModal";
import { ModuleCard } from "../components/ModuleCard";
import HomeworkHighlights from "../components/HomeworkHighlights";
import TeacherOverview from "../components/TeacherOverview";
function StudentMetrics() {
  const { data } = useApp();
  const graded = data.attempts.filter((a) => a.status !== "pending"),
    correct = graded.filter((a) => a.status === "correct");
  const completedProgress = data.progress.filter((p) => p.completed_at);
  const complete = completedProgress.length;
  const completedModuleIds = new Set(completedProgress.map((p) => p.module_id));
  const topicsWithModules = new Set<string>();
  const topicsWithIncompleteModules = new Set<string>();
  for (const module of data.modules) {
    topicsWithModules.add(module.topic_id);
    if (!completedModuleIds.has(module.id)) {
      topicsWithIncompleteModules.add(module.topic_id);
    }
  }
  const cards = [
    {
      label: "Изучено модулей",
      value: complete,
      icon: BookOpen,
      detail: `Из ${data.modules.length} доступных`,
    },
    {
      label: "Решено заданий",
      value: new Set(correct.map((a) => a.task_id)).size,
      icon: Target,
      detail: "Уникальных верных решений",
    },
    {
      label: "Правильных ответов",
      value: graded.length
        ? `${Math.round((correct.length / graded.length) * 100)}%`
        : "—",
      icon: CheckCircle2,
      detail: graded.length
        ? `${correct.length} из ${graded.length} попыток`
        : "Пока нет проверенных попыток",
    },
    {
      label: "Завершено тем",
      value: data.topics.filter(
        (t) => topicsWithModules.has(t.id) && !topicsWithIncompleteModules.has(t.id),
      ).length,
      icon: TrendingUp,
      detail: `Из ${data.topics.length} доступных`,
    },
  ];
  return (
    <div className="metrics-grid">
      {cards.map(({ label, value, icon: Icon, detail }) => (
        <div className="metric panel" key={label}>
          <div className="spread">
            <span>{label}</span>
            <Icon size={18} />
          </div>
          <strong>{value}</strong>
          <small>{detail}</small>
        </div>
      ))}
    </div>
  );
}
export function Dashboard() {
  const { data, teacher, navigate } = useApp();
  const [review, setReview] = useState<Attempt | null>(null);
  const continued = data.progress
    .map((p) => ({ p, m: data.modules.find((m) => m.id === p.module_id) }))
    .filter((x) => x.m && !x.p.completed_at)
    .sort((a, b) => b.p.updated_at.localeCompare(a.p.updated_at))[0];
  return (
    <div className={teacher ? "teacher-dashboard" : undefined}>
      <div className="page-heading">
        <h1>Главная</h1>
        <span className="today">
          {new Date().toLocaleDateString("ru-RU", {
            day: "numeric", month: "long", weekday: "long",
          })}
        </span>
      </div>
      {!teacher && (
        <section className="continue-learning">
          <div>
            <span className="muted">{continued ? "Продолжить изучение" : "Учебные материалы"}</span>
            <h2>{continued ? continued.m!.title : "Каталог ЕГЭ"}</h2>
          </div>
          <button className="btn primary" onClick={() => navigate(continued ? `lesson/${continued.m!.id}` : "catalog")}>
            {continued ? "Продолжить" : "Открыть каталог"}<ArrowRight size={16} />
          </button>
        </section>
      )}
      {teacher ? (
        <TeacherOverview onReview={setReview} />
      ) : (
        <>
          <StudentMetrics />
          <HomeworkHighlights />
          <div className="dashboard-columns">
            <ActivityChart />
            <section className="panel recent-panel">
              <div className="spread">
                <h2>Последняя активность</h2>
              </div>
              {data.attempts.length ? (
                <div className="recent-list">
                  {data.attempts.slice(0, 5).map((a) => (
                    <div key={a.id}>
                      <span className={`result-dot ${a.status}`} />
                      <div>
                        <strong>{a.task_snapshot.title}</strong>
                        <small>
                          {formatDate(a.created_at)} ·{" "}
                          {a.status === "correct"
                            ? "Верно"
                            : a.status === "wrong"
                              ? "Ошибка"
                              : "На проверке"}
                        </small>
                      </div>
                      {data.tasks.some((t) => t.id === a.task_id) && (
                        <button
                          className="icon-btn"
                          aria-label="Открыть задание"
                          onClick={() => navigate(`practice/${a.task_id}`)}
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="compact-empty">
                  <p>Попыток пока нет.</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {!teacher && (
        <>
          <div className="section-heading">
            <div>
              <h2>Доступные модули</h2>
            </div>
            <button className="text-btn" onClick={() => navigate("modules")}>
              Все модули
              <ArrowRight size={16} />
            </button>
          </div>
          {data.modules.length ? (
            <div className="module-grid">
              {data.modules.slice(0, 3).map((m) => (
                <ModuleCard module={m} key={m.id} />
              ))}
            </div>
          ) : (
            <Empty title="Модулей пока нет">
              Материалы появятся после публикации преподавателем.
            </Empty>
          )}
        </>
      )}
      {review && (
        <ReviewModal attempt={review} onClose={() => setReview(null)} />
      )}
    </div>
  );
}
export function Statistics() {
  const { data, navigate } = useApp();
  const problematic = data.topics
    .map((t) => {
      const attempts = data.attempts.filter(
        (a) => a.topic_id === t.id && a.status !== "pending",
      );
      return {
        t,
        count: attempts.length,
        wrong: attempts.filter((a) => a.status === "wrong").length,
      };
    })
    .filter((t) => t.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Статистика</h1>
        </div>
      </div>
      <StudentMetrics />
      <ActivityChart />
      <div className="dashboard-columns stats-lower">
        <section className="panel">
          <h2>Подготовка по разделам ЕГЭ</h2>
          <p className="muted">Доля модулей, отмеченных как изученные</p>
          <div className="ege-progress">
            {data.sections.map((s) => {
              const mids = data.modules
                .filter((m) =>
                  data.topics.some(
                    (t) => t.id === m.topic_id && t.section_id === s.id,
                  ),
                )
                .map((m) => m.id);
              const done = data.progress.filter(
                (p) => mids.includes(p.module_id) && p.completed_at,
              ).length;
              return (
                <button
                  key={s.id}
                  title={`${s.title}: ${done} из ${mids.length} модулей`}
                  onClick={() => navigate(`section/${s.id}`)}
                  className={
                    done && done === mids.length
                      ? "complete"
                      : done
                        ? "partial"
                        : ""
                  }
                >
                  <span>{s.number}</span>
                  <small>{mids.length ? `${done}/${mids.length}` : "—"}</small>
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <h2>Темы для повторения</h2>
          <p className="muted">Ошибки за всё время, включая исправленные</p>
          {problematic.length ? (
            problematic.map(({ t, count, wrong }) => (
              <button
                className="problem-row"
                key={t.id}
                onClick={() => navigate(`section/${t.section_id}`)}
              >
                <span>{t.title}</span>
                <strong>
                  {wrong} из {count}
                </strong>
                <i style={{ width: `${(100 * wrong) / count}%` }} />
              </button>
            ))
          ) : (
            <div className="compact-empty">
              <p>Тем с ошибками пока нет.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
