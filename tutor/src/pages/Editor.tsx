import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Save,
  Send,
  ImagePlus,
  Pencil,
  Check,
  EyeOff,
} from "lucide-react";
import { useApp } from "../context";
import { api, uploadImage } from "../lib/api";
import { blockLabels, type Block, type BlockType, type Task } from "../types";
import { Empty, ErrorBox, Field } from "../components/ui";
import RichText from "../components/RichText";
import TaskForm from "../components/TaskForm";
import BlockView, { Formula } from "../components/BlockView";
export default function Editor({ id }: { id: string }) {
  const { data, teacher, refresh, notify, navigate, setUnsaved } = useApp();
  const module = data.modules.find((m) => m.id === id);
  const [title, setTitle] = useState(module?.title ?? ""),
    [description, setDescription] = useState(module?.description ?? "");
  const [blocks, setBlocks] = useState<Block[]>(module?.blocks ?? []),
    [revision, setRevision] = useState(module?.revision ?? 0);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(""),
    [error, setError] = useState("");
  const [taskModal, setTaskModal] = useState<Task | "new" | null>(null),
    [practiceBlock, setPracticeBlock] = useState<string | null>(null);
  const tasks = data.tasks.filter((t) => t.module_id === id);
  useEffect(() => {
    setUnsaved(dirty);
    return () => setUnsaved(false);
  }, [dirty, setUnsaved]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  if (!teacher || !module)
    return (
      <Empty
        title="Модуль недоступен"
        action="К материалам"
        onAction={() => navigate("modules")}
      />
    );
  const update = (bid: string, patch: Partial<Block>) => {
    setBlocks((bs) => bs.map((b) => (b.id === bid ? { ...b, ...patch } : b)));
    setDirty(true);
  };
  const add = (type: BlockType) => {
    const block: Block = {
      id: crypto.randomUUID(),
      type,
      ...(type === "table"
        ? {
            cells: [
              ["", ""],
              ["", ""],
            ],
          }
        : {}),
      ...(type === "code" ? { language: "python" } : {}),
      ...(type === "practice" && tasks[0] ? { task_id: tasks[0].id } : {}),
    };
    setBlocks((bs) => [...bs, block]);
    setDirty(true);
  };
  const move = (index: number, delta: number) => {
    setBlocks((bs) => {
      const next = [...bs];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
    setDirty(true);
  };
  const save = async (publish = false) => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ revision: number }>("module_save", {
        module_id: id,
        revision,
        title,
        description,
        blocks,
      });
      setRevision(result.revision);
      setDirty(false);
      if (publish)
        await api("publish", { module_id: id, revision: result.revision });
      await refresh();
      notify(
        publish
          ? "Модуль опубликован. Он доступен в режиме ученика."
          : "Черновик сохранён в Supabase",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const leave = () => navigate("modules");
  const onTaskSaved = async (tid: string) => {
    const fresh = await refresh();
    setRevision(fresh.modules.find((m) => m.id === id)!.revision);
    if (practiceBlock) {
      update(practiceBlock, { task_id: tid });
      setPracticeBlock(null);
    }
    notify("Задание сохранено в черновике");
  };
  const image = async (bid: string, file?: File) => {
    if (!file) return;
    setUploading(bid);
    setError("");
    try {
      update(bid, { path: await uploadImage(id, file) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading("");
    }
  };
  return (
    <div className="editor-page">
      <button className="back-link" onClick={leave}>
        <ArrowLeft size={16} />
        Учебные модули
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Конструктор модуля</span>
          <h1>{title || "Новый модуль"}</h1>
          <p>
            {dirty
              ? "Есть несохранённые изменения"
              : module.published_at && module.published_version === revision
                ? "Опубликованная версия актуальна"
                : "Черновик · доступен только вам"}
          </p>
        </div>
        <div className="actions">
          <button
            className="btn"
            disabled={busy || !!uploading}
            onClick={() => save()}
          >
            <Save size={16} />
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
          <button
            className="btn primary"
            disabled={busy || !!uploading}
            onClick={() => save(true)}
          >
            <Send size={16} />
            Опубликовать
          </button>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="editor-layout">
        <div className="editor-canvas">
          <div className="panel module-meta">
            <Field label="Название модуля">
              <input
                maxLength={200}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
              />
            </Field>
            <Field label="Краткое описание">
              <textarea
                rows={2}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setDirty(true);
                }}
              />
            </Field>
          </div>
          {blocks.length === 0 && (
            <Empty title="С чего начнём?">
              Добавьте блок теории, иллюстрацию или практическое задание.
              Содержание создаёте вы.
            </Empty>
          )}
          {blocks.map((b, index) => (
            <section className="block-editor panel" key={b.id}>
              <div className="block-bar">
                <span>
                  <span className="block-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {blockLabels[b.type]}
                </span>
                <div className="actions">
                  <button
                    className="icon-btn"
                    aria-label="Переместить блок вверх"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Переместить блок вниз"
                    disabled={index === blocks.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    aria-label="Удалить блок"
                    onClick={() => {
                      setBlocks((bs) => bs.filter((v) => v.id !== b.id));
                      setDirty(true);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {b.type === "heading" && (
                <input
                  className="heading-input"
                  aria-label="Текст заголовка"
                  placeholder="Заголовок раздела"
                  value={b.text ?? ""}
                  onChange={(e) => update(b.id, { text: e.target.value })}
                />
              )}
              {(b.type === "text" || b.type === "example") && (
                <>
                  {b.type === "example" && (
                    <Field label="Название примера">
                      <input
                        value={b.text ?? ""}
                        onChange={(e) => update(b.id, { text: e.target.value })}
                      />
                    </Field>
                  )}
                  <RichText
                    value={b.content}
                    onChange={(content) => update(b.id, { content })}
                  />
                </>
              )}
              {b.type === "image" && (
                <>
                  {b.path && <BlockView block={b} />}
                  <label className="upload-control">
                    <ImagePlus size={18} />
                    {uploading === b.id
                      ? "Загрузка…"
                      : b.path
                        ? "Заменить изображение"
                        : "Загрузить изображение"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      disabled={!!uploading}
                      onChange={(e) => {
                        void image(b.id, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <small className="muted">
                    PNG, JPEG, WebP, GIF · до 8 МБ · приватное хранилище
                  </small>
                  <Field label="Подпись и описание изображения">
                    <input
                      value={b.caption ?? ""}
                      onChange={(e) =>
                        update(b.id, { caption: e.target.value })
                      }
                    />
                  </Field>
                </>
              )}
              {b.type === "video" && (
                <>
                  <Field
                    label="Ссылка на видео"
                    hint="YouTube, Vimeo или прямая HTTPS-ссылка на MP4/WebM"
                  >
                    <input
                      type="url"
                      value={b.url ?? ""}
                      onChange={(e) => update(b.id, { url: e.target.value })}
                    />
                  </Field>
                  {b.url && <BlockView block={b} />}
                </>
              )}
              {b.type === "formula" && (
                <>
                  <Field label="Формула LaTeX">
                    <textarea
                      className="mono"
                      value={b.text ?? ""}
                      onChange={(e) => update(b.id, { text: e.target.value })}
                      placeholder="Введите формулу"
                    />
                  </Field>
                  <Formula text={b.text ?? ""} />
                </>
              )}
              {b.type === "code" && (
                <>
                  <Field label="Язык">
                    <select
                      value={b.language ?? "python"}
                      onChange={(e) =>
                        update(b.id, { language: e.target.value })
                      }
                    >
                      <option value="python">Python</option>
                      <option value="javascript">JavaScript</option>
                      <option value="plain">Обычный текст</option>
                    </select>
                  </Field>
                  <textarea
                    className="code-input mono"
                    rows={7}
                    aria-label="Код"
                    value={b.text ?? ""}
                    spellCheck={false}
                    onChange={(e) => update(b.id, { text: e.target.value })}
                  />
                  <BlockView block={b} />
                </>
              )}
              {b.type === "table" && (
                <>
                  <div className="table-scroll">
                    <table className="table-editor">
                      <tbody>
                        {b.cells?.map((row, r) => (
                          <tr key={r}>
                            {row.map((cell, c) => (
                              <td key={c}>
                                <input
                                  aria-label={`Строка ${r + 1}, столбец ${c + 1}`}
                                  value={cell}
                                  onChange={(e) =>
                                    update(b.id, {
                                      cells: b.cells!.map((rr, ri) =>
                                        rr.map((v, ci) =>
                                          ri === r && ci === c
                                            ? e.target.value
                                            : v,
                                        ),
                                      ),
                                    })
                                  }
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="actions table-tools">
                    <button
                      className="btn small"
                      disabled={(b.cells?.length ?? 0) >= 30}
                      onClick={() =>
                        update(b.id, {
                          cells: [...b.cells!, b.cells![0].map(() => "")],
                        })
                      }
                    >
                      + Строка
                    </button>
                    <button
                      className="btn small"
                      disabled={(b.cells?.[0].length ?? 0) >= 8}
                      onClick={() =>
                        update(b.id, {
                          cells: b.cells!.map((row) => [...row, ""]),
                        })
                      }
                    >
                      + Столбец
                    </button>
                    <button
                      className="btn small"
                      disabled={(b.cells?.length ?? 0) <= 1}
                      onClick={() =>
                        update(b.id, { cells: b.cells!.slice(0, -1) })
                      }
                    >
                      − Строка
                    </button>
                    <button
                      className="btn small"
                      disabled={(b.cells?.[0].length ?? 0) <= 1}
                      onClick={() =>
                        update(b.id, {
                          cells: b.cells!.map((row) => row.slice(0, -1)),
                        })
                      }
                    >
                      − Столбец
                    </button>
                  </div>
                  <small className="muted">
                    Первая строка отображается как заголовок таблицы.
                  </small>
                </>
              )}
              {b.type === "note" && (
                <>
                  <Field label="Вид примечания">
                    <select
                      value={b.tone ?? "info"}
                      onChange={(e) =>
                        update(b.id, {
                          tone: e.target.value as "info" | "warning",
                        })
                      }
                    >
                      <option value="info">Примечание</option>
                      <option value="warning">Предупреждение</option>
                    </select>
                  </Field>
                  <textarea
                    rows={3}
                    aria-label="Текст примечания"
                    value={b.text ?? ""}
                    onChange={(e) => update(b.id, { text: e.target.value })}
                  />
                </>
              )}
              {b.type === "practice" && (
                <>
                  <Field label="Практическое задание">
                    <select
                      value={b.task_id ?? ""}
                      onChange={(e) =>
                        update(b.id, { task_id: e.target.value })
                      }
                    >
                      <option value="">Выберите или создайте задание</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="actions">
                    <button
                      className="btn small"
                      onClick={() => {
                        setPracticeBlock(b.id);
                        setTaskModal("new");
                      }}
                    >
                      <Plus size={14} />
                      Создать задание
                    </button>
                    {b.task_id && (
                      <button
                        className="btn small"
                        onClick={() =>
                          setTaskModal(
                            tasks.find((t) => t.id === b.task_id) ?? null,
                          )
                        }
                      >
                        <Pencil size={14} />
                        Редактировать
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          ))}
          {blocks.length > 0 && (
            <button
              className="btn save-bottom"
              onClick={() => save()}
              disabled={busy || !!uploading}
            >
              <Check size={16} />
              Сохранить черновик
            </button>
          )}
        </div>
        <aside className="editor-sidebar">
          <div className="panel">
            <span className="eyebrow">Добавить блок</span>
            <div className="block-palette">
              {Object.entries(blockLabels).map(([k, v]) => (
                <button key={k} onClick={() => add(k as BlockType)}>
                  <Plus size={15} />
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="editor-hint">
            <strong>Вы управляете публикацией</strong>
            <p>
              Сохранение меняет только черновик. Ученики увидят изменения после
              публикации.
            </p>
            {module.published_at && (
              <button
                className="btn small"
                disabled={busy}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Снять модуль с публикации? История попыток сохранится.",
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    await api("unpublish", { module_id: id });
                    await refresh();
                    notify("Модуль снят с публикации");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <EyeOff size={14} />
                Снять с публикации
              </button>
            )}
          </div>
        </aside>
      </div>
      {taskModal && (
        <TaskForm
          moduleId={id}
          task={taskModal === "new" ? undefined : taskModal}
          onClose={() => {
            setTaskModal(null);
            setPracticeBlock(null);
          }}
          onSaved={onTaskSaved}
        />
      )}
    </div>
  );
}
