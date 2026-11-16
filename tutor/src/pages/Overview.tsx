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
import { api, formatDate, answerLabel } from "../lib/api";
import { type Attempt } from "../types";
import { Empty, Modal, Field, Form, ErrorBox } from "../components/ui";
import { ModuleCard } from "./Catalog";
import HomeworkHighlights from "../components/HomeworkHighlights";
import { studentName } from "../lib/teaching";
export function Metrics() {
  const { data, teacher } = useApp();
  const graded = data.attempts.filter((a) => a.status !== "pending"),
    correct = graded.filter((a) => a.status === "correct");
  const complete = data.progress.filter((p) => p.completed_at).length;
  const cards = teacher
    ? [
        {
          label: "Активные ученики",
          value: data.students.filter((s) => s.status === "active").length,
          icon: BookOpen,
          detail: "Обучаются в вашем кабинете",
        },
        {
          label: "Домашние работы",
          value: data.homeworks.filter((h) => !h.canceled_at).length,
          icon: Target,
          detail: "Назначены вашим ученикам",
        },
        {
          label: "Учебные модули",
          value: data.modules.length,
          icon: BookOpen,
          detail: `${data.modules.filter((m) => m.published_at).length} опубликовано`,
        },
        {
          label: "Практические задания",
          value: data.tasks.length,
          icon: Target,
          detail: "В ваших модулях",
        },
        {
          label: "Ответы учеников",
          value: data.attempts.length,
          icon: CheckCircle2,
          detail: "Без попыток предпросмотра",
        },
        {
          label: "На проверке",
          value: data.review_queue.filter((a) => !a.is_preview).length,
          icon: Clock3,
          detail: "Ожидают вашего решения",
        },
      ]
    : [
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
                data.progress.some(
                  (p) => p.module_id === m.id && p.completed_at,
                ),
              )
            );
          }).length,
          icon: TrendingUp,
          detail: `Из ${data.topics.length} доступных`,
        },
      ];
  return (
    <div className={`metrics-grid ${teacher ? "teacher-metrics" : ""}`}>
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
export function ActivityChart({ attempts }: { attempts?: Attempt[] } = {}) {
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
    <>
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
      <Metrics />
      {!teacher && <HomeworkHighlights />}
      <div className="dashboard-columns">
        <ActivityChart />
        <section className="panel recent-panel">
          <div className="spread">
            <h2>{teacher ? "Последние результаты" : "Последняя активность"}</h2>
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
                  {!teacher && data.tasks.some((t) => t.id === a.task_id) && (
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
              <p>
                {teacher
                  ? "Результаты появятся, когда ученики начнут решать задания."
                  : "Здесь появятся ваши первые решения."}
              </p>
            </div>
          )}
        </section>
      </div>
      {teacher && data.review_queue.length > 0 && (
        <section className="panel review-queue">
          <div className="spread">
            <h2>Ответы для ручной проверки</h2>
            <span className="badge amber">{data.review_queue.length}</span>
          </div>
          {data.review_queue.map((a) => (
            <div className="review-row" key={a.id}>
              <div>
                <strong>{a.task_snapshot.title}</strong>
                <p>
                  {a.is_preview
                    ? "Тестовая попытка предпросмотра"
                    : studentName(data, a.student_id)}{" "}
                  · {formatDate(a.created_at)}
                </p>
              </div>
              <button className="btn small" onClick={() => setReview(a)}>
                Проверить
              </button>
            </div>
          ))}
        </section>
      )}
      {!teacher && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">
                {teacher ? "Ваша библиотека" : "Следующий шаг"}
              </span>
              <h2>{teacher ? "Учебные материалы" : "Доступные модули"}</h2>
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
              title={
                teacher
                  ? "Здесь будет ваша библиотека"
                  : "Библиотека пока пуста"
              }
              action={teacher ? "Создать первую тему" : "Перейти в каталог"}
              onAction={() => navigate("catalog")}
            >
              {teacher
                ? "Выберите раздел ЕГЭ и добавьте материалы, которые помогут разобраться в теме."
                : "Как только преподаватель опубликует материалы, вы сможете начать обучение."}
            </Empty>
          )}
        </>
      )}
      {review && (
        <ReviewModal attempt={review} onClose={() => setReview(null)} />
      )}
    </>
  );
}
export function ReviewModal({
  attempt,
  onClose,
}: {
  attempt: Attempt;
  onClose: () => void;
}) {
  const { data, refresh, notify } = useApp();
  const [status, setStatus] = useState("correct"),
    [comment, setComment] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const task = data.tasks.find((t) => t.id === attempt.task_id);
  const save = async () => {
    setBusy(true);
    try {
      await api("review", { attempt_id: attempt.id, status, comment });
      await refresh();
      notify("Результат проверки сохранён");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Проверка ответа" onClose={onClose}>
      <Form onSubmit={save}>
        <h3>{attempt.task_snapshot.title}</h3>
        <p className="task-statement">{attempt.task_snapshot.statement}</p>
        <span className="eyebrow">Ответ ученика</span>
        <p className="student-answer">
          {answerLabel(attempt.answer, attempt.task_snapshot)}
        </p>
        <Field label="Критерии">
          <p>{attempt.criteria || task?.criteria || "Критерии не указаны"}</p>
        </Field>
        <Field label="Результат">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="correct">Верно</option>
            <option value="wrong">Нужна доработка</option>
          </select>
        </Field>
        <Field label="Комментарий ученику">
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <div className="modal-actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить результат"}
          </button>
        </div>
      </Form>
    </Modal>
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
      <Metrics />
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
