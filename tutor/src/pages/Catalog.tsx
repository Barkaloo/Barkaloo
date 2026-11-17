import { useState } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowLeft,
  Pencil,
  Search,
  MoreHorizontal,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../context";
import { api, formatDate } from "../lib/api";
import type { Module, Section, Topic } from "../types";
import { Empty, ErrorBox, Field, Form, Modal } from "../components/ui";

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
export function Modules() {
  const { data, teacher, navigate } = useApp();
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState("all");
  const modules = data.modules.filter(
    (m) =>
      m.title.toLowerCase().includes(q.toLowerCase()) &&
      (filter === "all" ||
        (filter === "draft" ? !m.published_at : !!m.published_at)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Учебные модули</h1>
        </div>
        {teacher && (
          <button className="btn primary" onClick={() => navigate("catalog")}>
            <Plus size={17} />
            Создать модуль
          </button>
        )}
      </div>
      <div className="filter-bar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Поиск модулей"
            placeholder="Найти модуль…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        {teacher && (
          <div className="tabs">
            {[
              ["all", "Все"],
              ["published", "Опубликованы"],
              ["draft", "Черновики"],
            ].map(([k, v]) => (
              <button
                key={k}
                className={filter === k ? "active" : ""}
                onClick={() => setFilter(k)}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>
      {modules.length ? (
        <div className="module-grid">
          {modules.map((m) => (
            <ModuleCard key={m.id} module={m} />
          ))}
        </div>
      ) : (
        <Empty
          title={
            data.modules.length
              ? "Ничего не найдено"
              : "Модулей пока нет"
          }
        >
          {teacher
            ? "Выберите номер задания ЕГЭ, создайте тему и добавьте свой материал."
            : "Опубликованные преподавателем материалы появятся здесь."}
        </Empty>
      )}
    </>
  );
}
export function Catalog({ embedded = false }: { embedded?: boolean } = {}) {
  const { data, teacher, navigate } = useApp();
  const [q, setQ] = useState(""),
    [sectionEdit, setSectionEdit] = useState<Section | "new" | null>(null);
  const sections = data.sections.filter((s) =>
    `${s.number} ${s.title} ${s.description}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <>
      {!embedded && (
      <div className="page-heading">
        <div>
          <h1>Каталог ЕГЭ</h1>
        </div>
        {teacher && (
          <button className="btn" onClick={() => setSectionEdit("new")}>
            <Plus size={16} />
            Добавить раздел
          </button>
        )}
      </div>
      )}
      <label className="search catalog-search">
        <Search size={17} />
        <input
          aria-label="Поиск разделов"
          placeholder="Номер задания или название…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="section-grid">
        {sections.map((s) => {
          const topics = data.topics.filter((t) => t.section_id === s.id);
          const modules = data.modules.filter((m) =>
            topics.some((t) => t.id === m.topic_id),
          );
          const complete = modules.filter((m) =>
            data.progress.some((p) => p.module_id === m.id && p.completed_at),
          ).length;
          return (
            <article className="section-card" key={s.id}>
              <div className="spread">
                {s.title.trim() !== `Задание №${s.number}` && <span className="section-number">№{s.number}</span>}
                {teacher ? (
                  <button
                    className="icon-btn"
                    aria-label={`Редактировать ${s.title}`}
                    onClick={() => setSectionEdit(s)}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                ) : complete > 0 ? (
                  <CheckCircle2 size={19} className="accent-text" />
                ) : null}
              </div>
              <button
                className="section-card-link"
                onClick={() => navigate(`section/${s.id}`)}
              >
                <h3>{s.title}</h3>
                {s.description && <p>{s.description}</p>}
                <div className="spread">
                  <span>
                    Тем: {topics.length} · Модулей: {modules.length}
                  </span>
                  <ArrowUpRight size={18} />
                </div>
              </button>
              {!teacher && complete > 0 && modules.length > 0 && (
                <div className="progress-track">
                  <i
                    style={{ width: `${(100 * complete) / modules.length}%` }}
                  />
                </div>
              )}
              {!s.active && (
                <span className="badge amber">Архивный раздел</span>
              )}
            </article>
          );
        })}
      </div>
      {sections.length === 0 && (
        <Empty title="Разделы не найдены">Попробуйте другой запрос.</Empty>
      )}
      {sectionEdit && (
        <SectionForm
          section={sectionEdit === "new" ? undefined : sectionEdit}
          onClose={() => setSectionEdit(null)}
        />
      )}
    </>
  );
}
function SectionForm({
  section,
  onClose,
}: {
  section?: Section;
  onClose: () => void;
}) {
  const { refresh, notify, data } = useApp();
  const [form, setForm] = useState({
    number:
      section?.number ?? Math.max(0, ...data.sections.map((s) => s.number)) + 1,
    title: section?.title ?? "",
    description: section?.description ?? "",
    position: section?.position ?? data.sections.length + 1,
    active: section?.active ?? true,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    try {
      await api("section_save", { ...form, id: section?.id });
      await refresh();
      notify("Раздел сохранён");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={section ? "Редактирование раздела" : "Новый раздел"}
      onClose={onClose}
    >
      <Form onSubmit={save}>
        <Field label="Название">
          <input
            required
            maxLength={150}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="Номер">
            <input
              required
              type="number"
              min={1}
              value={form.number}
              onChange={(e) => setForm({ ...form, number: +e.target.value })}
            />
          </Field>
          <Field label="Порядок в каталоге">
            <input
              required
              type="number"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: +e.target.value })}
            />
          </Field>
        </div>
        <Field label="Описание">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <label className="check-row">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Показывать раздел в каталоге ученика
        </label>
        {error && <ErrorBox message={error} />}
        <div className="modal-actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </Form>
    </Modal>
  );
}
export function SectionPage({ id }: { id: string }) {
  const { data, teacher, navigate } = useApp();
  const section = data.sections.find((s) => s.id === id);
  const topics = data.topics.filter((t) => t.section_id === id);
  const [topicEdit, setTopicEdit] = useState<Topic | "new" | null>(null),
    [newModuleTopic, setNewModuleTopic] = useState<Topic | null>(null);
  if (!section)
    return (
      <Empty
        title="Раздел недоступен"
        action="Вернуться в каталог"
        onAction={() => navigate("catalog")}
      />
    );
  const depth = (topic: Topic) => {
    let d = 0;
    let parent = topic.parent_id;
    const seen = new Set<string>();
    while (parent && !seen.has(parent) && d < 8) {
      seen.add(parent);
      d++;
      parent = topics.find((t) => t.id === parent)?.parent_id ?? null;
    }
    return d;
  };
  const ordered: Topic[] = [];
  const walk = (parent: string | null) => {
    topics
      .filter((t) => t.parent_id === parent)
      .forEach((t) => {
        ordered.push(t);
        walk(t.id);
      });
  };
  walk(null);
  topics.filter((t) => !ordered.includes(t)).forEach((t) => ordered.push(t));
  return (
    <>
      <button className="back-link" onClick={() => navigate("catalog")}>
        <ArrowLeft size={16} />
        Каталог заданий
      </button>
      <div className="page-heading">
        <div>
          {section.title.trim() !== `Задание №${section.number}` && <span className="eyebrow">Задание №{section.number}</span>}
          <h1>{section.title}</h1>
          {section.description && <p>{section.description}</p>}
        </div>
        {teacher && (
          <button className="btn primary" onClick={() => setTopicEdit("new")}>
            <Plus size={16} />
            Создать тему
          </button>
        )}
      </div>
      {ordered.length ? (
        <div className="topic-list">
          {ordered.map((t) => {
            const modules = data.modules.filter((m) => m.topic_id === t.id);
            const attempts = data.attempts.filter((a) => a.topic_id === t.id),
              right = attempts.filter((a) => a.status === "correct").length,
              graded = attempts.filter((a) => a.status !== "pending").length;
            const done =
              modules.length > 0 &&
              modules.every((m) =>
                data.progress.some(
                  (p) => p.module_id === m.id && p.completed_at,
                ),
              );
            return (
              <section
                className="panel topic-card"
                key={t.id}
                style={
                  {
                    "--topic-depth": Math.min(depth(t), 3),
                  } as React.CSSProperties
                }
              >
                <div className="spread">
                  <div>
                    <div className="actions">
                      <h2>{t.title}</h2>
                      {!teacher && (
                        <span className={`badge ${done ? "green" : "neutral"}`}>
                          {done
                            ? "Изучена"
                            : attempts.length
                              ? "В процессе"
                              : "Не начата"}
                        </span>
                      )}
                    </div>
                    {t.description && <p className="muted">{t.description}</p>}
                  </div>
                  {teacher && (
                    <button
                      className="icon-btn"
                      aria-label="Редактировать тему"
                      onClick={() => setTopicEdit(t)}
                    >
                      <Pencil size={17} />
                    </button>
                  )}
                </div>
                <div className="topic-meta">
                  <span>
                    {
                      data.tasks.filter(
                        (task) =>
                          modules.some((m) => m.id === task.module_id) &&
                          modules.some((m) =>
                            m.blocks.some((b) => b.task_id === task.id),
                          ),
                      ).length
                    }{" "}
                    заданий для практики
                  </span>
                  {!teacher && (
                    <>
                      <span>
                        {graded
                          ? `${Math.round((right / graded) * 100)}% правильных`
                          : "Попыток пока нет"}
                      </span>
                      <span>
                        Активность: {formatDate(attempts[0]?.created_at)}
                      </span>
                    </>
                  )}
                </div>
                {modules.length ? (
                  <div className="topic-modules">
                    {modules.map((m) => (
                      <ModuleCard key={m.id} module={m} showContext={false} />
                    ))}
                  </div>
                ) : (
                  <div className="inline-empty">
                    {teacher
                      ? "В теме пока нет модулей. Добавьте первый материал."
                      : "Материалы появятся после публикации."}
                  </div>
                )}
                {teacher && (
                  <button
                    className="btn small"
                    onClick={() => setNewModuleTopic(t)}
                  >
                    <Plus size={15} />
                    Создать модуль
                  </button>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Тем пока нет"
        >
          {teacher
            ? "Создайте тему, чтобы добавить учебный модуль."
            : "Здесь будут доступны опубликованные материалы преподавателя."}
        </Empty>
      )}
      {topicEdit && (
        <TopicForm
          sectionId={id}
          topic={topicEdit === "new" ? undefined : topicEdit}
          topics={topics}
          onClose={() => setTopicEdit(null)}
        />
      )}
      {newModuleTopic && (
        <NewModule
          topic={newModuleTopic}
          onClose={() => setNewModuleTopic(null)}
        />
      )}
    </>
  );
}
function TopicForm({
  sectionId,
  topic,
  topics,
  onClose,
}: {
  sectionId: string;
  topic?: Topic;
  topics: Topic[];
  onClose: () => void;
}) {
  const { refresh, notify } = useApp();
  const [title, setTitle] = useState(topic?.title ?? ""),
    [description, setDescription] = useState(topic?.description ?? ""),
    [parent, setParent] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("topic_save", {
        id: topic?.id,
        section_id: sectionId,
        parent_id: parent || null,
        title,
        description,
      });
      await refresh();
      notify("Тема сохранена");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={topic ? "Редактирование темы" : "Новая тема"}
      onClose={onClose}
    >
      <Form onSubmit={save}>
        <Field label="Название темы">
          <input
            autoFocus
            required
            maxLength={150}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Краткое описание">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {!topic && (
          <Field label="Родительская тема">
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">Тема верхнего уровня</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        {error && <ErrorBox message={error} />}
        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить тему"}
          </button>
        </div>
      </Form>
    </Modal>
  );
}
function NewModule({ topic, onClose }: { topic: Topic; onClose: () => void }) {
  const { refresh, navigate } = useApp();
  const [title, setTitle] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("module_create", {
        topic_id: topic.id,
        title,
      });
      await refresh();
      navigate(`edit/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Новый учебный модуль" onClose={onClose}>
      <Form onSubmit={save}>
        <p className="muted">Тема: {topic.title}</p>
        <Field label="Название модуля">
          <input
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <div className="modal-actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Создание…" : "Открыть конструктор"}
          </button>
        </div>
      </Form>
    </Modal>
  );
}

export function KegeCatalog() {
  const [category, setCategory] = useState("tasks");
  return <>
    <div className="page-heading"><h1>Каталог КЕГЭ</h1></div>
    <div className="tabs" role="group" aria-label="Категория каталога">
      <button className={category === "tasks" ? "active" : ""} aria-pressed={category === "tasks"} onClick={() => setCategory("tasks")}>Задания №1–27</button>
      <button className={category === "variants" ? "active" : ""} aria-pressed={category === "variants"} onClick={() => setCategory("variants")}>Полные варианты КЕГЭ</button>
    </div>
    {category === "tasks" ? <Catalog embedded /> : <Empty title="Вариантов пока нет">Реальные материалы будут добавлены позже.</Empty>}
  </>;
}
