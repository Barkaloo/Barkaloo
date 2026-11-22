import { memo, useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type PointerEvent } from "react";
import { Circle, Eraser, Hand, Minus, MousePointer2, Pencil, Square, Trash2, Type, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { supabase } from "../lib/api";

type Point = [number, number];
type DrawingTool = "pen" | "line" | "rectangle" | "ellipse" | "text";
type Tool = DrawingTool | "erase" | "select" | "pan";
export type BoardMark = {
  id: string;
  kind: DrawingTool | "image";
  points: Point[];
  text?: string;
  path?: string;
  imageRatio?: number;
  pressures?: number[];
};

const tools = [
  { id: "select", label: "Выбрать и переместить скриншот", icon: MousePointer2 },
  { id: "pen", label: "Карандаш", icon: Pencil },
  { id: "line", label: "Линия", icon: Minus },
  { id: "rectangle", label: "Прямоугольник", icon: Square },
  { id: "ellipse", label: "Овал", icon: Circle },
  { id: "text", label: "Текст", icon: Type },
  { id: "erase", label: "Ластик", icon: Eraser },
] as const;
const size = 1000;
const defaultView = { zoom: 1, x: 0, y: 0 };
type View = typeof defaultView;
type Frame = { x: number; y: number; width: number; height: number };
type Corner = "nw" | "ne" | "sw" | "se";
const corners: Corner[] = ["nw", "ne", "sw", "se"];
type Gesture =
  | { kind: "draw"; pointer: number; mark: BoardMark }
  | { kind: "image"; pointer: number; mark: BoardMark; original: BoardMark; origin: Point; frame: Frame; corner?: Corner }
  | { kind: "pan"; pointer: number; view: View; clientX: number; clientY: number }
  | { kind: "erase"; pointer: number; ids: Set<string> };
const boardBucket = "tutor-lesson-board";
const imageExtensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function boardView(zoom: number, x: number, y: number): View {
  const max = size - size / zoom;
  return { zoom, x: clamp(x, 0, max), y: clamp(y, 0, max) };
}

function imageFrame(mark: BoardMark, surfaceRatio: number, originalRatio = mark.imageRatio): Frame {
  const [[x, y], [right, bottom]] = mark.points;
  const width = right - x;
  const height = bottom - y;
  if (!originalRatio || !Number.isFinite(originalRatio) || originalRatio < 0) return { x, y, width, height };
  const ratio = originalRatio / surfaceRatio;
  const fittedWidth = Math.min(width, height * ratio);
  const fittedHeight = Math.min(height, width / ratio);
  return { x: x + (width - fittedWidth) / 2, y: y + (height - fittedHeight) / 2, width: fittedWidth, height: fittedHeight };
}

function framePoints({ x, y, width, height }: Frame): Point[] {
  const left = clamp(Math.round(x), 0, size - 1);
  const top = clamp(Math.round(y), 0, size - 1);
  return [[left, top], [clamp(Math.round(x + width), left + 1, size), clamp(Math.round(y + height), top + 1, size)]];
}

function transformImage(active: Extract<Gesture, { kind: "image" }>, point: Point): BoardMark {
  const { original, origin, frame, corner } = active;
  const dx = point[0] - origin[0];
  const dy = point[1] - origin[1];
  if (!dx && !dy) return original;
  if (!corner) {
    const [[x, y], [right, bottom]] = original.points;
    return { ...original, points: framePoints({
      width: right - x, height: bottom - y,
      x: clamp(x + dx, 0, size - right + x), y: clamp(y + dy, 0, size - bottom + y),
    }) };
  }
  const { x, y, width, height } = frame;
  const left = corner.endsWith("w");
  const top = corner.startsWith("n");
  const anchorX = left ? x + width : x;
  const anchorY = top ? y + height : y;
  const max = Math.min((left ? anchorX : size - anchorX) / width, (top ? anchorY : size - anchorY) / height);
  const change = ((left ? -dx : dx) * width + (top ? -dy : dy) * height) / (width ** 2 + height ** 2);
  const scale = clamp(1 + change, Math.min(1, 28 / Math.max(width, height)), max);
  return { ...original, points: framePoints({
    x: left ? anchorX - width * scale : anchorX, y: top ? anchorY - height * scale : anchorY,
    width: width * scale, height: height * scale,
  }) };
}

function screenshotSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  return image.decode().then(() => ({ width: image.naturalWidth, height: image.naturalHeight }))
    .finally(() => URL.revokeObjectURL(url));
}

function BoardImage({ path, id, x, y, width, height, onRatio }: Frame & {
  path: string; id: string; onRatio?: (id: string, ratio: number) => void;
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
  useEffect(() => {
    if (!url || !onRatio) return;
    let active = true;
    const image = new Image();
    image.src = url;
    void image.decode().then(() => {
      if (active) onRatio(id, image.naturalWidth / image.naturalHeight);
    }).catch(() => {});
    return () => { active = false; };
  }, [id, onRatio, url]);
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

const Mark = memo(function Mark({ mark, surfaceRatio = 1, legacyRatio, onRatio }: {
  mark: BoardMark;
  surfaceRatio?: number;
  legacyRatio?: number;
  onRatio?: (id: string, ratio: number) => void;
}) {
  const first = mark.points[0];
  if (!first) return null;
  const end = mark.points.at(-1) ?? first;
  const [x, y] = first;
  const [x2, y2] = end;
  const stroke = { vectorEffect: "non-scaling-stroke", strokeWidth: 2.5, stroke: "currentColor", fill: "none" } as const;
  switch (mark.kind) {
    case "pen":
      if (mark.pressures?.length === mark.points.length) {
        const segments = ["", "", "", "", ""];
        const pressureIndex = (value: number) => clamp(Math.round(value || 2), 1, 5) - 1;
        if (mark.points.length === 1) segments[pressureIndex(mark.pressures[0])] = `M${x} ${y} h .1`;
        for (let index = 1; index < mark.points.length; index += 1) {
          const from = mark.points[index - 1];
          const to = mark.points[index];
          const pressure = pressureIndex((mark.pressures[index - 1] + mark.pressures[index]) / 2);
          segments[pressure] += `M${from.join(" ")} L${to.join(" ")} `;
        }
        return <g>{segments.map((d, index) => d && <path key={index} d={d} {...stroke}
          strokeWidth={1.25 + index * .85} strokeLinecap="round" />)}</g>;
      }
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
      return mark.path ? <BoardImage id={mark.id} path={mark.path} {...imageFrame(mark, surfaceRatio, mark.imageRatio ?? legacyRatio)}
        onRatio={mark.imageRatio || legacyRatio ? undefined : onRatio} /> : null;
  }
});

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
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [legacyRatios, setLegacyRatios] = useState<Record<string, number>>({});
  const [panning, setPanning] = useState(false);
  const [erased, setErased] = useState<ReadonlySet<string> | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasteError, setPasteError] = useState("");
  const surface = useRef<SVGSVGElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const previewFrame = useRef<number | null>(null);
  const uploading = useRef(false);
  const latest = useRef({ editable, onChange });
  useEffect(() => { latest.current = { editable, onChange }; }, [editable, onChange]);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setDimensions({ width, height });
    });
    observer.observe(element);
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (gesture.current) return;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1);
      zoomBy(Math.exp(-delta * .003), x, y);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      observer.disconnect();
      if (previewFrame.current !== null) cancelAnimationFrame(previewFrame.current);
    };
  }, []);

  function zoomBy(factor: number, x = .5, y = .5) {
    setView((current) => {
      const zoom = clamp(current.zoom * factor, 1, 4);
      const offset = size / current.zoom - size / zoom;
      return boardView(zoom, current.x + x * offset, current.y + y * offset);
    });
  }

  const surfaceRatio = dimensions.width / dimensions.height;
  const orderedMarks = useMemo(() => [
    ...marks.filter((mark) => mark.kind === "image"),
    ...marks.filter((mark) => mark.kind !== "image"),
  ], [marks]);
  const rememberRatio = useCallback((id: string, ratio: number) => {
    if (ratio > 0 && Number.isFinite(ratio)) setLegacyRatios((previous) => ({ ...previous, [id]: ratio }));
  }, []);
  const fittedFrame = (mark: BoardMark) => imageFrame(mark, surfaceRatio, mark.imageRatio ?? legacyRatios[mark.id]);
  const paste = async (event: ClipboardEvent<HTMLDivElement>) => {
    if (!editable || (event.target as Element).closest("input, textarea, [contenteditable='true']")) return;
    const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"))
      ?? Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile();
    if (!file) return;
    event.preventDefault();
    if (uploading.current) return;
    const extension = imageExtensions[file.type];
    if (!extension || file.size > 6 * 1024 * 1024) {
      setPasteError("Вставьте PNG, JPEG или WebP размером до 6 МБ.");
      return;
    }
    uploading.current = true;
    setPasteError("");
    setPasting(true);
    const id = crypto.randomUUID();
    const path = `${lessonId}/${area}/${id}.${extension}`;
    const span = size / view.zoom;
    try {
      const image = await screenshotSize(file);
      const imageRatio = image.width / image.height;
      const scale = Math.min(1, dimensions.width * .76 / image.width, dimensions.height * .68 / image.height);
      const width = image.width * scale * span / dimensions.width;
      const height = image.height * scale * span / dimensions.height;
      const points = framePoints({
        x: view.x + (span - width) / 2, y: view.y + (span - height) / 2, width, height,
      });
      const { error } = await supabase.storage.from(boardBucket).upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (error) throw error;
      if (board.current && latest.current.editable) {
        latest.current.onChange((previous) => [...previous, { id, kind: "image", path, imageRatio, points }]);
        if (!gesture.current) {
          setTool("select");
          setSelectedId(id);
        }
      }
    } catch {
      setPasteError("Не удалось добавить скриншот. Попробуйте вставить его снова.");
    } finally {
      uploading.current = false;
      setPasting(false);
    }
  };

  const pointAt = (event: Pick<globalThis.PointerEvent, "clientX" | "clientY">, bounds: DOMRect): Point => {
    const scale = (value: number, length: number, offset: number) =>
      Math.round(offset + Math.max(0, Math.min(1, value / length)) * size / view.zoom);
    return [scale(event.clientX - bounds.left, bounds.width, view.x), scale(event.clientY - bounds.top, bounds.height, view.y)];
  };
  const drawingIdAt = (target: EventTarget | null) =>
    target instanceof Element ? target.closest("[data-mark]:not([data-image])")?.getAttribute("data-mark") : undefined;
  const pressureOf = (pressure: number) => clamp(Math.round(pressure * 5), 1, 5);
  const showPreview = () => {
    if (previewFrame.current !== null) return;
    previewFrame.current = requestAnimationFrame(() => {
      previewFrame.current = null;
      const active = gesture.current;
      if (active?.kind === "draw" || active?.kind === "image") setPreview(active.mark);
    });
  };

  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (gesture.current || !event.isPrimary) return;
    const activeTool = tool === "pan" && view.zoom === 1 ? "pen" : tool;
    const barrelEraser = event.pointerType === "pen" && (event.button === 5 || (event.buttons & 32) !== 0);
    const pan = event.button === 1 || activeTool === "pan" || (!editable && view.zoom > 1);
    if (event.button !== 0 && event.button !== 1 && !barrelEraser) return;
    if (!editable && !pan) return;
    board.current?.focus({ preventScroll: true });
    const point = pointAt(event, event.currentTarget.getBoundingClientRect());
    const capture = () => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    };
    if (pan && !barrelEraser) {
      if (view.zoom === 1) return;
      capture();
      gesture.current = { kind: "pan", pointer: event.pointerId, view, clientX: event.clientX, clientY: event.clientY };
      setPanning(true);
      return;
    }
    if (!editable) return;
    if (activeTool === "erase" || barrelEraser) {
      capture();
      const id = drawingIdAt(event.target);
      const ids = new Set(id ? [id] : []);
      gesture.current = { kind: "erase", pointer: event.pointerId, ids };
      setErased(ids);
      return;
    }
    if (activeTool === "select") {
      const target = event.target instanceof Element ? event.target : null;
      const corner = target?.closest("[data-corner]")?.getAttribute("data-corner") as Corner | undefined;
      const group = target?.closest("[data-image]");
      const mark = marks.find((item) => item.id === (corner ? selectedId : group?.getAttribute("data-image")) && item.kind === "image");
      setSelectedId(mark?.id ?? null);
      if (!mark) return;
      capture();
      const image = legacyRatios[mark.id] ? { ...mark, imageRatio: legacyRatios[mark.id] } : mark;
      gesture.current = { kind: "image", pointer: event.pointerId, mark: image, original: image, origin: point,
        frame: fittedFrame(mark), corner };
      return;
    }
    if (activeTool === "text") {
      setAnchor(point);
      return;
    }
    if (activeTool === "pan") return;
    const pen = activeTool === "pen" && event.pointerType === "pen";
    const mark: BoardMark = { id: crypto.randomUUID(), kind: activeTool, points: [point] };
    if (pen) mark.pressures = [pressureOf(event.pressure)];
    capture();
    gesture.current = { kind: "draw", pointer: event.pointerId, mark };
    setPreview(mark);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (active.kind === "pan") {
      const span = size / active.view.zoom;
      setView(boardView(active.view.zoom, active.view.x - (event.clientX - active.clientX) * span / bounds.width,
        active.view.y - (event.clientY - active.clientY) * span / bounds.height));
      return;
    }
    if (active.kind === "erase") {
      const id = drawingIdAt(document.elementFromPoint(event.clientX, event.clientY));
      if (id && !active.ids.has(id)) {
        active.ids = new Set([...active.ids, id]);
        setErased(active.ids);
      }
      return;
    }
    if (active.kind === "image") {
      active.mark = transformImage(active, pointAt(event, bounds));
      showPreview();
      return;
    }
    const { kind } = active.mark;
    if (kind !== "pen") {
      active.mark = { ...active.mark, points: [active.mark.points[0], pointAt(event, bounds)] };
      showPreview();
      return;
    }
    let points = [...active.mark.points];
    let pressures = active.mark.pressures?.slice();
    const samples = event.nativeEvent.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event.nativeEvent]) {
      const point = pointAt(sample, bounds);
      const last = points.at(-1)!;
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 1.4) continue;
      if (points.length >= 1000) {
        points = points.filter((_, index) => index % 2 === 0 || index === 999);
        pressures = pressures?.filter((_, index) => index % 2 === 0 || index === 999);
      }
      points.push(point);
      pressures?.push(sample.pressure ? pressureOf(sample.pressure) : pressures.at(-1)!);
    }
    active.mark = { ...active.mark, points, pressures };
    showPreview();
  };
  const stop = (event: PointerEvent<SVGSVGElement>, commit: boolean) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (commit) {
      move(event);
      if (editable && active.kind === "draw") onChange((previous) => [...previous, active.mark]);
      if (editable && active.kind === "image" && active.mark !== active.original) {
        onChange((previous) => previous.map((mark) => mark.id === active.mark.id ? active.mark : mark));
      }
      if (editable && active.kind === "erase" && active.ids.size) {
        onChange((previous) => previous.filter((mark) => !active.ids.has(mark.id)));
      }
    }
    gesture.current = null;
    if (previewFrame.current !== null) cancelAnimationFrame(previewFrame.current);
    previewFrame.current = null;
    setPreview(null);
    setErased(null);
    setPanning(false);
  };
  const selected = editable && tool === "select" && marks.find((mark) => mark.id === selectedId);
  const selectedFrame = selected ? fittedFrame(preview?.id === selected.id ? preview : selected) : null;
  const removeSelected = () => {
    if (!selected) return;
    onChange((previous) => previous.filter((mark) => mark.id !== selected.id));
    setSelectedId(null);
  };
  const unitsX = size / view.zoom / dimensions.width;
  const unitsY = size / view.zoom / dimensions.height;
  return (
    <div ref={board} tabIndex={0} className="lesson-board"
      aria-label={editable ? "Доска. Ctrl+V — вставить скриншот, Ctrl+колесо — масштаб" : "Доска. Ctrl+колесо — масштаб"}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !selected || gesture.current) return;
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          removeSelected();
        } else if (event.key === "Escape") {
          setSelectedId(null);
        }
      }}
      onPaste={(event) => void paste(event)}>
      {editable && (
        <div className="lesson-board-toolbar" role="group" aria-label="Инструменты доски">
          {tools.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className="icon-btn" aria-label={label} title={label}
              aria-pressed={tool === id} onClick={() => setTool(id)}><Icon size={18} aria-hidden="true" /></button>
          ))}
          {selected && <button type="button" className="icon-btn" aria-label="Удалить скриншот"
            title="Удалить скриншот" onClick={removeSelected}><Trash2 size={18} aria-hidden="true" /></button>}
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
      <div className="lesson-board-zoom" role="group" aria-label="Навигация по доске">
        {editable && <button type="button" className="icon-btn" aria-pressed={tool === "pan" && view.zoom > 1}
          aria-label="Перемещать доску" title="Перемещать доску при увеличении"
          disabled={view.zoom === 1} onClick={() => setTool(tool === "pan" ? "pen" : "pan")}>
          <Hand size={17} aria-hidden="true" />
        </button>}
        <button type="button" className="icon-btn" aria-label="Уменьшить масштаб" title="Уменьшить масштаб"
          disabled={view.zoom === 1} onClick={() => zoomBy(1 / 1.25)}><ZoomOut size={17} aria-hidden="true" /></button>
        <button type="button" className="icon-btn lesson-board-percent" title="Сбросить масштаб"
          aria-label={`Масштаб ${Math.round(view.zoom * 100)} процентов. Сбросить масштаб`}
          onClick={() => setView(defaultView)}>{Math.round(view.zoom * 100)}%</button>
        <button type="button" className="icon-btn" aria-label="Увеличить масштаб" title="Увеличить масштаб"
          disabled={view.zoom === 4} onClick={() => zoomBy(1.25)}><ZoomIn size={17} aria-hidden="true" /></button>
      </div>
      <svg ref={surface} aria-label="Доска" className="lesson-board-surface"
        data-tool={editable ? (tool === "pan" && view.zoom === 1 ? "pen" : tool) : view.zoom > 1 ? "pan" : undefined}
        data-panning={panning || undefined}
        viewBox={`${view.x} ${view.y} ${size / view.zoom} ${size / view.zoom}`} preserveAspectRatio="none"
        onPointerDown={start} onPointerMove={move} onPointerUp={(event) => stop(event, true)}
        onPointerCancel={(event) => stop(event, false)} onLostPointerCapture={(event) => stop(event, false)}>
        {orderedMarks.map((mark) => <g data-mark={mark.id} data-image={mark.kind === "image" ? mark.id : undefined} key={mark.id}
            visibility={erased?.has(mark.id) ? "hidden" : undefined}>
            <Mark mark={preview?.id === mark.id ? preview : mark} surfaceRatio={mark.kind === "image" ? surfaceRatio : undefined}
              legacyRatio={legacyRatios[mark.id]} onRatio={mark.kind === "image" ? rememberRatio : undefined} />
          </g>)}
        {preview && preview.kind !== "image" && <Mark mark={preview} />}
        {selectedFrame && (
          <g className="lesson-board-selection" data-image={selected && selected.id}>
            <rect {...selectedFrame} className="lesson-board-selection-outline" vectorEffect="non-scaling-stroke" />
            {corners.map((corner) => {
              const x = selectedFrame.x + (corner.endsWith("e") ? selectedFrame.width : 0);
              const y = selectedFrame.y + (corner.startsWith("s") ? selectedFrame.height : 0);
              return <g key={corner} data-corner={corner} className="lesson-board-handle">
                <rect x={x - 14 * unitsX} y={y - 14 * unitsY} width={28 * unitsX} height={28 * unitsY} fill="transparent" />
                <ellipse cx={x} cy={y} rx={4 * unitsX} ry={4 * unitsY} vectorEffect="non-scaling-stroke" />
              </g>;
            })}
          </g>
        )}
        {editable && tool === "text" && (
          <path d={`M${anchor[0] - 7} ${anchor[1]} h 14 m -7 -7 v 14`} vectorEffect="non-scaling-stroke"
            stroke="currentColor" opacity=".45" pointerEvents="none" />
        )}
      </svg>
    </div>
  );
}
