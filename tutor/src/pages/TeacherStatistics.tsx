import { useState } from "react";
import { useApp } from "../context";
import ActivityChart from "../components/ActivityChart";
import { studentName, homeworkSummary } from "../lib/teaching";
import { Empty } from "../components/ui";
export default function TeacherStatistics({
  initialStudent = "",
}: {
  initialStudent?: string;
}) {
  const { data, teacher, navigate } = useApp();
  const [student, setStudent] = useState(initialStudent);
  if (!teacher) return <Empty title="Статистика преподавателя недоступна" />;
  if (student && !data.students.some((s) => s.student_id === student))
    return <Empty title="Ученик недоступен" />;
  const attempts = data.attempts.filter(
      (a) => !a.is_preview && (!student || a.student_id === student),
    ),
    graded = attempts.filter((a) => a.status !== "pending"),
    correct = graded.filter((a) => a.status === "correct");
  const progress = data.student_progress.filter(
      (p) => !student || p.user_id === student,
    ),
    works = data.homeworks.filter((w) => !student || w.student_id === student),
    lessons = data.lessons.filter(
      (l) =>
        (!student || l.student_id === student) &&
        new Date(l.starts_at).getTime() <= Date.now(),
    );
  const errors = [
    ...new Set(
      attempts.filter((a) => a.status === "wrong").map((a) => a.task_id),
    ),
  ]
    .map((id) => {
      const rows = attempts.filter((a) => a.task_id === id);
      return {
        id,
        title: rows[0].task_snapshot.title,
        wrong: rows.filter((a) => a.status === "wrong").length,
        total: rows.length,
      };
    })
    .sort((a, b) => b.wrong - a.wrong)
    .slice(0, 8);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">От наблюдений к решениям</span>
          <h1>Статистика учеников</h1>
          <p>
            {student
              ? studentName(data, student)
              : "Результаты ваших модулей и домашних работ. Предпросмотр исключён."}
          </p>
        </div>
      </div>
      <div className="filter-bar">
        <select
          aria-label="Ученик для статистики"
          value={student}
          onChange={(e) => setStudent(e.target.value)}
        >
          <option value="">Все ученики</option>
          {data.students.map((s) => (
            <option key={s.student_id} value={s.student_id}>
              {s.nickname || s.display_name}
              {s.status === "archived" ? " · архив" : ""}
            </option>
          ))}
        </select>
        {student && (
          <button
            className="btn"
            onClick={() => navigate(`student/${student}`)}
          >
            Карточка ученика
          </button>
        )}
      </div>
      <div className="metrics-grid">
        <div className="metric panel">
          <span>Попытки решения</span>
          <strong>{attempts.length}</strong>
          <small>Включая домашние работы</small>
        </div>
        <div className="metric panel">
          <span>Правильных ответов</span>
          <strong>
            {graded.length
              ? `${Math.round((correct.length / graded.length) * 100)}%`
              : "—"}
          </strong>
          <small>
            {correct.length} из {graded.length} проверенных
          </small>
        </div>
        <div className="metric panel">
          <span>Завершено модулей</span>
          <strong>{progress.filter((p) => p.completed_at).length}</strong>
          <small>Отметки учеников об изучении</small>
        </div>
        <div className="metric panel">
          <span>Проведено занятий</span>
          <strong>{lessons.length}</strong>
          <small>
            {lessons.reduce((sum, l) => sum + l.duration_minutes, 0)} минут в
            журнале
          </small>
        </div>
      </div>
      <ActivityChart attempts={attempts} />
      <div className="dashboard-columns stats-lower">
        <section className="panel">
          <h2>Результаты по номерам ЕГЭ</h2>
          <p className="muted">Верные ответы / все проверенные попытки</p>
          <div className="ege-progress">
            {data.sections.map((s) => {
              const topicIds = data.topics
                .filter((t) => t.section_id === s.id)
                .map((t) => t.id);
              const rows = graded.filter((a) => topicIds.includes(a.topic_id)),
                good = rows.filter((a) => a.status === "correct").length;
              return (
                <button
                  key={s.id}
                  className={
                    rows.length && good === rows.length
                      ? "complete"
                      : rows.length
                        ? "partial"
                        : ""
                  }
                  title={`${s.title}: ${good} из ${rows.length}`}
                  onClick={() => navigate(`section/${s.id}`)}
                >
                  <span>{s.number}</span>
                  <small>{rows.length ? `${good}/${rows.length}` : "—"}</small>
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel">
          <h2>Частые ошибки</h2>
          <p className="muted">Количество неверных попыток за всё время</p>
          {errors.length ? (
            errors.map((e) => (
              <div className="problem-row" key={e.id}>
                <span>{e.title}</span>
                <strong>
                  {e.wrong} из {e.total}
                </strong>
                <i style={{ width: `${(e.wrong / e.total) * 100}%` }} />
              </div>
            ))
          ) : (
            <p className="inline-empty">
              Ошибок пока нет. Данные появятся после первых решений.
            </p>
          )}
        </section>
      </div>
      <section className="panel teaching-section">
        <h2>Результаты домашних работ</h2>
        {works.length ? (
          works.map((w) => {
            const s = homeworkSummary(w, data.attempts);
            return (
              <button
                className="homework-highlight"
                key={w.id}
                onClick={() => navigate(`homework/${w.id}`)}
              >
                <div>
                  <strong>{w.title}</strong>
                  <small>{studentName(data, w.student_id)}</small>
                </div>
                <span className="badge neutral">
                  {s.label} · {s.correct}/{s.total}
                </span>
              </button>
            );
          })
        ) : (
          <p className="inline-empty">Домашние работы ещё не назначены.</p>
        )}
      </section>
    </>
  );
}
