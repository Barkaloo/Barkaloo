import { useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "../context";
import { api, formatDate } from "../lib/api";
import { today } from "../lib/teaching";
import type { StudentNote } from "../types";
import { ErrorBox, Field, Form, Modal } from "./ui";

export default function StudentNotes({ studentId }: { studentId: string }) {
  const { data, refresh } = useApp();
  const [editor, setEditor] = useState<{ note?: StudentNote } | null>(null);
  const [removing, setRemoving] = useState<StudentNote | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const notes = (data.student_notes ?? []).filter((n) => n.student_id === studentId)
    .slice().sort((a, b) => b.noted_on.localeCompare(a.noted_on) || b.created_at.localeCompare(a.created_at));
  const remove = async (note: StudentNote) => {
    setBusy(true); setError("");
    try {
      await api("student_note_delete", { id: note.id, student_id: studentId });
      await refresh();
      setRemoving(null);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="panel student-notes">
    <div className="spread">
      <h2>Заметки преподавателя</h2>
      <button className="icon-btn" aria-label="Добавить заметку" onClick={() => setEditor({})}><Plus size={17} /></button>
    </div>
    {error && <ErrorBox message={error} />}
    {notes.length ? <div className="student-note-list">{notes.map((note) => <article key={note.id} className="student-note-entry">
      <div className="spread"><time dateTime={note.noted_on}>{formatDate(note.noted_on)}</time><div className="actions">
        <button className="icon-btn" aria-label="Редактировать заметку" disabled={busy} onClick={() => setEditor({ note })}><Pencil size={14} /></button>
        <button className="icon-btn" aria-label="Удалить заметку" disabled={busy} onClick={() => setRemoving(note)}><Trash2 size={14} /></button>
      </div></div>
      <p className="private-note">{note.body}</p>
    </article>)}</div> : <p className="inline-empty">Заметок пока нет.</p>}
    {editor && <NoteForm key={editor.note?.id ?? "new"} studentId={studentId} note={editor.note} onClose={() => setEditor(null)} />}
    {removing && <Modal title="Удалить заметку?" onClose={() => { if (!busy) setRemoving(null); }}>
      {error && <ErrorBox message={error} />}
      <div className="modal-actions"><button className="btn" disabled={busy} onClick={() => setRemoving(null)}>Отмена</button><button className="btn primary" disabled={busy} onClick={() => void remove(removing)}>{busy ? "Удаление…" : "Удалить"}</button></div>
    </Modal>}
  </section>;
}
function NoteForm({ studentId, note, onClose }: { studentId: string; note?: StudentNote; onClose: () => void }) {
  const { refresh } = useApp();
  const [body, setBody] = useState(note?.body ?? ""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const date = useRef<HTMLInputElement>(null);
  const save = async () => {
    setBusy(true); setError("");
    try {
      await api("student_note_save", { id: note?.id, student_id: studentId, body, noted_on: date.current?.value });
      await refresh(); onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Modal title={note ? "Редактировать заметку" : "Новая заметка"} onClose={onClose}>
    <Form onSubmit={save}>
      <Field label="Дата записи"><input type="date" required ref={date} defaultValue={note?.noted_on ?? today()} /></Field>
      <Field label="Текст заметки"><textarea autoFocus required rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      {error && <ErrorBox message={error} />}
      <div className="modal-actions"><button type="button" className="btn" disabled={busy} onClick={onClose}>Отмена</button><button className="btn primary" disabled={busy || !body.trim()}>{busy ? "Сохранение…" : "Сохранить"}</button></div>
    </Form>
  </Modal>;
}
