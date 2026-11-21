import { useRef, useState } from "react";
import { useApp } from "../context";
import { api } from "../lib/api";
import { dateTime, homeworkSummary } from "../lib/teaching";
import type { Homework } from "../types";
import { ErrorBox, Field, Form } from "./ui";
const labels = { pending: "На проверке", accepted: "Выполнено", returned: "На доработку" };
export default function HomeworkResponse({ work }: { work: Homework }) {
  const { data, teacher, preview, refresh } = useApp();
  const summary = homeworkSummary(work, data.attempts, preview), submission = summary.submission;
  const [answer, setAnswer] = useState(submission?.answer ?? ""), [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const request = useRef(crypto.randomUUID());
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await api("homework_submit", { id: work.id, answer, preview, request_id: request.current });
      request.current = crypto.randomUUID();
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const review = async (status: "accepted" | "returned") => {
    setBusy(true); setError("");
    try {
      await api("homework_review", { id: work.id, submission_id: submission?.id ?? null, status, feedback });
      await refresh(); setFeedback("");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="panel teaching-section homework-response">
    <div className="spread"><h2>Ответ преподавателю</h2>{submission && <span className={`badge ${submission.status === "accepted" ? "green" : "neutral"}`}>{labels[submission.status]}</span>}</div>
    {submission ? <div className="homework-submission">
      <p className="private-note">{submission.answer || "Выполнение отмечено преподавателем."}</p>
      <small className="muted">{dateTime(submission.submitted_at)}</small>
      {submission.feedback && <p className="private-note homework-feedback">{submission.feedback}</p>}
    </div> : <p className="inline-empty">Ответ пока не отправлен.</p>}
    {!work.canceled_at && (teacher ? <div className="homework-review-form">
      <Field label="Комментарий к проверке"><textarea rows={2} maxLength={20000} value={feedback} disabled={busy} onChange={(e) => setFeedback(e.target.value)} /></Field>
      <div className="actions">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void review("accepted")}>Подтвердить выполнение</button>
        <button type="button" className="btn" disabled={busy || !submission} onClick={() => void review("returned")}>На доработку</button>
      </div>
    </div> : (!submission || submission.status === "returned") ? <Form onSubmit={submit}>
      <Field label="Ваш ответ преподавателю"><textarea required rows={5} maxLength={20000} value={answer} disabled={busy} onChange={(e) => setAnswer(e.target.value)} /></Field>
      <button className="btn primary" disabled={busy || !answer.trim()}>{busy ? "Отправка…" : "Отправить на проверку"}</button>
    </Form> : null)}
    {error && <ErrorBox message={error} />}
    {(work.submissions?.length ?? 0) > 1 && <details className="attempt-history"><summary>История ответов · {work.submissions!.length}</summary>{work.submissions!.map((row) => <div key={row.id}><time>{dateTime(row.submitted_at)}</time><span className="private-note">{row.answer || "Отмечено преподавателем"}</span><span>{labels[row.status]}</span>{row.feedback && <p>{row.feedback}</p>}</div>)}</details>}
  </section>;
}
