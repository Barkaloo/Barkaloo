import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  CalendarClock,
} from "lucide-react";
import { useApp } from "../context";
import { api, answerLabel } from "../lib/api";
import { dateTime, homeworkState, studentName } from "../lib/teaching";
import { taskLabels } from "../types";
import { Empty, ErrorBox } from "../components/ui";
import TaskPlayer from "../components/TaskPlayer";
import ReviewModal from "../components/ReviewModal";
import HomeworkForm from "../components/HomeworkForm";
import HomeworkMaterials from "../components/HomeworkMaterials";
import HomeworkResponse from "../components/HomeworkResponse";
export function HomeworkList({ create = false, studentId, lessonId, initialStudent = "" }: {
  create?: boolean; studentId?: string; lessonId?: string; initialStudent?: string;
}) {
  const { data, teacher, preview, navigate } = useApp();
  const [student, setStudent] = useState(initialStudent), [status, setStatus] = useState("all");
  const summaries = data.homeworks
    .filter((h) => !teacher || !student || h.student_id === student)
    .map((work) => ({ work, result: homeworkState(work, data.attempts, preview) }))
    .sort((a, b) => Date.parse(b.work.assigned_at) - Date.parse(a.work.assigned_at));
  const works = summaries.filter(({ result }) => status === "all" || result.state === status);
  const counts = [
    ["Всего", summaries.length],
    ["Выполнено", summaries.filter(({ result }) => result.state === "completed").length],
    ["Не выполнено", summaries.filter(({ result }) => result.state === "uncompleted").length],
    ["Просрочено", summaries.filter(({ result }) => result.state === "overdue").length],
    ["На проверке", summaries.filter(({ result }) => result.state === "pending").length],
  ] as const;
  return <>
    <div className="page-heading">
      <h1>Домашние задания</h1>
      {teacher && <button className="btn primary" onClick={() => navigate("homework-new")}><Plus size={16} />Назначить работу</button>}
    </div>
    <div className="homework-metrics" aria-label="Статистика домашних работ">
      {counts.map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}
    </div>
    <div className="filter-bar">
      {teacher && <select aria-label="Ученик для фильтра домашних работ" value={student} onChange={(e) => setStudent(e.target.value)}>
        <option value="">Все ученики</option>{data.students.map((s) => <option key={s.student_id} value={s.student_id}>{s.nickname || s.display_name}</option>)}
      </select>}
      <select aria-label="Статус домашних работ" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="all">Все работы</option><option value="uncompleted">Не выполнены</option><option value="overdue">Просрочены</option>
        <option value="pending">На проверке</option><option value="completed">Выполнены</option><option value="canceled">Отменены</option>
      </select>
    </div>
    {works.length ? <div className="homework-grid compact-homeworks">
      {works.map(({ work: w, result: r }) => {
        const lessons = data.lessons.filter((l) => l.homework_ids.includes(w.id));
        return <button className="panel homework-card" key={w.id} onClick={() => navigate(`homework/${w.id}`)}>
          <div className="spread"><span className={`badge homework-status ${r.state}`}>{r.label}</span><ArrowRight size={16} /></div>
          <h3>{w.title}</h3>
          {teacher && <p>{studentName(data, w.student_id)}</p>}
          <div className="homework-dates">
            <span>Назначено: {dateTime(w.assigned_at)}</span>
            <span><CalendarClock size={14} />Срок: {dateTime(w.due_at)}</span>
          </div>
          {lessons.length > 0 && <p className="homework-lesson-context">Занятие: {lessons.map((l) => dateTime(l.starts_at)).join(" · ")}</p>}
          <div className="spread homework-score">{r.totalRequired ? <><span>Заданий: {r.total}{w.requires_submission ? " + ответ преподавателю" : ""}</span><span>Выполнено: {r.acceptedRequired}/{r.totalRequired}</span></> : <span>Материалы для изучения</span>}</div>
        </button>;
      })}
    </div> : <Empty title={summaries.length ? "Нет работ с этим статусом" : "Домашних работ пока нет"} />}
    {create && teacher && <HomeworkForm key={`${studentId ?? ""}:${lessonId ?? ""}`} initialStudent={studentId} initialLesson={lessonId} onClose={() => navigate("homework")} />}
  </>;
}
export function HomeworkPage({ id }: { id: string }) {
  const { data, teacher, preview, navigate, refresh, notify } = useApp();
  const work = data.homeworks.find((h) => h.id === id);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<import("../types").Attempt | null>(null);
  if (!work)
    return (
      <Empty
        title="Работа недоступна"
        action="Домашние задания"
        onAction={() => navigate("homework")}
      />
    );
  const summary = homeworkState(work, data.attempts, preview);
  const cancel = async () => {
    if (
      !window.confirm(
        "Отменить домашнюю работу? Ответы и результаты сохранятся в истории.",
      )
    )
      return;
    setBusy(true);
    try {
      await api("homework_cancel", { id });
      await refresh();
      notify("Работа отменена");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="back-link" onClick={() => navigate("homework")}>
        <ArrowLeft size={16} />
        Домашние задания
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {teacher
              ? studentName(data, work.student_id)
              : "Назначено преподавателем"}
          </span>
          <h1>{work.title}</h1>
          <p>Срок: {dateTime(work.due_at)}</p>
        </div>
        {teacher && !work.canceled_at && (
          <button className="btn" disabled={busy} onClick={cancel}>
            Отменить работу
          </button>
        )}
      </div>
      {error && <ErrorBox message={error} />}
      <div className="homework-banner panel">
        <div className="spread">
          <h2>{summary.label}</h2>
          {summary.totalRequired > 0 && <span className={`badge homework-status ${summary.state}`}>
            Выполнено {summary.acceptedRequired}/{summary.totalRequired}
          </span>}
        </div>
        {summary.total > 0 && <p className="muted">
          Ответов {summary.answered}/{summary.total}
          {summary.pending
            ? ` · Ожидают ручной проверки: ${summary.pending}`
            : ""}
        </p>}
        {work.comment && <p className="private-note">{work.comment}</p>}
        {!!work.resources?.length && <HomeworkMaterials resources={work.resources} />}
        {summary.overdue && (
          <p className="status pending">
            Срок прошёл. Ответы по-прежнему можно отправить.
          </p>
        )}
        {work.canceled_at && (
          <p className="status pending">
            Работа отменена. Отправка новых ответов закрыта, история сохранена.
          </p>
        )}
      </div>
      <div className="homework-contents">
        {work.items.map((item, index) => {
          const attempts = summary.attemptsByItem.get(item.id) ?? [];
          const last = attempts[0];
          return (
            <section key={item.id}>
              <div className="homework-item-heading">
                <span>{index + 1}</span>
                <strong>{!teacher && !work.canceled_at ? `Задание ${index + 1}` : item.snapshot.title}</strong>
              </div>
              {!teacher && !work.canceled_at ? (
                <TaskPlayer task={item.snapshot} homeworkItemId={item.id} />
              ) : (
                <article className="panel">
                  <span className="badge">
                    {taskLabels[item.snapshot.type]}
                  </span>
                  <p className="task-statement homework-condition">
                    {item.snapshot.statement}
                  </p>
                  {attempts.length ? (
                    <>
                      <div className="spread">
                        <p>
                          Последний ответ:{" "}
                          <strong>
                            {answerLabel(last.answer, item.snapshot)}
                          </strong>
                        </p>
                        <span className={`status ${last.status}`}>
                          {last.status === "correct"
                            ? "Верно"
                            : last.status === "wrong"
                              ? "Ошибка"
                              : "На проверке"}
                        </span>
                      </div>
                      {teacher && last.status === "pending" && (
                        <button
                          className="btn primary"
                          onClick={() =>
                            setReview(
                              data.review_queue.find((a) => a.id === last.id) ??
                                last,
                            )
                          }
                        >
                          Проверить ответ
                        </button>
                      )}
                      <details className="attempt-history">
                        <summary>История попыток · {attempts.length}</summary>
                        {attempts.map((a) => (
                          <div key={a.id}>
                            <time>{dateTime(a.created_at)}</time>
                            <span>{answerLabel(a.answer, item.snapshot)}</span>
                            <span className={`status ${a.status}`}>
                              {a.status === "correct"
                                ? "Верно"
                                : a.status === "wrong"
                                  ? "Ошибка"
                                  : "На проверке"}
                            </span>
                            {a.feedback.comment && <p>{a.feedback.comment}</p>}
                          </div>
                        ))}
                      </details>
                    </>
                  ) : (
                    <p className="inline-empty">Ответ пока не отправлен.</p>
                  )}
                </article>
              )}
            </section>
          );
        })}
      </div>
      {work.requires_submission && <HomeworkResponse work={work} />}
      {review && (
        <ReviewModal attempt={review} onClose={() => setReview(null)} />
      )}
    </>
  );
}
