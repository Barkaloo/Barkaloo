import { useRef, useState } from "react";
import { Paperclip, Plus, Search, X } from "lucide-react";
import { useApp } from "../context";
import { api, supabase } from "../lib/api";
import { dateTime } from "../lib/teaching";
import { theoryAccept, theoryFile } from "../lib/theory";
import { taskLabels, type HomeworkResource } from "../types";
import { Empty, ErrorBox, Field, Form, Modal } from "./ui";

export default function HomeworkForm({ initialStudent, initialLesson, onClose }: {
  initialStudent?: string; initialLesson?: string; onClose: () => void;
}) {
  const { data, refresh, navigate } = useApp();
  const [student, setStudent] = useState(initialStudent ?? ""), [lesson, setLesson] = useState(initialLesson ?? "");
  const [title, setTitle] = useState(""), [comment, setComment] = useState("");
  const [chosen, setChosen] = useState<string[]>([]), [query, setQuery] = useState("");
  const [links, setLinks] = useState<{ id: string; url: string }[]>([]), [files, setFiles] = useState<File[]>([]);
  const [manual, setManual] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const workId = useRef(crypto.randomUUID()), dueInput = useRef<HTMLInputElement>(null);
  const uploaded = useRef(new Map<File, HomeworkResource>());
  const tasks = data.assignable_tasks.filter((t) => `${t.title} ${t.statement}`.toLowerCase().includes(query.toLowerCase()));
  const cleanup = async (assigned: HomeworkResource[] = []) => {
    const paths = [...uploaded.current.values()].map((r) => r.path!).filter((path) => path && !assigned.some((r) => r.path === path));
    // Storage policy only allows removing files that were never assigned.
    if (paths.length) await supabase.storage.from("tutor-homework").remove(paths);
  };
  const close = () => { if (!busy) { void cleanup(); onClose(); } };
  const save = async () => {
    setBusy(true); setError("");
    try {
      const resources: HomeworkResource[] = links.map((l) => {
        const url = new URL(l.url.trim());
        if (!["https:", "http:"].includes(url.protocol)) throw Error("Ссылка должна начинаться с https:// или http://");
        return { kind: "link", url: url.href };
      });
      for (const file of files) {
        let resource = uploaded.current.get(file);
        if (!resource) {
          const { ext, mime } = await theoryFile(file);
          const path = `${data.profile.user_id}/${workId.current}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from("tutor-homework").upload(path, file, { contentType: mime, upsert: false });
          if (error) throw Error(`Не удалось загрузить ${file.name}: ${error.message}`);
          resource = { kind: "file", path, filename: file.name, mime_type: mime };
          uploaded.current.set(file, resource);
        }
        resources.push(resource);
      }
      const result = await api<{ id: string }>("homework_create", {
        id: workId.current, student_id: student, lesson_id: lesson || null, title, comment,
        due_at: dueInput.current?.value ? new Date(dueInput.current.value).toISOString() : null,
        task_ids: chosen, resources, requires_submission: manual,
      });
      await cleanup(resources);
      await refresh(); navigate(`homework/${result.id}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Modal title="Назначить домашнее задание" onClose={close} wide>
    {!data.students.some((s) => s.status === "active") ? <Empty title="Нет активных учеников" action="Открыть учеников" onAction={() => navigate("students")} /> : <Form onSubmit={save}>
      <fieldset className="homework-form-fields" disabled={busy}>
      <div className="form-grid">
        <Field label="Ученик"><select required value={student} onChange={(e) => { setStudent(e.target.value); setLesson(""); }}>
          <option value="">Выберите ученика</option>{data.students.filter((s) => s.status === "active").map((s) => <option key={s.student_id} value={s.student_id}>{s.nickname || s.display_name}</option>)}
        </select></Field>
        <Field label="Название работы"><input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      </div>
      <Field label="Инструкции"><textarea rows={3} maxLength={20000} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <div className="homework-attachment-editor">
        {links.map((link, index) => <div className="homework-link-input" key={link.id}>
          <Field label={`Ссылка ${index + 1}`}><input type="url" required placeholder="https://" value={link.url} onChange={(e) => setLinks((rows) => rows.map((l) => l.id === link.id ? { ...l, url: e.target.value } : l))} /></Field>
          <button type="button" className="icon-btn" aria-label={`Убрать ссылку ${index + 1}`} onClick={() => setLinks((rows) => rows.filter((l) => l.id !== link.id))}><X size={15} /></button>
        </div>)}
        <div className="actions">
          <button className="btn small" type="button" onClick={() => setLinks((rows) => [...rows, { id: crypto.randomUUID(), url: "" }])}><Plus size={15} />Добавить ссылку</button>
          <label className="btn small homework-file-picker"><Paperclip size={15} />Прикрепить файлы<input type="file" multiple accept={theoryAccept} aria-label="Файлы домашней работы" onChange={(e) => { const selected = Array.from(e.target.files ?? []); setFiles((rows) => [...rows, ...selected]); e.target.value = ""; }} /></label>
        </div>
        {files.length > 0 && <ul className="homework-upload-list">{files.map((file, index) => <li key={index}><span>{file.name}</span><button type="button" className="icon-btn" aria-label={`Убрать файл ${file.name}`} onClick={() => setFiles((rows) => rows.filter((_, i) => i !== index))}><X size={14} /></button></li>)}</ul>}
        <small className="field-hint">Документы и медиа до 50 МБ на файл.</small>
      </div>
      <details className="homework-task-picker">
        <summary>Задания из банка <span className="badge">{chosen.length}</span></summary>
        {data.assignable_tasks.length ? <>
          <label className="search teaching-search"><Search size={16} /><input aria-label="Поиск задания для домашней работы" placeholder="Название или условие…" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <div className="task-picker">{tasks.map((t) => <label key={t.id}>
            <input type="checkbox" checked={chosen.includes(t.id)} disabled={!chosen.includes(t.id) && chosen.length >= 100} onChange={(e) => setChosen((ids) => e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id))} />
            <span><strong>{t.bank_serial ? "№"+t.bank_serial+" · " : ""}{t.title}</strong><small>{data.modules.find((m) => m.id === t.module_id)?.title} · {taskLabels[t.type]}</small><p>{t.statement}</p></span>
          </label>)}{!tasks.length && <p className="inline-empty">Задания не найдены.</p>}</div>
        </> : <p className="inline-empty">В банке пока нет опубликованных заданий.</p>}
      </details>
      <label className="homework-manual-toggle"><input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} /><span>Нужен отдельный ответ ученика с ручной проверкой</span></label>
      {!manual && chosen.length === 0 && <p className="field-hint">Материалы без заданий и отдельного ответа будут доступны только для изучения. Работа сразу получит статус «Выполнена».</p>}
      <div className="form-grid">
        <Field label="Срок сдачи" hint="Необязательно"><input type="datetime-local" ref={dueInput} /></Field>
        <Field label="Занятие"><select value={lesson} onChange={(e) => setLesson(e.target.value)}><option value="">Без привязки к занятию</option>{data.lessons.filter((l) => l.student_id === student && l.status !== "canceled").map((l) => <option key={l.id} value={l.id}>{dateTime(l.starts_at)}</option>)}</select></Field>
      </div>
      </fieldset>
      {error && <ErrorBox message={error} />}
      <div className="modal-actions"><button className="btn" type="button" disabled={busy} onClick={close}>Отмена</button><button className="btn primary" disabled={busy || !student || !(chosen.length || comment.trim() || files.length || links.length)}>{busy ? "Назначение…" : "Назначить работу"}</button></div>
    </Form>}
  </Modal>;
}
