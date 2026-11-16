import { useRef, useState } from "react";
import { Plus, Pencil, CalendarDays } from "lucide-react";
import { useApp } from "../context";
import { api } from "../lib/api";
import { dateTime, localDateTime, studentName } from "../lib/teaching";
import type { LessonRecord } from "../types";
import { Empty, ErrorBox, Field, Form, Modal } from "../components/ui";
export default function Lessons() {
  const { data, teacher } = useApp();
  const [student, setStudent] = useState(""),
    [modal, setModal] = useState<LessonRecord | "new" | null>(null);
  if (!teacher) return <Empty title="Журнал доступен преподавателю" />;
  const lessons = data.lessons.filter(
    (l) => !student || l.student_id === student,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Последовательность и внимание</span>
          <h1>Журнал занятий</h1>
          <p>Даты, пройденные темы, домашние работы и ваши наблюдения.</p>
        </div>
        <button className="btn primary" onClick={() => setModal("new")}>
          <Plus size={16} />
          Добавить занятие
        </button>
      </div>
      <div className="filter-bar">
        <select
          aria-label="Ученик в журнале занятий"
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
      </div>
      {lessons.length ? (
        <div className="lesson-record-list">
          {lessons.map((l) => (
            <article className="panel lesson-record" key={l.id}>
              <div className="spread">
                <div className="actions">
                  <CalendarDays size={19} />
                  <h2>{dateTime(l.starts_at)}</h2>
                </div>
                <button
                  className="icon-btn"
                  aria-label="Редактировать занятие"
                  disabled={
                    !data.students.some(
                      (s) =>
                        s.student_id === l.student_id && s.status === "active",
                    )
                  }
                  onClick={() => setModal(l)}
                >
                  <Pencil size={16} />
                </button>
              </div>
              <div className="lesson-record-meta">
                <strong>{studentName(data, l.student_id)}</strong>
                <span>{l.duration_minutes} минут</span>
                {new Date(l.starts_at).getTime() > Date.now() && (
                  <span className="badge neutral">Запланировано</span>
                )}
              </div>
              <div className="topic-tags">
                {l.topic_ids.map((id) => (
                  <span className="badge" key={id}>
                    {data.topics.find((t) => t.id === id)?.title ??
                      "Учебная тема"}
                  </span>
                ))}
              </div>
              {l.comment && <p className="private-note">{l.comment}</p>}
              {l.homework_ids.length > 0 && (
                <div className="lesson-record-homework">
                  <strong>Домашние работы</strong>
                  {l.homework_ids.map((id) => (
                    <HomeworkLink key={id} id={id} />
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Журнал пока пуст"
          action="Добавить занятие"
          onAction={() => setModal("new")}
        >
          Запишите первое занятие или запланируйте следующее.
        </Empty>
      )}
      {modal && (
        <LessonForm
          record={modal === "new" ? undefined : modal}
          initialStudent={student}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
function HomeworkLink({ id }: { id: string }) {
  const { data, navigate } = useApp();
  return (
    <button className="text-btn" onClick={() => navigate(`homework/${id}`)}>
      {data.homeworks.find((h) => h.id === id)?.title ?? "Домашняя работа"}
    </button>
  );
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
