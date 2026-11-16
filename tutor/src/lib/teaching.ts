import type { Attempt, Data, Homework } from "../types";
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
  const latest = work.items.map((item) =>
    attempts.find(
      (a) =>
        a.homework_item_id === item.id &&
        a.is_preview === preview &&
        a.student_id === actor,
    ),
  );
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
