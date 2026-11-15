import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, BookOpen, ArrowRight } from "lucide-react";
import { useApp } from "../context";
import { api, formatDate, answerLabel } from "../lib/api";
import { Empty, ErrorBox } from "../components/ui";
import BlockView from "../components/BlockView";
import TaskPlayer from "../components/TaskPlayer";
export function Lesson({ id }: { id: string }) {
  const { data, teacher, preview, refresh, notify, navigate } = useApp();
  const module = data.modules.find((m) => m.id === id);
  const [active, setActive] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const progress = data.progress.find((p) => p.module_id === id);
  useEffect(() => {
    if (!module || teacher) return;
    const target = progress?.last_block_id;
    if (target) {
      requestAnimationFrame(() =>
        document.getElementById(target)?.scrollIntoView({ block: "start" }),
      );
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) setActive(entry.target.id);
      },
      { threshold: 0.3 },
    );
    document
      .querySelectorAll("[data-lesson-block]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [id, teacher]);
  useEffect(() => {
    if (!active || teacher) return;
    const timer = setTimeout(() => {
      void api("progress", {
        module_id: id,
        last_block_id: active,
        preview,
        complete: false,
      })
        .then(() => refresh())
        .catch((e) => setError((e as Error).message));
    }, 1200);
    return () => clearTimeout(timer);
  }, [active, id, preview, teacher, refresh]);
  if (!module)
    return (
      <Empty
        title="Модуль недоступен"
        action="Открыть каталог"
        onAction={() => navigate("catalog")}
      >
        Возможно, преподаватель снял его с публикации.
      </Empty>
    );
  if (teacher)
    return (
      <Empty title="Откройте режим ученика">
        Для прохождения опубликованного материала переключите режим в верхней
        панели.
      </Empty>
    );
  const topic = data.topics.find((t) => t.id === module.topic_id),
    section = data.sections.find((s) => s.id === topic?.section_id);
  const complete = async () => {
    setBusy(true);
    try {
      await api("progress", {
        module_id: id,
        last_block_id: active || module.blocks.at(-1)?.id,
        preview,
        complete: true,
      });
      await refresh();
      notify("Изучение модуля отмечено в вашем прогрессе");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lesson-layout">
      <div className="lesson-main">
        <button
          className="back-link"
          onClick={() => navigate(`section/${section?.id ?? ""}`)}
        >
          <ArrowLeft size={16} />
          {section?.title ?? "Каталог"}
        </button>
        <header className="lesson-header">
          <span className="eyebrow">{topic?.title}</span>
          <h1>{module.title}</h1>
          <p>{module.description}</p>
          <div className="lesson-meta">
            <BookOpen size={16} />
            {module.blocks.length} блоков
            <span>Обновлён {formatDate(module.published_at)}</span>
            {progress?.completed_at && (
              <span className="status correct">Изучен</span>
            )}
          </div>
        </header>
        {error && <ErrorBox message={error} />}
        <div className="lesson-content">
          {module.blocks.map((b) => (
            <div
              className="lesson-block"
              data-lesson-block
              id={b.id}
              key={b.id}
            >
              {b.type === "practice" ? (
                (() => {
                  const task = data.tasks.find((t) => t.id === b.task_id);
                  return task ? (
                    <TaskPlayer key={task.id} task={task} />
                  ) : (
                    <p className="muted">Задание недоступно.</p>
                  );
                })()
              ) : (
                <BlockView block={b} />
              )}
            </div>
          ))}
        </div>
        <div className="lesson-finish panel">
          <div>
            <CheckCircle2 size={23} />
            <h3>
              {progress?.completed_at ? "Модуль изучен" : "Материал изучен?"}
            </h3>
            <p>
              Практические результаты сохраняются отдельно, после отправки
              ответов.
            </p>
          </div>
          <button
            className="btn primary"
            disabled={busy || !!progress?.completed_at}
            onClick={complete}
          >
            {progress?.completed_at
              ? "Завершено"
              : busy
                ? "Сохранение…"
                : "Завершить изучение"}
            <CheckCircle2 size={16} />
          </button>
        </div>
      </div>
      <aside className="lesson-toc panel">
        <span className="eyebrow">В этом модуле</span>
        {module.blocks
          .filter((b) => b.type === "heading" || b.type === "practice")
          .map((b, i) => (
            <a
              key={b.id}
              href={`#${b.id}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(b.id)
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className={active === b.id ? "active" : ""}
            >
              <span>{i + 1}</span>
              {b.type === "heading"
                ? b.text
                : (data.tasks.find((t) => t.id === b.task_id)?.title ??
                  "Практика")}
            </a>
          ))}
        <p>Прогресс сохраняется в вашем аккаунте.</p>
      </aside>
    </div>
  );
}
export function Practice({ taskId }: { taskId?: string }) {
  const { data, navigate, teacher } = useApp();
  const [section, setSection] = useState(""),
    [type, setType] = useState("");
  if (teacher)
    return (
      <Empty title="Практика в режиме ученика">
        Переключите режим в верхней панели, чтобы пройти опубликованные задания.
      </Empty>
    );
  const tasks = data.tasks.filter(
    (t) =>
      (!taskId || t.id === taskId) &&
      (!type || t.type === type) &&
      (!section ||
        data.topics.find(
          (topic) =>
            topic.id ===
            data.modules.find((m) => m.id === t.module_id)?.topic_id,
        )?.section_id === section),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">От теории к результату</span>
          <h1>Практика</h1>
          <p>Решайте в своём темпе. Каждая попытка остаётся в истории.</p>
        </div>
      </div>
      <div className="filter-bar">
        <select
          aria-label="Фильтр по разделу"
          value={section}
          onChange={(e) => setSection(e.target.value)}
        >
          <option value="">Все задания ЕГЭ</option>
          {data.sections.map((s) => (
            <option value={s.id} key={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select
          aria-label="Тип задания"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Все типы ответов</option>
          <option value="number">Числовой</option>
          <option value="text">Строковый</option>
          <option value="single">Один вариант</option>
          <option value="multiple">Несколько вариантов</option>
          <option value="manual">Ручная проверка</option>
        </select>
        {taskId && (
          <button className="btn" onClick={() => navigate("practice")}>
            Показать все
          </button>
        )}
      </div>
      <div className="practice-list">
        {tasks.length ? (
          tasks.map((t) => <TaskPlayer task={t} key={t.id} />)
        ) : (
          <Empty
            title="Пока нет доступных заданий"
            action="Открыть каталог"
            onAction={() => navigate("catalog")}
          >
            Здесь появится практика из опубликованных учебных модулей.
          </Empty>
        )}
      </div>
    </>
  );
}
export function Mistakes() {
  const { data, navigate } = useApp();
  const [filter, setFilter] = useState("all");
  const taskIds = [
    ...new Set(
      data.attempts.filter((a) => a.status === "wrong").map((a) => a.task_id),
    ),
  ];
  const rows = taskIds
    .map((id) => {
      const history = data.attempts.filter((a) => a.task_id === id);
      const last = history[0];
      const wrong = history.find((a) => a.status === "wrong")!;
      return {
        id,
        history,
        last,
        wrong,
        resolved: last.status === "correct",
        task: data.tasks.find((t) => t.id === id),
      };
    })
    .filter(
      (row) =>
        filter === "all" ||
        (filter === "resolved" ? row.resolved : !row.resolved),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Ошибки — часть обучения</span>
          <h1>Работа над ошибками</h1>
          <p>
            Возвращайтесь к сложным заданиям и наблюдайте, как меняется
            результат.
          </p>
        </div>
      </div>
      <div className="tabs">
        {[
          ["all", "Все ошибки"],
          ["open", "Нужно повторить"],
          ["resolved", "Исправлены"],
        ].map(([k, v]) => (
          <button
            className={filter === k ? "active" : ""}
            onClick={() => setFilter(k)}
            key={k}
          >
            {v}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="mistake-list">
          {rows.map((row) => (
            <article className="panel mistake-card" key={row.id}>
              <div className="spread">
                <span className={`badge ${row.resolved ? "green" : "amber"}`}>
                  {row.resolved ? "Исправлена" : "Нужно повторить"}
                </span>
                <small className="muted">
                  {formatDate(row.wrong.created_at)}
                </small>
              </div>
              <h3>{row.wrong.task_snapshot.title}</h3>
              <p className="muted">
                {data.topics.find((t) => t.id === row.wrong.topic_id)?.title ??
                  "Учебная тема"}
              </p>
              <p>
                Ваш ответ:{" "}
                <strong>
                  {answerLabel(row.wrong.answer, row.wrong.task_snapshot)}
                </strong>
              </p>
              {row.wrong.feedback.answer !== undefined && (
                <p>
                  Правильный:{" "}
                  <strong>
                    {answerLabel(
                      row.wrong.feedback.answer,
                      row.wrong.task_snapshot,
                    )}
                  </strong>
                </p>
              )}
              <div className="spread">
                <span className="muted">
                  Всего попыток: {row.history.length}
                </span>
                {row.task ? (
                  <button
                    className="btn small"
                    onClick={() => navigate(`practice/${row.id}`)}
                  >
                    {row.resolved ? "Повторить" : "Решить ещё раз"}
                    <ArrowRight size={14} />
                  </button>
                ) : (
                  <small className="muted">
                    Задание снято с публикации · история сохранена
                  </small>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            taskIds.length ? "В этой категории пока пусто" : "Ошибок пока нет"
          }
          action="Перейти к практике"
          onAction={() => navigate("practice")}
        >
          {taskIds.length
            ? "Статусы обновятся после повторного решения."
            : "После неверного ответа здесь появится задание для повторения. История останется и после исправления."}
        </Empty>
      )}
    </>
  );
}

