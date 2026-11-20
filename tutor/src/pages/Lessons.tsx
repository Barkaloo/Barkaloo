import { useRef, useState } from "react";
import { Plus, Pencil, CalendarDays, CheckCircle2, Clock, ClipboardList, ArrowUpRight, Lock, Unlock } from "lucide-react";
import { useApp } from "../context";
import { api } from "../lib/api";
import { dateTime, localDateTime, studentName, lessonLabels, homeworkState } from "../lib/teaching";
import type { LessonRecord } from "../types";
import { Empty, ErrorBox, Field, Form, Modal } from "../components/ui";
import LessonCalendar from "../components/LessonCalendar";
import { getLessonMonth, lessonDayKey, localLessonMonth } from "../lib/lesson-calendar";
const agendaDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const lessonTime = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

export default function Lessons({ initialStudent = "" }: { initialStudent?: string }) {
  const { data, teacher, preview, refresh, notify, navigate } = useApp();
  const [student, setStudent] = useState(initialStudent),
    [month, setMonth] = useState(() => localLessonMonth(new Date())),
    [selectedDay, setSelectedDay] = useState<number | null>(null),
    [modal, setModal] = useState<LessonRecord | "new" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [blockingDay, setBlockingDay] = useState(false);
  const { lessons, days, years } = getLessonMonth(data.lessons, month, teacher ? student : "");
  const blockedDays = new Set(data.blocked_lesson_days);
  const selectedDate = selectedDay === null ? null : lessonDayKey(month, selectedDay);
  const selectedBlocked = selectedDate !== null && blockedDays.has(selectedDate);
  const schedule = new Map<number, LessonRecord[]>();
  for (const lesson of lessons) {
    const day = new Date(lesson.starts_at).getDate();
    if (selectedDay !== null && day !== selectedDay) continue;
    const group = schedule.get(day);
    if (group) group.push(lesson);
    else schedule.set(day, [lesson]);
  }
  const scheduleTitle = selectedDay === null
    ? "Занятия за месяц"
    : agendaDay.format(new Date(month.year, month.month, selectedDay));
  const changeMonth = (next: typeof month) => {
    setMonth(next);
    setSelectedDay(null);
  };
  const toggleBlockedDay = async () => {
    if (!selectedDate) return;
    setBlockingDay(true);
    setError("");
    try {
      await api("lesson_block_day", {
        day: selectedDate,
        blocked: !selectedBlocked,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await refresh();
      notify(selectedBlocked ? "Дата открыта" : "Дата закрыта для новых занятий");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBlockingDay(false);
    }
  };
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
  return <div className="lesson-journal">
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
    <div className="lesson-journal-layout">
      <LessonCalendar
        selected={month}
        days={days}
        years={years}
        onChange={changeMonth}
        selectedDay={selectedDay}
        onDayChange={setSelectedDay}
        blockedDays={blockedDays}
      />
      <section className="lesson-schedule" aria-labelledby="lesson-schedule-title">
        <div className="lesson-schedule-header">
          <div>
            <h2 id="lesson-schedule-title" aria-live="polite">{scheduleTitle}</h2>
            {selectedBlocked && <span className="lesson-day-unavailable"><Lock size={13} aria-hidden="true" />Дата закрыта для новых занятий</span>}
          </div>
          {selectedDay !== null && (
            <div className="actions">
              {teacher && <button className="btn small" type="button" disabled={blockingDay} onClick={toggleBlockedDay}>
                {selectedBlocked ? <Unlock size={15} /> : <Lock size={15} />}
                {selectedBlocked ? "Открыть дату" : "Закрыть дату"}
              </button>}
              <button className="btn small quiet" type="button" onClick={() => setSelectedDay(null)}>Весь месяц</button>
            </div>
          )}
        </div>
        {error && <ErrorBox message={error} />}
        {schedule.size ? Array.from(schedule, ([day, records]) => (
          <div className="lesson-schedule-day" key={day}>
            {selectedDay === null && <h3 className="lesson-schedule-date">{agendaDay.format(new Date(month.year, month.month, day))}</h3>}
            <div className="lesson-record-list">
              {records.map((l) => {
                const status = l.status ?? "planned";
                const StatusIcon = status === "completed" ? CheckCircle2 : CalendarDays;
                const editable = teacher && data.students.some((s) => s.student_id === l.student_id && s.status === "active");
                const starts = new Date(l.starts_at);
                const participant = teacher
                  ? studentName(data, l.student_id)
                  : data.teachers.find((t) => t.teacher_id === l.teacher_id)?.display_name;
                return <article className="panel lesson-record" key={l.id}>
                  <header className="lesson-record-heading">
                    <time className="lesson-record-date" dateTime={l.starts_at}>
                      {lessonTime.format(starts)}
                    </time>
                    <div className="lesson-record-person">
                      <h3>{participant || "Занятие"}</h3>
                      <span className="lesson-record-duration"><Clock size={14} aria-hidden="true" />{l.duration_minutes} мин.</span>
                    </div>
                    <div className="actions lesson-record-controls">
                      <span className={`lesson-status ${status}`}><StatusIcon size={14} aria-hidden="true" />{lessonLabels[status]}</span>
                      {teacher && <button className="icon-btn" aria-label="Редактировать занятие" title="Редактировать занятие" disabled={!editable || busy === l.id} onClick={() => setModal(l)}><Pencil size={16} /></button>}
                    </div>
                  </header>
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
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </button>;
                    })}
                  </div>}
                  {editable && <div className="actions lesson-actions">
                    {status === "planned" && <button className="btn small" disabled={busy === l.id} onClick={() => changeStatus(l, "completed")}><CheckCircle2 size={15} />Провести</button>}
                    <button className="btn small" onClick={() => navigate(`homework-new/${l.student_id}/${l.id}`)}><ClipboardList size={15} aria-hidden="true" />Назначить домашнюю работу</button>
                    <button className="btn small quiet" disabled={busy === l.id} onClick={() => changeStatus(l, "canceled")}>Отменить</button>
                  </div>}
                </article>;
              })}
            </div>
          </div>
        )) : (
          <Empty title={selectedDay === null ? "В этом месяце нет занятий" : "В этот день нет занятий"} />
        )}
      </section>
    </div>
    {modal && teacher && <LessonForm record={modal === "new" ? undefined : modal} initialStudent={student} initialDate={selectedDate} onClose={() => setModal(null)} onSaved={(date) => { if (date) changeMonth(localLessonMonth(date)); setModal(null); }} />}
  </div>;
}
function LessonForm({
  record,
  initialStudent,
  initialDate,
  onClose,
  onSaved,
}: {
  record?: LessonRecord;
  initialStudent?: string;
  initialDate: string | null;
  onClose: () => void;
  onSaved: (date?: Date) => void;
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
  const localNow = localDateTime(new Date().toISOString());
  const defaultStart = record
    ? localDateTime(record.starts_at)
    : initialDate
      ? `${initialDate}${localNow.slice(10)}`
      : localNow;
  const save = async () => {
    setBusy(true);
    try {
      const date = new Date(startsInput.current!.value);
      await api("lesson_save", {
        id: record?.id,
        student_id: student,
        starts_at: date.toISOString(),
        duration_minutes: duration,
        status,
        comment,
        topic_ids: topics,
        homework_ids: works,
      });
      await refresh();
      notify("Занятие сохранено");
      onSaved(status === "canceled" ? undefined : date);
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
                defaultValue={defaultStart}
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
