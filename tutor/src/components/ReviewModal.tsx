import { useState } from "react";
import { useApp } from "../context";
import { api, answerLabel } from "../lib/api";
import type { Attempt } from "../types";
import { Modal, Field, Form, ErrorBox } from "./ui";
export default function ReviewModal({
  attempt,
  onClose,
}: {
  attempt: Attempt;
  onClose: () => void;
}) {
  const { data, refresh, notify } = useApp();
  const [status, setStatus] = useState("correct"),
    [comment, setComment] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const task = data.tasks.find((t) => t.id === attempt.task_id);
  const save = async () => {
    setBusy(true);
    try {
      await api("review", { attempt_id: attempt.id, status, comment });
      await refresh();
      notify("Результат проверки сохранён");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Проверка ответа" onClose={onClose}>
      <Form onSubmit={save}>
        <h3>{attempt.task_snapshot.title}</h3>
        <p className="task-statement">{attempt.task_snapshot.statement}</p>
        <span className="eyebrow">Ответ ученика</span>
        <p className="student-answer">
          {answerLabel(attempt.answer, attempt.task_snapshot)}
        </p>
        <Field label="Критерии">
          <p>{attempt.criteria || task?.criteria || "Критерии не указаны"}</p>
        </Field>
        <Field label="Результат">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="correct">Верно</option>
            <option value="wrong">Нужна доработка</option>
          </select>
        </Field>
        <Field label="Комментарий ученику">
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <div className="modal-actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить результат"}
          </button>
        </div>
      </Form>
    </Modal>
  );
}
