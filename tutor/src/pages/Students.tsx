import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  UserPlus,
  Search,
  Pencil,
  Plus,
  X,
  GraduationCap,
} from "lucide-react";
import { useApp } from "../context";
import { api, formatDate } from "../lib/api";
import { dateTime, homeworkSummary } from "../lib/teaching";
import type { Student } from "../types";
import { Empty, ErrorBox, Field, Form, Modal } from "../components/ui";
import {
  AddStudentForm,
  StudentCodeDialog,
} from "../components/StudentCredentials";
export function Students() {
  const { data, teacher, navigate } = useApp();
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("all");
  if (!teacher) return <Empty title="Раздел доступен преподавателю" />;
  const rows = data.students.filter(
    (s) =>
      (status === "all" || s.status === status) &&
      `${s.nickname} ${s.display_name}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Ученики</h1>
        </div>
        <button className="btn primary" onClick={() => navigate("student-new")}>
          <UserPlus size={16} />
          Добавить ученика
        </button>
      </div>
      <div className="filter-bar">
        <label className="search">
          <Search size={16} />
          <input
            placeholder="Имя или псевдоним…"
            aria-label="Поиск ученика"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Статус учеников"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">Активные</option>
          <option value="archived">Архивные</option>
          <option value="all">Все ученики</option>
        </select>
      </div>
      {rows.length ? (
        <div className="student-list">
          <div className="student-list-head" aria-hidden="true">
            <span>Ученик</span><span>Начало обучения</span><span>Попытки</span><span>Работы</span><span>Статус</span><span />
          </div>
          {rows.map((s) => {
            const attempts = data.attempts.filter(
              (a) => a.student_id === s.student_id && !a.is_preview,
            );
            const works = data.homeworks.filter(
              (h) => h.student_id === s.student_id && !h.canceled_at,
            );
            return (
              <button
                className="student-row"
                key={s.student_id}
                onClick={() => navigate(`student/${s.student_id}`)}
              >
                <span className="student-identity">
                  <span className="avatar">{(s.nickname || s.display_name)[0].toUpperCase()}</span>
                  <strong>{s.nickname || s.display_name}</strong>
                </span>
                <span className="student-since"><span className="sr-only">Начало обучения: </span>{formatDate(s.started_on)}</span>
                <span className="student-count"><span className="student-count-label">Попытки: </span>{attempts.length}</span>
                <span className="student-count"><span className="student-count-label">Работы: </span>{works.length}</span>
                <span className={`badge ${s.status === "active" ? "green" : "neutral"}`}>
                  {s.status === "active" ? "Активен" : "В архиве"}
                </span>
                <ArrowRight size={16} className="student-row-arrow" />
              </button>
            );
          })}
        </div>
      ) : (
        <Empty
          title={
            data.students.length
              ? "Ученики не найдены"
              : "Учеников пока нет"
          }
        >
          {data.students.length ? "Измените поиск или фильтр." : undefined}
        </Empty>
      )}
    </>
  );
}
export function AddStudentPage() {
  const { teacher } = useApp();
  if (!teacher) return <Empty title="Раздел доступен преподавателю" />;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Добавить ученика</h1>
        </div>
      </div>
      <section className="panel student-create-panel">
        <AddStudentForm />
      </section>
    </>
  );
}
export function StudentPage({ id }: { id: string }) {
  const { data, teacher, navigate, refresh, notify } = useApp();
  const s = data.students.find((s) => s.student_id === id);
  const [editing, setEditing] = useState(false),
    [codeOpen, setCodeOpen] = useState(false),
    [moduleId, setModuleId] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!teacher || !s)
    return (
      <Empty
        title="Ученик недоступен"
        action="Открыть учеников"
        onAction={() => navigate("students")}
      />
    );
  const attempts = data.attempts.filter(
      (a) => a.student_id === id && !a.is_preview,
    ),
    graded = attempts.filter((a) => a.status !== "pending"),
    correct = graded.filter((a) => a.status === "correct");
  const assignments = data.assignments.filter((a) => a.student_id === id),
    works = data.homeworks.filter((h) => h.student_id === id),
    lessons = data.lessons.filter((l) => l.student_id === id),
    progress = data.student_progress.filter((p) => p.user_id === id);
  const assign = async () => {
    if (!moduleId) return;
    setBusy(true);
    setError("");
    try {
      await api("module_assign", { student_id: id, module_id: moduleId });
      await refresh();
      setModuleId("");
      notify("Модуль назначен ученику");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (mid: string) => {
    setBusy(true);
    try {
      await api("module_revoke", { student_id: id, module_id: mid });
      await refresh();
      notify(
        "Назначение отозвано. Открытые для всех модули остаются доступны.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="back-link" onClick={() => navigate("students")}>
        <ArrowLeft size={16} />
        Ученики
      </button>
      <div className="page-heading">
        <div>
          <h1>{s.nickname || s.display_name}</h1>
          <p>
            Начало обучения: {formatDate(s.started_on)} ·{" "}
            {s.status === "active" ? "Активен" : "В архиве"}
          </p>
        </div>
        <div className="actions">
          {s.login_method === "code" && (
            <button className="btn primary" onClick={() => setCodeOpen(true)}>
              Код для входа
            </button>
          )}
          <button className="btn" onClick={() => setEditing(true)}>
            <Pencil size={15} />
            Редактировать
          </button>
        </div>
      </div>
      <div className="metrics-grid">
        <div className="metric panel">
          <span>Попытки</span>
          <strong>{attempts.length}</strong>

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
          <small>Отмечены учеником как изученные</small>
        </div>
        <div className="metric panel">
          <span>Занятий в журнале</span>
          <strong>
            {
              lessons.filter(
                (l) => new Date(l.starts_at).getTime() <= Date.now(),
              ).length
            }
          </strong>
          <small>Прошедшие даты</small>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="student-detail-grid">
        <section className="panel">
          <div className="spread">
            <h2>Назначенные модули</h2>
            <GraduationCap size={18} />
          </div>
          {assignments.length ? (
            assignments.map((a) => {
              const m = data.modules.find((m) => m.id === a.module_id);
              const p = progress.find((p) => p.module_id === a.module_id);
              return (
                <div className="assigned-row" key={a.module_id}>
                  <div>
                    <strong>{m?.title ?? "Модуль"}</strong>
                    <small>
                      {!m?.published_at
                        ? "Снят с публикации"
                        : p?.completed_at
                          ? "Изучен"
                          : p
                            ? "В процессе"
                            : "Не начат"}{" "}
                      ·{" "}
                      {m?.audience === "assigned"
                        ? "Личный доступ"
                        : "Доступен всем"}
                    </small>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label={`Отозвать назначение ${m?.title ?? ""}`}
                    disabled={busy}
                    onClick={() => revoke(a.module_id)}
                  >
                    <X size={15} />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="inline-empty">Назначений пока нет.</p>
          )}
          {s.status === "active" && (
            <Form onSubmit={assign}>
              <Field label="Опубликованный модуль">
                <select
                  required
                  value={moduleId}
                  onChange={(e) => setModuleId(e.target.value)}
                >
                  <option value="">Выберите модуль</option>
                  {data.modules
                    .filter(
                      (m) =>
                        m.published_at &&
                        !assignments.some((a) => a.module_id === m.id),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                </select>
              </Field>
              <button className="btn small" disabled={busy || !moduleId}>
                <Plus size={15} />
                Назначить
              </button>
            </Form>
          )}
          <p className="field-hint">
            Чтобы закрыть модуль от остальных учеников, выберите в конструкторе
            доступ «Только назначенные».
          </p>
        </section>
        <section className="panel">
          <div className="spread">
            <h2>Заметки преподавателя</h2>
            <button
              className="icon-btn"
              aria-label="Редактировать заметки"
              onClick={() => setEditing(true)}
            >
              <Pencil size={15} />
            </button>
          </div>
          <p className="private-note">
            {s.notes ||
              "Заметок пока нет."}
          </p>
          <small className="muted">Видны только вам</small>
        </section>
      </div>
      <section className="panel teaching-section">
        <div className="spread">
          <h2>Домашние задания</h2>
          {s.status === "active" && (
            <button
              className="btn small"
              onClick={() => navigate(`homework-new/${id}`)}
            >
              <Plus size={14} />
              Назначить работу
            </button>
          )}
        </div>
        {works.length ? (
          works.map((w) => {
            const result = homeworkSummary(w, data.attempts);
            return (
              <button
                className="homework-highlight"
                key={w.id}
                onClick={() => navigate(`homework/${w.id}`)}
              >
                <div>
                  <strong>{w.title}</strong>
                  <small>{dateTime(w.due_at)}</small>
                </div>
                <span className="badge neutral">
                  {result.label} · {result.correct}/{result.total}
                </span>
              </button>
            );
          })
        ) : (
          <p className="inline-empty">Домашних заданий пока нет.</p>
        )}
      </section>
      <section className="panel teaching-section">
        <div className="spread">
          <h2>История результатов</h2>
          <button className="text-btn" onClick={() => navigate(`stats/${id}`)}>
            Подробная статистика
            <ArrowRight size={15} />
          </button>
        </div>
        {attempts.length ? (
          <div className="results-list">
            {attempts.slice(0, 12).map((a) => (
              <div key={a.id}>
                <span>
                  <strong>{a.task_snapshot.title}</strong>
                  <small>
                    {dateTime(a.created_at)}
                    {a.homework_item_id ? " · Домашняя работа" : ""}
                  </small>
                </span>
                <span className={`status ${a.status}`}>
                  {a.status === "correct"
                    ? "Верно"
                    : a.status === "wrong"
                      ? "Ошибка"
                      : "На проверке"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="inline-empty">
            Ответов пока нет.
          </p>
        )}
      </section>
      <section className="panel teaching-section">
        <div className="spread">
          <h2>Занятия</h2>
          <button className="text-btn" onClick={() => navigate("lessons")}>
            Открыть журнал
            <ArrowRight size={15} />
          </button>
        </div>
        {lessons.length ? (
          lessons.slice(0, 5).map((l) => (
            <div className="assigned-row" key={l.id}>
              <strong>{dateTime(l.starts_at)}</strong>
              <span>{l.duration_minutes} мин</span>
            </div>
          ))
        ) : (
          <p className="inline-empty">Занятия ещё не добавлены.</p>
        )}
      </section>
      {editing && <StudentEdit student={s} onClose={() => setEditing(false)} />}
      {codeOpen && (
        <StudentCodeDialog
          studentId={id}
          active={s.status === "active"}
          onClose={() => setCodeOpen(false)}
        />
      )}
    </>
  );
}
function StudentEdit({
  student: s,
  onClose,
}: {
  student: Student;
  onClose: () => void;
}) {
  const { refresh, notify } = useApp();
  const [form, setForm] = useState({
      nickname: s.nickname,
      started_on: s.started_on,
      status: s.status,
      notes: s.notes,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const startedInput = useRef<HTMLInputElement>(null);
  const save = async () => {
    setBusy(true);
    try {
      await api("student_save", {
        student_id: s.student_id,
        ...form,
        started_on: startedInput.current!.value,
      });
      await refresh();
      notify("Карточка ученика сохранена");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Карточка ученика" onClose={onClose}>
      <Form onSubmit={save}>
        <Field label="Имя или псевдоним для журнала">
          <input
            maxLength={100}
            value={form.nickname}
            placeholder={s.display_name}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
          />
        </Field>
        <Field label="Начало обучения">
          <input
            required
            type="date"
            ref={startedInput}
            defaultValue={form.started_on}
          />
        </Field>
        <Field label="Статус">
          <select
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as Student["status"] })
            }
          >
            <option value="active">Активен</option>
            <option value="archived">В архиве</option>
          </select>
        </Field>
        <p className="field-hint">
          Архивирование закрывает личные назначения и домашние работы. История
          результатов сохраняется. Доступ можно восстановить.
        </p>
        <Field label="Личные заметки преподавателя">
          <textarea
            rows={5}
            maxLength={20000}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <div className="modal-actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </Form>
    </Modal>
  );
}
export function Connect(_props: { initialCode?: string } = {}) {
  const { data, preview } = useApp();
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Мои преподаватели</h1>
        </div>
      </div>
      {preview ? (
        <p className="panel muted">
          В предпросмотре нет привязанного преподавателя.
        </p>
      ) : data.teachers.length ? (
        <div className="student-grid">
          {data.teachers.map((t) => (
            <section className="panel" key={t.teacher_id}>
              <span className="avatar">{t.display_name[0].toUpperCase()}</span>
              <h3>{t.display_name}</h3>
              <p className="muted">
                {t.status === "active"
                  ? "Обучение активно"
                  : "Обучение архивировано преподавателем"}
              </p>
              <small className="muted">С {formatDate(t.started_on)}</small>
            </section>
          ))}
        </div>
      ) : (
        <Empty title="Преподаватель пока не подключён">
          Для входа в учебный кабинет получите шестизначный код у преподавателя.
        </Empty>
      )}
    </>
  );
}
