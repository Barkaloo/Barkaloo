import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { taskLabels, type Task, type TaskType } from "../types";
import { ErrorBox, Field, Form, Modal } from "./ui";
export default function TaskForm({
  moduleId,
  task,
  onClose,
  onSaved,
}: {
  moduleId: string;
  task?: Task;
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Task>>({
    title: "",
    statement: "",
    type: "number",
    difficulty: 1,
    answer: "",
    prototype: "",
    solution: "",
    common_mistakes: "",
    criteria: "",
    reveal: "after_attempt",
    ignore_case: false,
    collapse_spaces: false,
    options: [
      { id: crypto.randomUUID(), label: "" },
      { id: crypto.randomUUID(), label: "" },
    ],
    ...task,
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = <K extends keyof Task>(key: K, value: Task[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("task_save", {
        ...form,
        module_id: moduleId,
      });
      await onSaved(result.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={task ? "Редактирование задания" : "Новое практическое задание"}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <Form onSubmit={save}>
        <div className="form-grid">
          <Field label="Название">
            <input
              required
              maxLength={200}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Краткое название задания"
            />
          </Field>
          <Field label="Тип ответа">
            <select
              value={form.type}
              onChange={(e) => {
                set("type", e.target.value as TaskType);
                set("answer", e.target.value === "multiple" ? [] : "");
              }}
            >
              {Object.entries(taskLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Условие">
          <textarea
            required
            rows={5}
            value={form.statement}
            onChange={(e) => set("statement", e.target.value)}
            placeholder="Введите условие своего задания"
          />
        </Field>
        <div className="form-grid">
          <Field label="Прототип">
            <input
              value={form.prototype}
              onChange={(e) => set("prototype", e.target.value)}
              placeholder="Необязательно"
            />
          </Field>
          <Field label="Сложность">
            <select
              value={form.difficulty}
              onChange={(e) => set("difficulty", +e.target.value)}
            >
              <option value={1}>Базовая</option>
              <option value={2}>Средняя</option>
              <option value={3}>Повышенная</option>
            </select>
          </Field>
        </div>
        {form.type === "single" || form.type === "multiple" ? (
          <div className="field">
            <span>Варианты ответа · отметьте правильные</span>
            {form.options?.map((option, index) => (
              <div className="option-edit" key={option.id}>
                <input
                  type={form.type === "single" ? "radio" : "checkbox"}
                  name="correct-option"
                  aria-label={`Вариант ${index + 1} правильный`}
                  checked={
                    form.type === "single"
                      ? form.answer === option.id
                      : Array.isArray(form.answer) &&
                        form.answer.includes(option.id)
                  }
                  onChange={(e) =>
                    set(
                      "answer",
                      form.type === "single"
                        ? option.id
                        : e.target.checked
                          ? [
                              ...(Array.isArray(form.answer)
                                ? form.answer
                                : []),
                              option.id,
                            ]
                          : (Array.isArray(form.answer)
                              ? form.answer
                              : []
                            ).filter((v) => v !== option.id),
                    )
                  }
                />
                <input
                  required
                  aria-label={`Текст варианта ${index + 1}`}
                  value={option.label}
                  onChange={(e) =>
                    set(
                      "options",
                      form.options!.map((o) =>
                        o.id === option.id
                          ? { ...o, label: e.target.value }
                          : o,
                      ),
                    )
                  }
                />
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="Удалить вариант"
                  disabled={form.options!.length <= 2}
                  onClick={() => {
                    set(
                      "options",
                      form.options!.filter((o) => o.id !== option.id),
                    );
                    set(
                      "answer",
                      Array.isArray(form.answer)
                        ? form.answer.filter((v) => v !== option.id)
                        : form.answer === option.id
                          ? ""
                          : (form.answer ?? ""),
                    );
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn small"
              disabled={(form.options?.length ?? 0) >= 20}
              onClick={() =>
                set("options", [
                  ...form.options!,
                  { id: crypto.randomUUID(), label: "" },
                ])
              }
            >
              <Plus size={14} />
              Добавить вариант
            </button>
          </div>
        ) : form.type === "manual" ? (
          <Field label="Критерии ручной проверки">
            <textarea
              required
              rows={3}
              value={form.criteria}
              onChange={(e) => set("criteria", e.target.value)}
              placeholder="Что должен показать ученик, чтобы получить верный результат"
            />
          </Field>
        ) : (
          <Field
            label="Правильный ответ"
            hint={
              form.type === "number"
                ? "Точное число. Десятичный разделитель — точка или запятая."
                : "Пробелы по краям ответа удаляются."
            }
          >
            <input
              required
              value={typeof form.answer === "string" ? form.answer : ""}
              onChange={(e) => set("answer", e.target.value)}
            />
          </Field>
        )}
        {form.type === "text" && (
          <div className="check-row">
            <label>
              <input
                type="checkbox"
                checked={form.ignore_case}
                onChange={(e) => set("ignore_case", e.target.checked)}
              />
              Не учитывать регистр
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.collapse_spaces}
                onChange={(e) => set("collapse_spaces", e.target.checked)}
              />
              Сжимать повторяющиеся пробелы
            </label>
          </div>
        )}
        <Field label="Подробное решение">
          <textarea
            rows={4}
            value={form.solution}
            onChange={(e) => set("solution", e.target.value)}
          />
        </Field>
        <Field label="Типичные ошибки">
          <textarea
            rows={2}
            value={form.common_mistakes}
            onChange={(e) => set("common_mistakes", e.target.value)}
          />
        </Field>
        <Field label="Когда раскрывать ответ и решение">
          <select
            value={form.reveal}
            onChange={(e) => set("reveal", e.target.value as Task["reveal"])}
          >
            <option value="after_attempt">После отправки ответа</option>
            <option value="after_correct">После правильного ответа</option>
            <option value="never">Не раскрывать</option>
          </select>
        </Field>
        {error && <ErrorBox message={error} />}
        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={busy}
          >
            Отмена
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить задание"}
          </button>
        </div>
      </Form>
    </Modal>
  );
}

