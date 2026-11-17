import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Target,
  CheckCircle2,
  TrendingUp,
  Clock3,
  FileText,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { useApp } from "../context";
import { formatDate } from "../lib/api";
import { type Attempt } from "../types";
import { Empty } from "../components/ui";
import ActivityChart from "../components/ActivityChart";
import ReviewModal from "../components/ReviewModal";
import { ModuleCard } from "./Catalog";
import HomeworkHighlights from "../components/HomeworkHighlights";
import TeacherOverview from "../components/TeacherOverview";
function StudentMetrics() {
  const { data } = useApp();
  const graded = data.attempts.filter((a) => a.status !== "pending"),
    correct = graded.filter((a) => a.status === "correct");
  const complete = data.progress.filter((p) => p.completed_at).length;
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
      value: data.topics.filter((t) => {
        const modules = data.modules.filter((m) => m.topic_id === t.id);
        return (
          modules.length > 0 &&
          modules.every((m) =>
            data.progress.some((p) => p.module_id === m.id && p.completed_at),
          )
        );
      }).length,
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
  const name = data.profile.display_name.includes("@")
    ? ""
    : data.profile.display_name.split(" ")[0];
  return (
    <div className={teacher ? "teacher-dashboard" : undefined}>
      <div
        className={`page-heading ${teacher ? "teacher-dashboard-date" : ""}`}
      >
        {!teacher && (
          <div>
            <span className="eyebrow">Ваше пространство роста</span>
            <h1>
              {name ? `С возвращением, ${name}` : "С возвращением"}
              <span className="title-dot">.</span>
            </h1>
            <p>Небольшой шаг сегодня — уверенность на экзамене.</p>
          </div>
        )}
        <span className="today">
          {new Date().toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            weekday: "long",
          })}
        </span>
      </div>
      <div
        className={`welcome-banner ${teacher ? "teacher-welcome-banner" : ""}`}
      >
        <div>
          <span className="banner-label">
            <Sparkles size={14} />
            BARKALOO TUTOR
          </span>
          <h2>
            {teacher
              ? "Знания обретают структуру."
              : "Готовиться проще, когда есть путь."}
          </h2>
          {!teacher && (
            <>
              <p>
                {continued
                  ? `Продолжите модуль «${continued.m!.title}» с места, где остановились.`
                  : "Открывайте темы, разбирайтесь в теории и закрепляйте её на практике."}
              </p>
              <button
                className="btn banner-button"
                onClick={() =>
                  navigate(continued ? `lesson/${continued.m!.id}` : "catalog")
                }
              >
                {continued ? "Продолжить обучение" : "Открыть каталог"}
                <ArrowRight size={17} />
              </button>
            </>
          )}
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-card art-back">
            <span>ЕГЭ</span>
            <div />
            <div />
          </div>
          <div className="art-card art-front">
            <span>&lt;/&gt;</span>
            <i />
            <i />
            <b>
              <CheckCircle2 size={22} />
            </b>
          </div>
          <span className="art-plus">+</span>
        </div>
      </div>
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
                <Clock3 size={18} />
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
                  <FileText size={26} />
                  <p>Здесь появятся ваши первые решения.</p>
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
              <span className="eyebrow">Следующий шаг</span>
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
            <Empty
              title="Библиотека пока пуста"
              action="Перейти в каталог"
              onAction={() => navigate("catalog")}
            >
              Как только преподаватель опубликует материалы, вы сможете начать
              обучение.
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
  const { data, teacher, navigate } = useApp();
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
          <span className="eyebrow">За цифрами — ваша работа</span>
          <h1>Статистика</h1>
          <p>
            {teacher
              ? "Результаты учеников на основе сохранённых попыток."
              : "Следите за прогрессом и выбирайте, что стоит повторить."}
          </p>
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
          {teacher && (
            <p className="muted">
              Завершение модулей учеников появится на этапе управления
              учениками. Здесь отображается ваш личный прогресс.
            </p>
          )}
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
              <CheckCircle2 size={27} />
              <p>
                Пока нет тем с ошибками. Статистика появится после практики.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
