import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  UserPlus,
  Search,
  Pencil,
  Plus,
} from "lucide-react";
import { useApp } from "../context";
import { api, formatDate } from "../lib/api";
import type { Student } from "../types";
import { Empty, ErrorBox, Field, Form, Modal } from "../components/ui";
import {
  AddStudentForm,
  StudentCodeDialog,
} from "../components/StudentCredentials";
import StudentNotes from "../components/StudentNotes";
import HomeworkForm from "../components/HomeworkForm";
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
          <option value="archived">Доступ приостановлен</option>
          <option value="all">Все ученики</option>
        </select>
      </div>
      {rows.length ? (
        <div className="student-list">
          <div className="student-list-head" aria-hidden="true">
            <span>Ученик</span><span>Дата добавления</span><span>Проведено занятий</span><span>Статус</span><span />
          </div>
          {rows.map((s) => {
            const completed = data.lessons.filter(
              (lesson) => lesson.student_id === s.student_id && lesson.status === "completed",
            ).length;
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
                <span className="student-since"><span className="sr-only">Добавлен: </span>{formatDate(s.created_at)}</span>
                <span className="student-count"><span className="student-count-label">Проведено занятий: </span>{completed}</span>
                <span className={`badge ${s.status === "active" ? "green" : "neutral"}`}>
                  {s.status === "active" ? "Активен" : "Доступ приостановлен"}
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
  const { data, teacher, navigate } = useApp();
  const s = data.students.find((s) => s.student_id === id);
  const [editing, setEditing] = useState(false),
    [codeOpen, setCodeOpen] = useState(false),
    [homeworkOpen, setHomeworkOpen] = useState(false);
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
  const lessons = data.lessons.filter((l) => l.student_id === id),
    progress = data.student_progress.filter((p) => p.user_id === id);
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
            {s.status === "active" ? "Активен" : "Доступ приостановлен"}
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
          <span>Проведено занятий</span>
          <strong>
            {
              lessons.filter(
                (l) => l.status === "completed",
              ).length
            }
          </strong>

        </div>
      </div>
      <div className="student-detail-grid">
        <div className="student-homework-action">
          <button className="btn primary" disabled={s.status !== "active"} onClick={() => setHomeworkOpen(true)}>
            <Plus size={16} />Назначить домашнее задание
          </button>
        </div>
        <StudentNotes studentId={id} />
      </div>
      <div className="actions student-detail-links">
        <button className="btn" onClick={() => navigate(`lessons/${id}`)}>Журнал занятий <ArrowRight size={15} /></button>
        <button className="btn" onClick={() => navigate(`homework/student/${id}`)}>Домашние задания <ArrowRight size={15} /></button>
        <button className="btn" onClick={() => navigate(`stats/${id}`)}>Последние результаты <ArrowRight size={15} /></button>
      </div>
      {homeworkOpen && <HomeworkForm initialStudent={id} onClose={() => setHomeworkOpen(false)} />}
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
            <option value="archived">Доступ приостановлен</option>
          </select>
        </Field>
        <p className="field-hint">
          Приостановка доступа закрывает личные назначения и домашние работы. История
          результатов сохраняется. Доступ можно восстановить.
        </p>
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
