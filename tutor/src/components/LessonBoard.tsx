import { useRef, useState, type PointerEvent } from "react";
import { Circle, Eraser, Minus, Pencil, Square, Type, Undo2 } from "lucide-react";

type Point = [number, number];
type Tool = "pen" | "line" | "rectangle" | "ellipse" | "text" | "erase";
export type BoardMark = {
  id: string;
  kind: Exclude<Tool, "erase">;
  points: Point[];
  text?: string;
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
  }
}

export function LessonBoard({ marks, editable, onChange }: {
  marks: BoardMark[];
  editable: boolean;
  onChange: (marks: BoardMark[]) => void;
}) {
  const [tool, setTool] = useState<Tool>("pen");
  const [preview, setPreview] = useState<BoardMark | null>(null);
  const [text, setText] = useState("");
  const [anchor, setAnchor] = useState<Point>([48, 280]);
  const gesture = useRef<{ pointer: number; mark: BoardMark } | null>(null);
  const pointAt = (event: PointerEvent<SVGSVGElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = (value: number, length: number) => Math.round(Math.max(0, Math.min(1, value / length)) * size);
    return [scale(event.clientX - bounds.left, bounds.width), scale(event.clientY - bounds.top, bounds.height)];
  };
  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (!editable || event.button !== 0 || gesture.current) return;
    const point = pointAt(event);
    if (tool === "text") {
      setAnchor(point);
      return;
    }
    if (tool === "erase") {
      const mark = (event.target as Element).closest("[data-mark]")?.getAttribute("data-mark");
      if (mark) onChange(marks.filter((item) => item.id !== mark));
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
      onChange([...marks, active.mark]);
    }
    gesture.current = null;
    setPreview(null);
  };
  return (
    <div className="lesson-board">
      {editable && (
        <div className="lesson-board-toolbar" role="group" aria-label="Инструменты доски">
          {tools.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className="icon-btn" aria-label={label} title={label}
              aria-pressed={tool === id} onClick={() => setTool(id)}><Icon size={18} aria-hidden="true" /></button>
          ))}
          <button type="button" className="icon-btn lesson-board-undo" aria-label="Убрать последний элемент"
            title="Убрать последний элемент" disabled={!marks.length}
            onClick={() => onChange(marks.slice(0, -1))}><Undo2 size={18} aria-hidden="true" /></button>
        </div>
      )}
      {editable && tool === "text" && (
        <form className="lesson-board-text" onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          onChange([...marks, { id: crypto.randomUUID(), kind: "text", points: [anchor], text: text.trim() }]);
          setText("");
        }}>
          <input aria-label="Текст на доске" placeholder="Текст на доске" value={text} maxLength={90}
            onChange={(event) => setText(event.target.value)} />
          <button type="submit" className="btn small" disabled={!text.trim()}>Добавить</button>
        </form>
      )}
      <svg aria-label="Доска" className="lesson-board-surface" data-tool={editable ? tool : undefined}
        viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none"
        onPointerDown={start} onPointerMove={move} onPointerUp={(event) => stop(event, true)}
        onPointerCancel={(event) => stop(event, false)} onLostPointerCapture={(event) => stop(event, false)}>
        {marks.map((mark) => <g data-mark={mark.id} key={mark.id}><Mark mark={mark} /></g>)}
        {preview && <Mark mark={preview} />}
        {editable && tool === "text" && (
          <path d={`M${anchor[0] - 7} ${anchor[1]} h 14 m -7 -7 v 14`} vectorEffect="non-scaling-stroke"
            stroke="currentColor" opacity=".45" pointerEvents="none" />
        )}
      </svg>
    </div>
  );
}
