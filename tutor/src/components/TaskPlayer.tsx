import { useRef, useState } from "react";
import { CheckCircle2, XCircle, Clock3, RotateCcw, Send } from "lucide-react";
import { useApp } from "../context";
import { answerLabel, api } from "../lib/api";
import { taskLabels, type Task, type Answer, type Attempt } from "../types";
import { ErrorBox } from "./ui";
import BankRichText from "./BankRichText";
export default function TaskPlayer({
  task,
  homeworkItemId,
}: {
  task: Task;
  homeworkItemId?: string;
}) {
  const { preview, refresh, data } = useApp();
  const [answer, setAnswer] = useState<Answer>(
      task.type === "multiple" ? [] : "",
    ),
    [submittedResult, setResult] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef(crypto.randomUUID());
  const attempts = data.attempts.filter(
    (a) =>
      a.task_id === task.id &&
      (homeworkItemId
        ? a.homework_item_id === homeworkItemId
        : !a.homework_item_id),
  );
  const result = submittedResult
    ? (data.attempts.find((a) => a.id === submittedResult.id) ??
      submittedResult)
    : null;
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const attempt = await api<Attempt>("attempt", {
        task_id: task.id,
        version: task.version,
        answer,
        preview,
        request_id: request.current,
        homework_item_id: homeworkItemId,
      });
      setResult(attempt);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const retry = () => {
    request.current = crypto.randomUUID();
    setAnswer(task.type === "multiple" ? [] : "");
    setResult(null);
    setError("");
  };
  return (
    <article className="task-player panel" id={`task-${task.id}`}>
      <div className="task-meta">
        <span className="badge">{taskLabels[task.type]}</span>
        <span>
          {["", "Базовая", "Средняя", "Повышенная"][task.difficulty]} сложность
        </span>
        {task.prototype && <span>{task.prototype}</span>}
      </div>
      <h3>{task.title}</h3>
      {task.statement_doc ? <BankRichText readOnly value={task.statement_doc}/> : <p className="task-statement">{task.statement}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <fieldset disabled={busy || !!result} className="answer-fieldset">
          <legend className="sr-only">Ваш ответ</legend>
          {task.type === "single" || task.type === "multiple" ? (
            <div className="answer-options">
              {task.options.map((o) => (
                <label
                  key={o.id}
                  className={
                    (
                      Array.isArray(answer)
                        ? answer.includes(o.id)
                        : answer === o.id
                    )
                      ? "chosen"
                      : ""
                  }
                >
                  <input
                    type={task.type === "single" ? "radio" : "checkbox"}
                    name={`answer-${task.id}`}
                    checked={
                      Array.isArray(answer)
                        ? answer.includes(o.id)
                        : answer === o.id
                    }
                    onChange={(e) =>
                      setAnswer(
                        task.type === "single"
                          ? o.id
                          : e.target.checked
                            ? [...(Array.isArray(answer) ? answer : []), o.id]
                            : (Array.isArray(answer) ? answer : []).filter(
                                (v) => v !== o.id,
                              ),
                      )
                    }
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          ) : task.type === "manual" ? (
            <textarea
              required
              rows={5}
              aria-label="Ваш ответ для преподавателя"
              placeholder="Опишите решение и ход рассуждений"
              value={answer as string}
              onChange={(e) => setAnswer(e.target.value)}
            />
          ) : (
            <input
              required
              className="answer-input"
              inputMode={task.type === "number" ? "decimal" : "text"}
              aria-label="Ваш ответ"
              placeholder={
                task.type === "number" ? "Введите число" : "Введите ответ"
              }
              value={answer as string}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}
        </fieldset>
        {error && <ErrorBox message={error} />}
        <div className="task-actions">
          {result ? (
            <button type="button" className="btn" onClick={retry}>
              <RotateCcw size={15} />
              Решить ещё раз
            </button>
          ) : (
            <button
              className="btn primary"
              disabled={
                busy ||
                (Array.isArray(answer) ? answer.length === 0 : !answer.trim())
              }
            >
              <Send size={15} />
              {busy
                ? "Проверяем…"
                : task.type === "manual"
                  ? "Отправить преподавателю"
                  : "Проверить ответ"}
            </button>
          )}
          <small className="muted">
            {attempts.length ? `Попыток: ${attempts.length}` : ""}
          </small>
        </div>
      </form>
      {result && (
        <div className={`verdict ${result.status}`} role="status">
          <div className="verdict-title">
            {result.status === "correct" ? (
              <CheckCircle2 size={20} />
            ) : result.status === "wrong" ? (
              <XCircle size={20} />
            ) : (
              <Clock3 size={20} />
            )}
            <strong>
              {result.status === "correct"
                ? "Верно!"
                : result.status === "wrong"
                  ? "Неверный ответ"
                  : "Ожидает проверки преподавателем"}
            </strong>
          </div>
          {result.status === "wrong" && (
            <p>
              Добавлено в работу над ошибками.
            </p>
          )}
          {result.feedback.answer !== undefined && (
            <p>
              <strong>Правильный ответ: </strong>
              {answerLabel(result.feedback.answer, task)}
            </p>
          )}
          {result.feedback.solution && (
            <div className="solution">
              <strong>Разбор решения</strong>
              <p>{result.feedback.solution}</p>
            </div>
          )}
          {result.feedback.common_mistakes && (
            <p>
              <strong>На что обратить внимание: </strong>
              {result.feedback.common_mistakes}
            </p>
          )}

        </div>
      )}
      {attempts.length > 0 && (
        <details className="attempt-history">
          <summary>История попыток · {attempts.length}</summary>
          {attempts.map((a) => (
            <div key={a.id}>
              <time>{new Date(a.created_at).toLocaleString("ru-RU")}</time>
              <span>{answerLabel(a.answer, a.task_snapshot)}</span>
              <span className={`status ${a.status}`}>
                {a.status === "correct"
                  ? "Верно"
                  : a.status === "wrong"
                    ? "Ошибка"
                    : "На проверке"}
              </span>
              {a.feedback.comment && <p>{a.feedback.comment}</p>}
              {a.feedback.answer !== undefined && <p>Правильный ответ: {answerLabel(a.feedback.answer, a.task_snapshot)}</p>}
              {a.feedback.solution && <p>Решение: {a.feedback.solution}</p>}
              {a.feedback.common_mistakes && <p>{a.feedback.common_mistakes}</p>}
            </div>
          ))}
        </details>
      )}
    </article>
  );
}
