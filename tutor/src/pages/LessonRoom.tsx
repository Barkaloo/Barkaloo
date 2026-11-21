import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, Code2, PenLine } from "lucide-react";
import { useApp } from "../context";
import { api } from "../lib/api";
import { dateTime, lessonLabels, studentName } from "../lib/teaching";
import { Busy, Empty, ErrorBox } from "../components/ui";
import { LessonBoard, type BoardMark } from "../components/LessonBoard";
import { LessonPython } from "../components/LessonPython";

type Area = "teacher" | "student";
type Mode = "board" | "code";
type Draft = { code: string; notes: string; revision: number; mode: Mode; board: BoardMark[] };
type Room = Record<Area, Draft>;
const emptyDraft: Draft = { code: "", notes: "", revision: 0, mode: "board", board: [] };

function readDraft(draft?: Draft): Draft {
  if (!draft) return emptyDraft;
  const board = Array.isArray(draft.board) ? draft.board.filter((mark) =>
    mark && typeof mark.id === "string" &&
    ["pen", "line", "rectangle", "ellipse", "text"].includes(mark.kind) &&
    Array.isArray(mark.points) && mark.points.length > 0 && mark.points.length <= 1000 &&
    mark.points.every((point) => Array.isArray(point) && point.length === 2 &&
      point.every((value) => Number.isInteger(value) && value >= 0 && value <= 1000)) &&
    (mark.kind !== "text" || typeof mark.text === "string"),
  ) : [];
  return { ...draft, mode: draft.mode === "code" ? "code" : "board", board };
}

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
  const [room, setRoom] = useState<Room | null>(null);
  const [readError, setReadError] = useState("");
  const [dirty, setDirty] = useState({ teacher: false, student: false });

  const updateArea = useCallback((area: Area, draft: Draft) => {
    setRoom((current) => !current || draft.revision < current[area].revision
      ? current
      : { ...current, [area]: draft });
  }, []);
  const load = useCallback(async () => {
    const result = await api<Partial<Room>>("lesson_room_read", { lesson_id: id }, AbortSignal.timeout(12000));
    return { teacher: readDraft(result.teacher), student: readDraft(result.student) };
  }, [id]);

  useEffect(() => {
    if (!available) return;
    let active = true;
    let reading = false;
    const refresh = async () => {
      if (reading || document.visibilityState === "hidden") return;
      reading = true;
      try {
        const next = await load();
        if (!active) return;
        setRoom((current) => current ? {
          teacher: next.teacher.revision > current.teacher.revision ? next.teacher : current.teacher,
          student: next.student.revision > current.student.revision ? next.student : current.student,
        } : next);
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
  }, [available, load]);

  const hasChanges = dirty.teacher || dirty.student;
  useEffect(() => {
    setUnsaved(hasChanges);
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      setUnsaved(false);
    };
  }, [hasChanges, setUnsaved]);

  if (!lesson || preview) return <Empty title="Урок недоступен" action="Журнал занятий" onAction={() => navigate("lessons")} />;

  return (
    <div className="lesson-room">
      <header className="lesson-room-header">
        <button className="back-link" type="button" onClick={() => navigate("lesson-room")}>
          <ArrowLeft size={16} aria-hidden="true" />К списку уроков
        </button>
        <h1>Урок <span>{dateTime(lesson.starts_at)}</span></h1>
      </header>
      {readError && <ErrorBox message={readError} />}
      {!room && !readError && <Busy text="Открываем урок…" />}
      {room && (
        <div className="lesson-room-grid">
          <WorkspacePane area="teacher" lessonId={id} remote={room.teacher} editable={teacher}
            connected={!readError} updateArea={updateArea} load={load} setDirty={setDirty} />
          <WorkspacePane area="student" lessonId={id} remote={room.student} editable
            connected={!readError} updateArea={updateArea} load={load} setDirty={setDirty} />
        </div>
      )}
    </div>
  );
}

function WorkspacePane({ area, lessonId, remote, editable, connected, updateArea, load, setDirty }: {
  area: Area;
  lessonId: string;
  remote: Draft;
  editable: boolean;
  connected: boolean;
  updateArea: (area: Area, draft: Draft) => void;
  load: () => Promise<Room>;
  setDirty: Dispatch<SetStateAction<Record<Area, boolean>>>;
}) {
  const [local, setLocal] = useState<Draft | null>(null);
  const [view, setView] = useState<{ mode: Mode; remoteMode: Mode } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const draft = local ?? remote;
  const conflicting = local !== null && (local.revision < remote.revision || error.startsWith("Область уже изменили"));
  const mode = !editable && view?.remoteMode === remote.mode ? view.mode : draft.mode;
  const title = area === "teacher" ? "Область преподавателя" : "Область ученика";
  const canEdit = editable && connected && !conflicting;

  useEffect(() => {
    setDirty((current) => current[area] === Boolean(local) ? current : { ...current, [area]: Boolean(local) });
  }, [area, local, setDirty]);

  const save = useCallback(async () => {
    if (!local || saving || conflicting || !connected) return;
    setSaving(true);
    setError("");
    try {
      const { revision } = await api<{ revision: number }>("lesson_room_save", {
        lesson_id: lessonId, area, ...local,
      }, AbortSignal.timeout(12000));
      updateArea(area, { ...local, revision });
      setLocal((current) => current && current !== local ? { ...current, revision } : null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }, [area, conflicting, connected, lessonId, local, saving, updateArea]);

  useEffect(() => {
    if (!local || error || saving || conflicting || !connected) return;
    const timer = window.setTimeout(() => { void save(); }, 650);
    return () => window.clearTimeout(timer);
  }, [connected, conflicting, error, local, save, saving]);

  const change = (patch: Partial<Draft>) => {
    if (!canEdit) return;
    setError("");
    setLocal((current) => ({ ...(current ?? remote), ...patch }));
  };

  const reload = async () => {
    setSaving(true);
    try {
      updateArea(area, (await load())[area]);
      setLocal(null);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="lesson-room-pane" aria-label={title}>
      <header className="lesson-pane-header">
        <div>
          <h2>{title}</h2>
          {editable && <span className="muted" role="status">{saving ? "Сохраняем…" : local ? "Есть изменения" : "Сохранено"}</span>}
          {!editable && <span className="muted">Только просмотр</span>}
        </div>
        <div className="lesson-pane-modes" role="group" aria-label={`Режим: ${title.toLowerCase()}`}>
          {([["board", "Доска", PenLine], ["code", "Код", Code2]] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" aria-pressed={mode === value} disabled={editable && !canEdit}
              onClick={() => {
                if (!editable) setView({ mode: value, remoteMode: remote.mode });
                else if (value !== mode) change({ mode: value });
              }}><Icon size={16} aria-hidden="true" />{label}</button>
          ))}
        </div>
      </header>
      {(conflicting || error) && (
        <div className="lesson-pane-feedback">
          <ErrorBox message={conflicting ? "Область уже изменили. Скопируйте нужное перед загрузкой актуальной версии." : error} />
          <button className="btn small" type="button" disabled={saving || !connected}
            onClick={() => void (conflicting ? reload() : save())}>
            {conflicting ? "Загрузить актуальную версию" : "Повторить сохранение"}
          </button>
        </div>
      )}
      {mode === "board" ? (
        <LessonBoard marks={draft.board} editable={canEdit} onChange={(board) => change({ board })} />
      ) : (
        <div className="lesson-code-workspace">
          <LessonPython label={`Python: ${title.toLowerCase()}`} code={draft.code} canRun={editable}
            onChange={canEdit ? (code) => change({ code }) : undefined} />
          <details>
            <summary>Заметки</summary>
            <textarea aria-label="Заметки к коду" rows={3} maxLength={12000} value={draft.notes}
              readOnly={!canEdit} onChange={(event) => change({ notes: event.target.value })} />
          </details>
        </div>
      )}
    </section>
  );
}
