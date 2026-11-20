import { ArrowUpRight } from "lucide-react";
import { useApp } from "../context";
import type { Module } from "../types";

export function ModuleCard({ module, showContext = true }: { module: Module; showContext?: boolean }) {
  const { data, teacher, navigate } = useApp();
  const topic = data.topics.find((t) => t.id === module.topic_id),
    section = data.sections.find((s) => s.id === topic?.section_id),
    progress = data.progress.find((p) => p.module_id === module.id);
  const count = data.tasks.filter((t) =>
    module.blocks.some((b) => b.type === "practice" && b.task_id === t.id),
  ).length;
  return (
    <button
      className="module-card panel"
      onClick={() => navigate(`${teacher ? "edit" : "lesson"}/${module.id}`)}
    >
      <div className="spread">
        <span
          className={`badge ${teacher ? (module.published_at ? "green" : "neutral") : progress?.completed_at ? "green" : "neutral"}`}
        >
          {teacher
            ? module.published_at
              ? module.revision === module.published_version
                ? "Опубликован"
                : "Есть изменения"
              : "Черновик"
            : progress?.completed_at
              ? "Изучен"
              : progress
                ? "В процессе"
                : "Не начат"}
        </span>
      </div>
      <div className="module-description">
        {showContext && <small className="muted">{section?.title} · {topic?.title}</small>}
        <h3>{module.title}</h3>
        {module.description && <p>{module.description}</p>}
      </div>
      <div className="module-footer">
        <span>Заданий: {count}</span>
        <ArrowUpRight size={18} />
      </div>
    </button>
  );
}
