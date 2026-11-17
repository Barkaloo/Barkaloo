import type { Attempt, Data, Homework } from "../types";

function newestAttemptFirst(a: Attempt, b: Attempt) {
  const milliseconds = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (milliseconds) return milliseconds;
  // PostgreSQL keeps microseconds that Date.parse truncates to milliseconds.
  const fraction = (value: string) =>
    (value.match(/\.(\d+)/)?.[1] ?? "").padEnd(9, "0").slice(3, 9);
  return fraction(b.created_at).localeCompare(fraction(a.created_at));
}
export function studentName(data: Data, id: string) {
  const s = data.students.find((s) => s.student_id === id);
  return s?.nickname || s?.display_name || `Ученик ${id.slice(0, 8)}`;
}
export function homeworkSummary(
  work: Homework,
  attempts: Attempt[],
  preview = false,
) {
  const actor = preview ? work.teacher_id : work.student_id;
  const itemIds = new Set(work.items.map((item) => item.id));
  const attemptsByItem = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    if (
      !attempt.homework_item_id ||
      !itemIds.has(attempt.homework_item_id) ||
      attempt.is_preview !== preview ||
      attempt.student_id !== actor
    )
      continue;
    const rows = attemptsByItem.get(attempt.homework_item_id) ?? [];
    rows.push(attempt);
    attemptsByItem.set(attempt.homework_item_id, rows);
  }
  // Sort new arrays only: the shared attempt history must remain untouched.
  for (const rows of attemptsByItem.values()) {
    rows.sort(newestAttemptFirst);
  }
  const latest = work.items.map((item) => attemptsByItem.get(item.id)?.[0]);
  const answered = latest.filter(Boolean).length,
    correct = latest.filter((a) => a?.status === "correct").length,
    pending = latest.filter((a) => a?.status === "pending").length;
  const status = work.canceled_at
    ? "canceled"
    : answered === 0
      ? "not_started"
      : answered < work.items.length
        ? "in_progress"
        : pending
          ? "pending"
          : "checked";
  const label = {
    canceled: "Отменена",
    not_started: "Не начата",
    in_progress: "В процессе",
    pending: "На проверке",
    checked: "Проверена",
  }[status];
  const overdue =
    !work.canceled_at &&
    answered < work.items.length &&
    !!work.due_at &&
    new Date(work.due_at).getTime() < Date.now();
  return {
    answered,
    correct,
    pending,
    status,
    label,
    overdue,
    total: work.items.length,
    attemptsByItem,
  };
}
export const dateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Без срока";
export function localDateTime(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export const today = () => new Date().toLocaleDateString("sv-SE");

export const lessonLabels = {
  planned: "Запланировано",
  completed: "Проведено",
  canceled: "Отменено",
} as const;

export function homeworkState(work: Homework, attempts: Attempt[], preview = false) {
  const result = homeworkSummary(work, attempts, preview);
  const state = result.status === "canceled" ? "canceled"
    : result.status === "checked" ? "completed"
    : result.status === "pending" ? "pending"
    : result.overdue ? "overdue" : "uncompleted";
  const label = {
    completed: "Выполнена", uncompleted: "Не выполнена", overdue: "Просрочена",
    pending: "На проверке", canceled: "Отменена",
  }[state];
  return { ...result, state, label };
}
