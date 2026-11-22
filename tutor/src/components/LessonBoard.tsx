import { useEffect, useRef, useState, type ClipboardEvent, type PointerEvent } from "react";
import { Circle, Eraser, Minus, Pencil, Square, Type, Undo2 } from "lucide-react";
import { supabase } from "../lib/api";

type Point = [number, number];
type Tool = "pen" | "line" | "rectangle" | "ellipse" | "text" | "erase";
export type BoardMark = {
  id: string;
  kind: Exclude<Tool, "erase"> | "image";
  points: Point[];
  text?: string;
  path?: string;
};

const tools = [
  { id: "pen", label: "Карандаш", icon: Pencil },
  { id: "line", label: "Линия", icon: Minus },
  { id: "rectangle", label: "Прямоугольник", icon: Square },
  { id: "ellipse", label: "Овал", icon: Circle },
  { id: "text", label: "Текст", icon: Type },
  { id: "erase", label: "Ластик", icon: Eraser },
] as const;
const size = 1000;
const defaultView = { zoom: 1, x: 0, y: 0 };
const boardBucket = "tutor-lesson-board";
const imageExtensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function BoardImage({ path, x, y, width, height }: {
  path: string; x: number; y: number; width: number; height: number;
}) {
  const [url, setUrl] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const { data, error } = await supabase.storage.from(boardBucket).createSignedUrl(path, 600);
      if (!active) return;
      if (data?.signedUrl) setUrl(data.signedUrl);
      setUnavailable(Boolean(error));
    };
    void refresh();
    const interval = window.setInterval(refresh, 480000);
    return () => { active = false; window.clearInterval(interval); };
  }, [path]);
  if (!url || unavailable) return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill="currentColor" opacity=".1" />
      <text x={x + 10} y={y + 28} fill="currentColor" fontSize={22}>
        {unavailable ? "Скриншот недоступен" : "Загружаем скриншот…"}
      </text>
    </g>
  );
  return <image aria-label="Скриншот на доске" href={url} x={x} y={y} width={width} height={height}
    onError={() => setUnavailable(true)} />;
}

function Mark({ mark }: { mark: BoardMark }) {
  const first = mark.points[0];
  if (!first) return null;
  const end = mark.points.at(-1) ?? first;
  const [x, y] = first;
  const [x2, y2] = end;
  const stroke = { vectorEffect: "non-scaling-stroke", strokeWidth: 2.5, stroke: "currentColor", fill: "none" } as const;
  switch (mark.kind) {
    case "pen":
      return mark.points.length === 1
        ? <path d={`M${x} ${y} h .1`} {...stroke} strokeLinecap="round" />
        : <polyline points={mark.points.map((point) => point.join(",")).join(" ")} {...stroke} strokeLinecap="round" strokeLinejoin="round" />;
    case "line":
      return <line x1={x} y1={y} x2={x2} y2={y2} {...stroke} strokeLinecap="round" />;
    case "rectangle":
      return <rect x={Math.min(x, x2)} y={Math.min(y, y2)} width={Math.abs(x2 - x)} height={Math.abs(y2 - y)} {...stroke} />;
    case "ellipse":
      return <ellipse cx={(x + x2) / 2} cy={(y + y2) / 2} rx={Math.abs(x2 - x) / 2} ry={Math.abs(y2 - y) / 2} {...stroke} />;
    case "text":
      return <text x={x} y={y} fill="currentColor" fontSize={32} dominantBaseline="hanging">{mark.text}</text>;
    case "image":
      return mark.path ? <BoardImage path={mark.path} x={x} y={y} width={x2 - x} height={y2 - y} /> : null;
  }
}

export function LessonBoard({ marks, editable, lessonId, area, onChange }: {
  marks: BoardMark[];
  editable: boolean;
  lessonId: string;
  area: "teacher" | "student";
  onChange: (update: (marks: BoardMark[]) => BoardMark[]) => void;
}) {
  const [tool, setTool] = useState<Tool>("pen");
  const [preview, setPreview] = useState<BoardMark | null>(null);
  const [text, setText] = useState("");
  const [anchor, setAnchor] = useState<Point>([48, 280]);
  const [view, setView] = useState(defaultView);
  const [pasting, setPasting] = useState(false);
  const [pasteError, setPasteError] = useState("");
  const surface = useRef<SVGSVGElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointer: number; mark: BoardMark } | null>(null);
  const latest = useRef({ editable, onChange });
  useEffect(() => { latest.current = { editable, onChange }; }, [editable, onChange]);

  useEffect(() => {
    const element = surface.current;
    const wheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !element) return;
      event.preventDefault();
      if (gesture.current) return;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      setView((current) => {
        const zoom = Math.max(1, Math.min(4, current.zoom * Math.exp(-delta * .003)));
        const span = size / zoom;
        const offset = size / current.zoom - span;
        const clamp = (point: number) => Math.max(0, Math.min(size - span, point));
        return { zoom, x: clamp(current.x + x * offset), y: clamp(current.y + y * offset) };
      });
    };
    element?.addEventListener("wheel", wheel, { passive: false });
    return () => element?.removeEventListener("wheel", wheel);
  }, []);

  const paste = async (event: ClipboardEvent<HTMLDivElement>) => {
    if (!editable || (event.target as Element).closest("input, textarea, [contenteditable='true']")) return;
    const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
    if (!file) return;
    event.preventDefault();
    if (pasting) return;
    const extension = imageExtensions[file.type];
    if (!extension || file.size > 6 * 1024 * 1024) {
      setPasteError("Вставьте PNG, JPEG или WebP размером до 6 МБ.");
      return;
    }
    setPasteError("");
    setPasting(true);
    const id = crypto.randomUUID();
    const path = `${lessonId}/${area}/${id}.${extension}`;
    const span = size / view.zoom;
    const points: Point[] = [
      [Math.round(view.x + span * .12), Math.round(view.y + span * .16)],
      [Math.round(view.x + span * .88), Math.round(view.y + span * .84)],
    ];
    try {
      const { error } = await supabase.storage.from(boardBucket).upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (error) throw error;
      if (latest.current.editable) latest.current.onChange((previous) => [...previous, { id, kind: "image", path, points }]);
    } catch {
      setPasteError("Не удалось добавить скриншот. Попробуйте вставить его снова.");
    } finally {
      setPasting(false);
    }
  };

  const pointAt = (event: PointerEvent<SVGSVGElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = (value: number, length: number, offset: number) =>
      Math.round(offset + Math.max(0, Math.min(1, value / length)) * size / view.zoom);
    return [scale(event.clientX - bounds.left, bounds.width, view.x), scale(event.clientY - bounds.top, bounds.height, view.y)];
  };
  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (!editable || event.button !== 0 || gesture.current) return;
    board.current?.focus({ preventScroll: true });
    const point = pointAt(event);
    if (tool === "text") {
      setAnchor(point);
      return;
    }
    if (tool === "erase") {
      const mark = (event.target as Element).closest("[data-mark]")?.getAttribute("data-mark");
      if (mark) onChange((previous) => previous.filter((item) => item.id !== mark));
      return;
    }
    const mark = { id: crypto.randomUUID(), kind: tool, points: [point] };
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointer: event.pointerId, mark };
    setPreview(mark);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    const point = pointAt(event);
    const { points, kind } = active.mark;
    const last = points.at(-1)!;
    if (kind === "pen" && (points.length >= 1000 || Math.hypot(point[0] - last[0], point[1] - last[1]) < 3)) return;
    active.mark = { ...active.mark, points: kind === "pen" ? [...points, point] : [points[0], point] };
    setPreview(active.mark);
  };
  const stop = (event: PointerEvent<SVGSVGElement>, commit: boolean) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (commit && editable) {
      move(event);
      onChange((previous) => [...previous, active.mark]);
    }
    gesture.current = null;
    setPreview(null);
  };
  return (
    <div ref={board} tabIndex={0} className="lesson-board"
      aria-label={editable ? "Доска. Ctrl+V — вставить скриншот, Ctrl+колесо — масштаб" : "Доска. Ctrl+колесо — масштаб"}
      onPaste={(event) => void paste(event)}>
      {editable && (
        <div className="lesson-board-toolbar" role="group" aria-label="Инструменты доски">
          {tools.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className="icon-btn" aria-label={label} title={label}
              aria-pressed={tool === id} onClick={() => setTool(id)}><Icon size={18} aria-hidden="true" /></button>
          ))}
          <button type="button" className="icon-btn lesson-board-undo" aria-label="Убрать последний элемент"
            title="Убрать последний элемент" disabled={!marks.length}
            onClick={() => onChange((previous) => previous.slice(0, -1))}><Undo2 size={18} aria-hidden="true" /></button>
        </div>
      )}
      {editable && tool === "text" && (
        <form className="lesson-board-text" onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          const mark: BoardMark = { id: crypto.randomUUID(), kind: "text", points: [anchor], text: text.trim() };
          onChange((previous) => [...previous, mark]);
          setText("");
        }}>
          <input aria-label="Текст на доске" placeholder="Текст на доске" value={text} maxLength={90}
            onChange={(event) => setText(event.target.value)} />
          <button type="submit" className="btn small" disabled={!text.trim()}>Добавить</button>
        </form>
      )}
      {(pasting || pasteError) && <p className="lesson-board-feedback" role={pasteError ? "alert" : "status"}>
        {pasteError || "Добавляем скриншот…"}
      </p>}
      <button className="btn small lesson-board-zoom" type="button" title="Ctrl+колесо — масштаб. Нажмите, чтобы сбросить."
        aria-label={`Масштаб ${Math.round(view.zoom * 100)} процентов. Сбросить масштаб`}
        onClick={() => setView(defaultView)}>{Math.round(view.zoom * 100)}%</button>
      <svg ref={surface} aria-label="Доска" className="lesson-board-surface" data-tool={editable ? tool : undefined}
        viewBox={`${view.x} ${view.y} ${size / view.zoom} ${size / view.zoom}`} preserveAspectRatio="none"
        onPointerDown={start} onPointerMove={move} onPointerUp={(event) => stop(event, true)}
        onPointerCancel={(event) => stop(event, false)} onLostPointerCapture={(event) => stop(event, false)}>
        {[...marks.filter((mark) => mark.kind === "image"), ...marks.filter((mark) => mark.kind !== "image")]
          .map((mark) => <g data-mark={mark.id} key={mark.id}><Mark mark={mark} /></g>)}
        {preview && <Mark mark={preview} />}
        {editable && tool === "text" && (
          <path d={`M${anchor[0] - 7} ${anchor[1]} h 14 m -7 -7 v 14`} vectorEffect="non-scaling-stroke"
            stroke="currentColor" opacity=".45" pointerEvents="none" />
        )}
      </svg>
    </div>
  );
}
