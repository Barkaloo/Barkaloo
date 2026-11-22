import { useRef, type KeyboardEvent } from "react";
import { useHighlightedCode } from "../lib/code-highlight";

const indent = "    ";
const codeLimit = 30000;

export function PythonEditor({ label, code, onChange, onRun }: {
  label: string;
  code: string;
  onChange?: (code: string) => void;
  onRun: () => void;
}) {
  const mirror = useRef<HTMLPreElement>(null);
  const tabLeavesEditor = useRef(false);
  const highlighted = useHighlightedCode(code, "python");

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onRun();
      return;
    }
    if (!onChange || event.nativeEvent.isComposing) return;
    const field = event.currentTarget;
    if (event.key === "Escape") {
      tabLeavesEditor.current = true;
      return;
    }
    const allowTab = tabLeavesEditor.current;
    tabLeavesEditor.current = false;
    if (event.altKey || event.ctrlKey || event.metaKey || (event.key === "Tab" && allowTab)) return;

    const { selectionStart: start, selectionEnd: end, value } = field;
    const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
    const replace = (text: string, from: number, to: number, select: SelectionMode = "end") => {
      if (value.length - (to - from) + text.length > codeLimit) return;
      field.setRangeText(text, from, to, select);
      onChange(field.value);
    };
    if (event.key === "Tab") {
      event.preventDefault();
      if (!event.shiftKey && start === end) {
        replace(indent, start, end);
        return;
      }
      const lastLine = value.indexOf("\n", end > start && value[end - 1] === "\n" ? end - 1 : end);
      const lineEnd = lastLine === -1 ? value.length : lastLine;
      const block = value.slice(lineStart, lineEnd).split("\n").map((line) =>
        event.shiftKey ? line.replace(/^(?: {1,4}|\t)/, "") : indent + line,
      ).join("\n");
      replace(block, lineStart, lineEnd, start === end ? "preserve" : "select");
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const before = value.slice(lineStart, start);
      const leading = before.match(/^[\t ]*/)?.[0] ?? "";
      replace("\n" + leading + (before.trimEnd().endsWith(":") ? indent : ""), start, end);
    }
  };

  return (
    <div className="lesson-python-editor">
      <pre ref={mirror} className="lesson-python-highlight" aria-hidden="true">
        {highlighted === null ? <code>{code + "\n"}</code> :
          <code dangerouslySetInnerHTML={{ __html: highlighted + "\n" }} />}
      </pre>
      <textarea className="lesson-room-code" aria-label={label}
        title="Tab — отступ, Shift+Tab — убрать отступ, Esc затем Tab — выйти из редактора"
        placeholder="Код Python" spellCheck={false} autoCapitalize="off" autoCorrect="off"
        wrap="off" maxLength={codeLimit} readOnly={!onChange}
        value={code} onChange={(event) => onChange?.(event.target.value)} onKeyDown={keyDown}
        onScroll={(event) => {
          if (!mirror.current) return;
          mirror.current.scrollTop = event.currentTarget.scrollTop;
          mirror.current.scrollLeft = event.currentTarget.scrollLeft;
        }} />
    </div>
  );
}
