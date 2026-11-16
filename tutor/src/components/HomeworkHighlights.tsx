import { ArrowRight, ClipboardList } from "lucide-react";
import { useApp } from "../context";
import { dateTime, homeworkSummary, studentName } from "../lib/teaching";
export default function HomeworkHighlights() {
  const { data, teacher, preview, navigate } = useApp();
  const works = data.homeworks
    .filter(
      (h) =>
        !h.canceled_at &&
        homeworkSummary(h, data.attempts, preview).status !== "checked",
    )
    .sort((a, b) => (a.due_at ?? "z").localeCompare(b.due_at ?? "z"))
    .slice(0, 3);
  return (
    <section className="panel homework-highlights">
      <div className="spread">
        <h2>
          <ClipboardList size={18} />
          Домашние задания
        </h2>
        <button className="text-btn" onClick={() => navigate("homework")}>
          {teacher ? "Управлять" : "Все работы"}
          <ArrowRight size={15} />
        </button>
      </div>
      {works.length ? (
        works.map((work) => {
          const s = homeworkSummary(work, data.attempts, preview);
          return (
            <button
              className="homework-highlight"
              key={work.id}
              onClick={() => navigate(`homework/${work.id}`)}
            >
              <div>
                <strong>{work.title}</strong>
                <small>
                  {teacher ? `${studentName(data, work.student_id)} · ` : ""}
                  {dateTime(work.due_at)}
                </small>
              </div>
              <span className={`badge ${s.overdue ? "amber" : "neutral"}`}>
                {s.overdue ? "Срок прошёл" : s.label} · {s.answered}/{s.total}
              </span>
            </button>
          );
        })
      ) : (
        <p className="inline-empty">
          {teacher
            ? "Назначьте ученику работу из опубликованных заданий."
            : "Актуальных домашних заданий пока нет."}
        </p>
      )}
    </section>
  );
}
