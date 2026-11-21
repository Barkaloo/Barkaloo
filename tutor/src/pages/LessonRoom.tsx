import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Code2, Play, Square } from "lucide-react";
import { useApp } from "../context";
import { api } from "../lib/api";
import { dateTime, lessonLabels, studentName } from "../lib/teaching";
import { Busy, Empty, ErrorBox, Field } from "../components/ui";

type Draft = { code: string; notes: string; revision: number };
type Room = Partial<Record<"teacher" | "student", Draft>>;
const emptyDraft: Draft = { code: "", notes: "", revision: 0 };

export default function LessonRoom({ id }: { id?: string }) {
  return id ? <LessonWorkspace id={id} /> : <LessonRoomList />;
}

function LessonRoomList() {
  const { data, teacher, preview, navigate } = useApp();
  const activeStudents = new Set(
    data.students.filter((student) => student.status === "active").map((student) => student.student_id),
  );
  const lessons = preview ? [] : data.lessons
    .filter((lesson) => lesson.status !== "canceled" && (!teacher || activeStudents.has(lesson.student_id)))
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  return (
    <>
      <div className="page-heading"><h1>Урок</h1></div>
      {lessons.length ? (
        <div className="lesson-record-list">
          {lessons.map((lesson) => {
            const participant = teacher
              ? studentName(data, lesson.student_id)
              : data.teachers.find((item) => item.teacher_id === lesson.teacher_id)?.display_name;
            const status = lesson.status ?? "planned";
            return (
              <article className="panel lesson-record lesson-room-entry" key={lesson.id}>
                <div>
                  <h2>{participant || "Занятие"}</h2>
                  <p className="muted">{dateTime(lesson.starts_at)} · {lesson.duration_minutes} мин.</p>
                </div>
                <div className="actions">
                  <span className={`lesson-status ${status}`}>{lessonLabels[status]}</span>
                  <button className="btn small" type="button" onClick={() => navigate(`lesson-room/${lesson.id}`)}>
                    Открыть урок<ArrowRight size={15} aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <Empty title="Доступных уроков пока нет" action="Журнал занятий" onAction={() => navigate("lessons")} />}
    </>
  );
}

function LessonWorkspace({ id }: { id: string }) {
  const { data, teacher, preview, navigate, setUnsaved } = useApp();
  const lesson = data.lessons.find((item) => item.id === id && item.status !== "canceled");
  const available = Boolean(lesson) && !preview;
  const ownRole = teacher ? "teacher" : "student";
  const otherRole = teacher ? "student" : "teacher";
  const [draft, setDraft] = useState<Draft | null>(null);
  const [other, setOther] = useState(emptyDraft);
  const [readError, setReadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const saved = useRef(emptyDraft);
  const initialized = useRef(false);

  useEffect(() => {
    if (!available) return;
    let active = true;
    let reading = false;
    const refresh = async () => {
      if (reading || document.visibilityState === "hidden") return;
      reading = true;
      try {
        const room = await api<Room>("lesson_room_read", { lesson_id: id }, AbortSignal.timeout(12000));
        if (!active) return;
        if (!initialized.current) {
          saved.current = room[ownRole] ?? emptyDraft;
          setDraft(saved.current);
          initialized.current = true;
        }
        setOther(room[otherRole] ?? emptyDraft);
        setReadError("");
      } catch (error) {
        if (active) setReadError((error as Error).message);
      } finally {
        reading = false;
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 2500);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [available, id, ownRole, otherRole]);

  const dirty = draft !== null && (
    draft.revision !== saved.current.revision ||
    draft.code !== saved.current.code || draft.notes !== saved.current.notes
  );
  const save = useCallback(async () => {
    if (!draft || !dirty || saving || readError) return;
    setSaving(true);
    setSaveError("");
    try {
      const { revision } = await api<{ revision: number }>("lesson_room_save", {
        lesson_id: id,
        code: draft.code,
        notes: draft.notes,
        revision: draft.revision,
      }, AbortSignal.timeout(12000));
      saved.current = { ...draft, revision };
      setDraft((current) => current && { ...current, revision });
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }, [draft, dirty, id, readError, saving]);

  useEffect(() => {
    if (!dirty || saving || saveError || readError) return;
    const timer = window.setTimeout(() => { void save(); }, 650);
    return () => window.clearTimeout(timer);
  }, [dirty, save, saving, saveError, readError]);
  useEffect(() => {
    setUnsaved(dirty);
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      setUnsaved(false);
    };
  }, [dirty, setUnsaved]);

  if (!lesson || preview) return <Empty title="Урок недоступен" action="Журнал занятий" onAction={() => navigate("lessons")} />;
  const updateDraft = (change: Partial<Draft>) => {
    setSaveError("");
    setDraft((current) => current && { ...current, ...change });
  };

  return (
    <>
      <button className="back-link" type="button" onClick={() => navigate("lesson-room")}>
        <ArrowLeft size={16} />К списку уроков
      </button>
      <div className="page-heading">
        <div><h1>Режим урока</h1><p>{dateTime(lesson.starts_at)}</p></div>
        {draft && (
          <div className="actions">
            <span className="muted" role="status">{saving ? "Сохраняем…" : dirty ? "Есть изменения" : "Сохранено"}</span>
            <button className="btn" type="button" disabled={!dirty || saving || Boolean(readError)} onClick={() => void save()}>Сохранить</button>
          </div>
        )}
      </div>
      {readError && <ErrorBox message={readError} />}
      {saveError && <ErrorBox message={saveError} />}
      {!draft && !readError && <Busy text="Открываем урок…" />}
      {draft && (
        <div className="lesson-room-grid">
          <section className="panel lesson-room-pane" aria-labelledby="own-workspace">
            <h2 id="own-workspace">Моя рабочая область</h2>
            <Field label="Python">
              <textarea className="lesson-room-code" rows={12} spellCheck={false} maxLength={30000}
                value={draft.code} onChange={(event) => updateDraft({ code: event.target.value })} disabled={Boolean(readError)} />
            </Field>
            <PythonRunner code={draft.code} />
            <Field label="Заметки">
              <textarea rows={4} maxLength={12000} value={draft.notes}
                onChange={(event) => updateDraft({ notes: event.target.value })} disabled={Boolean(readError)} />
            </Field>
          </section>
          <section className="panel lesson-room-pane" aria-labelledby="other-workspace">
            <h2 id="other-workspace">{teacher ? "Рабочая область ученика" : "Рабочая область преподавателя"}</h2>
            <div className="code-block">
              <div><Code2 size={16} aria-hidden="true" />Python</div>
              <pre className="lesson-room-peer" tabIndex={0} aria-label="Код второго участника"><code>{other.code || "Кода пока нет"}</code></pre>
            </div>
            <h3>Заметки</h3>
            <p className="lesson-room-notes">{other.notes || "Заметок пока нет"}</p>
          </section>
        </div>
      )}
    </>
  );
}

function PythonRunner({ code }: { code: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [input, setInput] = useState("");
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== "null") return;
      const message = event.data;
      if (message?.type === "python-ready") setReady(true);
      if (message?.type === "python-result" && typeof message.text === "string") {
        setOutput(message.text);
        setRunning(false);
      }
    };
    window.addEventListener("message", receive);
    const target = frame.current?.contentWindow;
    target?.postMessage({ type: "python-ready?" }, "*");
    return () => window.removeEventListener("message", receive);
  }, []);
  const run = () => {
    setOutput("Запуск Python…");
    setRunning(true);
    frame.current?.contentWindow?.postMessage({ type: "python-run", code, input }, "*");
  };
  return (
    <>
      <iframe ref={frame} src={import.meta.env.BASE_URL + "python-runner/index.html?v=2"}
        title="Изолированная среда Python" sandbox="allow-scripts" referrerPolicy="no-referrer" hidden />
      <details>
        <summary>Входные данные для input()</summary>
        <textarea aria-label="Входные данные Python" rows={2} maxLength={10000}
          value={input} onChange={(event) => setInput(event.target.value)} />
      </details>
      <div className="actions">
        <button className="btn primary small" type="button" disabled={!ready || running || !code.trim()} onClick={run}>
          <Play size={15} aria-hidden="true" />Запустить
        </button>
        <button className="btn small" type="button" disabled={!running}
          onClick={() => frame.current?.contentWindow?.postMessage({ type: "python-stop" }, "*")}>
          <Square size={14} aria-hidden="true" />Остановить
        </button>
      </div>
      {output && <pre role="status" className="lesson-room-output">{output}</pre>}
    </>
  );
}
