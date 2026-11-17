import { useRef, useState } from "react";
import { Plus, Pencil, CalendarDays, CheckCircle2, CircleX } from "lucide-react";
import { useApp } from "../context";
import { api } from "../lib/api";
import { dateTime, localDateTime, studentName, lessonLabels, homeworkState } from "../lib/teaching";
import type { LessonRecord } from "../types";
import { Empty, ErrorBox, Field, Form, Modal } from "../components/ui";
export default function Lessons() {
  const { data, teacher, preview, refresh, notify, navigate } = useApp();
  const [student, setStudent] = useState(""),
    [modal, setModal] = useState<LessonRecord | "new" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const lessons = data.lessons
    .filter((l) => !teacher || !student || l.student_id === student)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const changeStatus = async (lesson: LessonRecord, status: LessonRecord["status"]) => {
    if (status === "canceled" && !window.confirm("Отменить занятие? Статусы домашних работ не изменятся.")) return;
    setBusy(lesson.id);
    setError("");
    try {
      await api("lesson_save", { ...lesson, status });
      await refresh();
      notify(status === "completed" ? "Занятие проведено" : "Занятие отменено");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };
  return <>
    <div className="page-heading">
      <h1>Журнал занятий</h1>
      {teacher && <button className="btn primary" onClick={() => setModal("new")}><Plus size={16} />Добавить занятие</button>}
    </div>
    {teacher && <div className="filter-bar">
      <select aria-label="Ученик в журнале занятий" value={student} onChange={(e) => setStudent(e.target.value)}>
        <option value="">Все ученики</option>
        {data.students.map((s) => <option key={s.student_id} value={s.student_id}>{s.nickname || s.display_name}</option>)}
      </select>
    </div>}
    {error && <ErrorBox message={error} />}
    {lessons.length ? <div className="lesson-record-list">
      {lessons.map((l) => {
        const status = l.status ?? "planned";
        const StatusIcon = status === "completed" ? CheckCircle2 : status === "canceled" ? CircleX : CalendarDays;
        const editable = teacher && data.students.some((s) => s.student_id === l.student_id && s.status === "active");
        return <article className="panel lesson-record" key={l.id}>
          <div className="spread">
            <h2>{dateTime(l.starts_at)}</h2>
            <div className="actions">
              <span className={`lesson-status ${status}`}><StatusIcon size={15} />{lessonLabels[status]}</span>
              {teacher && <button className="icon-btn" aria-label="Редактировать занятие" disabled={!editable || busy === l.id} onClick={() => setModal(l)}><Pencil size={16} /></button>}
            </div>
          </div>
          <div className="lesson-record-meta">
            <strong>{teacher ? studentName(data, l.student_id) : data.teachers.find((t) => t.teacher_id === l.teacher_id)?.display_name}</strong>
            <span>{l.duration_minutes} мин.</span>
          </div>
          {l.topic_ids.length > 0 && <div className="topic-tags">{l.topic_ids.map((id) => <span className="badge" key={id}>{data.topics.find((t) => t.id === id)?.title ?? "Учебная тема"}</span>)}</div>}
          {teacher && l.comment && <p className="private-note">{l.comment}</p>}
          {l.homework_ids.length > 0 && <div className="lesson-homeworks">
            {l.homework_ids.map((id) => {
              const work = data.homeworks.find((h) => h.id === id);
              if (!work) return null;
              const result = homeworkState(work, data.attempts, preview);
              return <button className="homework-highlight" key={id} onClick={() => navigate(`homework/${id}`)}>
                <div><strong>{work.title}</strong><small>Срок: {dateTime(work.due_at)}</small></div>
                <span className={`badge homework-status ${result.state}`}>{result.label}</span>
              </button>;
            })}
          </div>}
          {editable && <div className="actions lesson-actions">
            {status === "planned" && <button className="btn small" disabled={busy === l.id} onClick={() => changeStatus(l, "completed")}><CheckCircle2 size={15} />Провести</button>}
            {status !== "canceled" && <button className="text-btn" disabled={busy === l.id} onClick={() => changeStatus(l, "canceled")}>Отменить</button>}
            {status !== "canceled" && <button className="text-btn" onClick={() => navigate(`homework-new/${l.student_id}/${l.id}`)}>Назначить домашнюю работу</button>}
          </div>}
        </article>;
      })}
    </div> : <Empty title="Занятий пока нет">{teacher ? "Добавьте проведённое или запланированное занятие." : "Здесь появятся занятия, которые добавит преподаватель."}</Empty>}
    {modal && teacher && <LessonForm record={modal === "new" ? undefined : modal} initialStudent={student} onClose={() => setModal(null)} />}
  </>;
}
function LessonForm({
  record,
  initialStudent,
  onClose,
}: {
  record?: LessonRecord;
  initialStudent?: string;
  onClose: () => void;
}) {
  const { data, refresh, notify, navigate } = useApp();
  const [student, setStudent] = useState(
      record?.student_id ?? initialStudent ?? "",
    ),
    [duration, setDuration] = useState(record?.duration_minutes ?? 60),
    [status, setStatus] = useState(record?.status ?? "planned"),
    [comment, setComment] = useState(record?.comment ?? ""),
    [topics, setTopics] = useState<string[]>(record?.topic_ids ?? []),
    [works, setWorks] = useState<string[]>(record?.homework_ids ?? []),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const startsInput = useRef<HTMLInputElement>(null);
  const save = async () => {
    setBusy(true);
    try {
      await api("lesson_save", {
        id: record?.id,
        student_id: student,
        starts_at: new Date(startsInput.current!.value).toISOString(),
        duration_minutes: duration,
        status,
        comment,
        topic_ids: topics,
        homework_ids: works,
      });
      await refresh();
      notify("Занятие сохранено");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={record ? "Редактировать занятие" : "Новое занятие"}
      onClose={onClose}
      wide
    >
      {!data.students.some((s) => s.status === "active") ? (
        <Empty
          title="Подключите первого ученика"
          action="Открыть учеников"
          onAction={() => navigate("students")}
        />
      ) : (
        <Form onSubmit={save}>
          <Field label="Ученик">
            <select
              required
              disabled={!!record}
              value={student}
              onChange={(e) => {
                setStudent(e.target.value);
                setWorks([]);
              }}
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
          <div className="form-grid">
            <Field label="Дата и время">
              <input
                required
                type="datetime-local"
                ref={startsInput}
                defaultValue={localDateTime(
                  record?.starts_at ?? new Date().toISOString(),
                )}
              />
            </Field>
            <Field label="Продолжительность, минут">
              <input
                required
                type="number"
                min={1}
                max={480}
                value={duration}
                onChange={(e) => setDuration(+e.target.value)}
              />
            </Field>
          </div>
          <Field label="Статус занятия">
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="planned">Запланировано</option>
              <option value="completed">Проведено</option>
              <option value="canceled">Отменено</option>
            </select>
          </Field>
          <fieldset className="choice-fieldset">
            <legend>Темы занятия</legend>
            {data.topics.length ? (
              data.topics.map((t) => (
                <label key={t.id}>
                  <input
                    type="checkbox"
                    checked={topics.includes(t.id)}
                    onChange={(e) =>
                      setTopics((ids) =>
                        e.target.checked
                          ? [...ids, t.id]
                          : ids.filter((id) => id !== t.id),
                      )
                    }
                  />
                  {t.title}
                </label>
              ))
            ) : (
              <p className="muted">Темы пока не созданы.</p>
            )}
          </fieldset>
          <Field label="Личный комментарий преподавателя">
            <textarea
              rows={4}
              maxLength={20000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>
          <fieldset className="choice-fieldset">
            <legend>Связанные домашние работы</legend>
            {data.homeworks.filter((h) => h.student_id === student).length ? (
              data.homeworks
                .filter((h) => h.student_id === student)
                .map((h) => (
                  <label key={h.id}>
                    <input
                      type="checkbox"
                      checked={works.includes(h.id)}
                      onChange={(e) =>
                        setWorks((ids) =>
                          e.target.checked
                            ? [...ids, h.id]
                            : ids.filter((id) => id !== h.id),
                        )
                      }
                    />
                    {h.title}
                  </label>
                ))
            ) : (
              <p className="muted">У выбранного ученика пока нет работ.</p>
            )}
          </fieldset>
          {error && <ErrorBox message={error} />}
          <div className="modal-actions">
            <button className="btn" type="button" onClick={onClose}>
              Отмена
            </button>
            <button className="btn primary" disabled={busy || !student}>
              {busy ? "Сохранение…" : "Сохранить занятие"}
            </button>
          </div>
        </Form>
      )}
    </Modal>
  );
}
