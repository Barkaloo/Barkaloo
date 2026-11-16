import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  CalendarClock,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../context";
import { api, answerLabel } from "../lib/api";
import { dateTime, homeworkSummary, studentName } from "../lib/teaching";
import { taskLabels } from "../types";
import { Empty, ErrorBox, Field, Form, Modal } from "../components/ui";
import TaskPlayer from "../components/TaskPlayer";
import { ReviewModal } from "./Overview";
export function HomeworkList({
  create = false,
  studentId,
}: {
  create?: boolean;
  studentId?: string;
}) {
  const { data, teacher, preview, navigate } = useApp();
  const [student, setStudent] = useState(""),
    [status, setStatus] = useState("active");
  const works = data.homeworks.filter(
    (h) =>
      (!student || h.student_id === student) &&
      (status === "all" || status === "canceled"
        ? status === "all" || !!h.canceled_at
        : status === "overdue"
          ? homeworkSummary(h, data.attempts, preview).overdue
          : !h.canceled_at),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Закрепляйте изученное</span>
          <h1>Домашние задания</h1>
          <p>
            {teacher
              ? "Назначайте работы из опубликованных заданий и проверяйте результаты."
              : "Ваши задания, сроки и результаты проверки в одном месте."}
          </p>
        </div>
        {teacher && (
          <button
            className="btn primary"
            onClick={() => navigate("homework-new")}
          >
            <Plus size={16} />
            Назначить работу
          </button>
        )}
      </div>
      <div className="filter-bar">
        {teacher && (
          <select
            aria-label="Ученик для фильтра домашних работ"
            value={student}
            onChange={(e) => setStudent(e.target.value)}
          >
            <option value="">Все ученики</option>
            {data.students.map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {s.nickname || s.display_name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Статус домашних работ"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">Актуальные</option>
          <option value="overdue">Срок прошёл</option>
          <option value="canceled">Отменённые</option>
          <option value="all">Все работы</option>
        </select>
      </div>
      {works.length ? (
        <div className="homework-grid">
          {works.map((w) => {
            const s = homeworkSummary(w, data.attempts, preview);
            return (
              <button
                className="panel homework-card"
                key={w.id}
                onClick={() => navigate(`homework/${w.id}`)}
              >
                <div className="spread">
                  <span
                    className={`badge ${s.status === "checked" ? "green" : s.overdue ? "amber" : "neutral"}`}
                  >
                    {s.label}
                  </span>
                  <ArrowRight size={16} />
                </div>
                <h3>{w.title}</h3>
                {teacher && <p>{studentName(data, w.student_id)}</p>}
                <div className="deadline">
                  <CalendarClock size={14} />
                  {dateTime(w.due_at)}
                  {s.overdue && (
                    <span className="status pending">Срок прошёл</span>
                  )}
                </div>
                <div className="progress-track">
                  <i
                    style={{
                      width: `${s.total ? (s.answered / s.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="spread homework-score">
                  <span>
                    Ответов {s.answered}/{s.total}
                  </span>
                  <span>
                    Верных: {s.correct}
                    {s.pending ? ` · На проверке: ${s.pending}` : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            data.homeworks.length
              ? "В этой категории пока пусто"
              : "Домашних работ пока нет"
          }
          action={teacher ? "Назначить первую работу" : "Открыть каталог"}
          onAction={() => navigate(teacher ? "homework-new" : "catalog")}
        >
          {teacher
            ? "Выберите ученика, задания из своих опубликованных модулей и срок выполнения."
            : "Назначенные преподавателем работы появятся здесь."}
        </Empty>
      )}
      {create && teacher && (
        <HomeworkForm
          initialStudent={studentId}
          onClose={() => navigate("homework")}
        />
      )}
    </>
  );
}
function HomeworkForm({
  initialStudent,
  onClose,
}: {
  initialStudent?: string;
  onClose: () => void;
}) {
  const { data, refresh, navigate } = useApp();
  const [student, setStudent] = useState(initialStudent ?? ""),
    [title, setTitle] = useState(""),
    [comment, setComment] = useState(""),
    [chosen, setChosen] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const dueInput = useRef<HTMLInputElement>(null);
  const tasks = data.assignable_tasks.filter((t) =>
    `${t.title} ${t.statement}`.toLowerCase().includes(query.toLowerCase()),
  );
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("homework_create", {
        student_id: student,
        title,
        comment,
        due_at: dueInput.current?.value
          ? new Date(dueInput.current.value).toISOString()
          : null,
        task_ids: chosen,
      });
      await refresh();
      navigate(`homework/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Назначить домашнюю работу" onClose={onClose} wide>
      {!data.students.some((s) => s.status === "active") ? (
        <Empty
          title="Сначала подключите ученика"
          action="Открыть учеников"
          onAction={() => navigate("students")}
        >
          Добавьте ученика в кабинете и передайте ему код для входа.
        </Empty>
      ) : !data.assignable_tasks.length ? (
        <Empty
          title="Нет опубликованных заданий"
          action="Открыть каталог"
          onAction={() => navigate("catalog")}
        >
          Создайте модуль с практическими блоками и опубликуйте его.
        </Empty>
      ) : (
        <Form onSubmit={save}>
          <div className="form-grid">
            <Field label="Ученик">
              <select
                required
                value={student}
                onChange={(e) => setStudent(e.target.value)}
              >
                <option value="">Выберите ученика</option>
                {data.students
                  .filter((s) => s.status === "active")
                  .map((s) => (
                    <option key={s.student_id} value={s.student_id}>
                      {s.nickname || s.display_name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Название работы">
              <input
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Срок сдачи" hint="Можно оставить без срока">
              <input type="datetime-local" ref={dueInput} />
            </Field>
            <Field label="Комментарий ученику">
              <textarea
                rows={2}
                maxLength={20000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
          </div>
          <div className="spread">
            <h3>Задания</h3>
            <span className="badge">Выбрано {chosen.length}/100</span>
          </div>
          <label className="search teaching-search">
            <Search size={16} />
            <input
              aria-label="Поиск задания для домашней работы"
              placeholder="Название или условие…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="task-picker">
            {tasks.map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(t.id)}
                  disabled={!chosen.includes(t.id) && chosen.length >= 100}
                  onChange={(e) =>
                    setChosen((ids) =>
                      e.target.checked
                        ? [...ids, t.id]
                        : ids.filter((id) => id !== t.id),
                    )
                  }
                />
                <span>
                  <strong>{t.title}</strong>
                  <small>
                    {data.modules.find((m) => m.id === t.module_id)?.title} ·{" "}
                    {taskLabels[t.type]}
                  </small>
                  <p>{t.statement}</p>
                </span>
              </label>
            ))}
            {!tasks.length && (
              <p className="inline-empty">Задания не найдены.</p>
            )}
          </div>
          <p className="field-hint">
            В работу попадёт опубликованная версия заданий. Последующие
            изменения модулей не поменяют условия и проверку этой работы.
          </p>
          {error && <ErrorBox message={error} />}
          <div className="modal-actions">
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={onClose}
            >
              Отмена
            </button>
            <button
              className="btn primary"
              disabled={busy || !student || !chosen.length}
            >
              {busy ? "Назначение…" : "Назначить работу"}
            </button>
          </div>
        </Form>
      )}
    </Modal>
  );
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
  const summary = homeworkSummary(work, data.attempts, preview);
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
          <span className="badge green">
            <CheckCircle2 size={14} />
            Верных {summary.correct}/{summary.total}
          </span>
        </div>
        <p className="muted">
          Ответов {summary.answered}/{summary.total}
          {summary.pending
            ? ` · Ожидают ручной проверки: ${summary.pending}`
            : ""}
        </p>
        {work.comment && <p className="private-note">{work.comment}</p>}
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
          const attempts = data.attempts.filter(
            (a) =>
              a.homework_item_id === item.id &&
              a.is_preview === preview &&
              a.student_id === (preview ? work.teacher_id : work.student_id),
          );
          const last = attempts[0];
          return (
            <section key={item.id}>
              <div className="homework-item-heading">
                <span>{index + 1}</span>
                <strong>{item.snapshot.title}</strong>
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
      {review && (
        <ReviewModal attempt={review} onClose={() => setReview(null)} />
      )}
    </>
  );
}
