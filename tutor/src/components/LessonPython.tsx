import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Play, Square } from "lucide-react";

type Run = { id: number; code: string; input: string };
type Phase = "idle" | "connecting" | "loading" | "running" | "done" | "stopped" | "error";
const statuses: Record<Phase, string> = {
  idle: "Готов к запуску",
  connecting: "Подключаем среду Python…",
  loading: "Загружаем Python… Первый запуск может занять больше времени.",
  running: "Выполняем программу…",
  done: "Готово",
  stopped: "Выполнение остановлено",
  error: "Ошибка",
};
const mainHost = "https://barkaloo88.sourcecraft.site";

function getRunnerUrl() {
  const origin = window.location.origin;
  const runnerHost = origin === mainHost ? "https://barkaloo-tutor.vercel.app" : origin;
  const url = new URL(import.meta.env.BASE_URL + "python-runner/index.html", runnerHost);
  url.search = new URLSearchParams({ v: "4", parent: origin }).toString();
  return url.href;
}

export function LessonPython({ label, code, canRun, onChange }: {
  label: string;
  code: string;
  canRun: boolean;
  onChange?: (code: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const port = useRef<MessagePort | null>(null);
  const active = useRef<Run | null>(null);
  const sequence = useRef(0);
  const watchdog = useRef<number | undefined>(undefined);
  const [frameKey, setFrameKey] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const consoleOutput = useRef<HTMLPreElement>(null);
  const busy = phase === "connecting" || phase === "loading" || phase === "running";

  const watch = useCallback((id: number, connected: boolean) => {
    window.clearTimeout(watchdog.current);
    watchdog.current = window.setTimeout(() => {
      port.current?.postMessage({ type: "stop", id });
      port.current?.close();
      port.current = null;
      active.current = null;
      setFrameKey(null);
      setPhase("error");
      setError(connected ? "Среда перестала отвечать. Повторите запуск." :
        "Не удалось связаться со средой Python. Проверьте подключение и повторите запуск.");
    }, connected ? 105000 : 25000);
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== "null" ||
          event.data?.type !== "python-ready" || !event.ports[0] || !active.current || port.current) return;
      const channel = event.ports[0];
      port.current = channel;
      channel.onmessage = ({ data }) => {
        if (!active.current || data?.id !== active.current.id) return;
        if (data.type === "running") setPhase("running");
        if (data.type === "output" && typeof data.text === "string") {
          setOutput((previous) => (previous + data.text).slice(0, 16000));
        }
        if (data.type === "error" || data.type === "done" || data.type === "stopped") {
          window.clearTimeout(watchdog.current);
          active.current = null;
          setPhase(data.type);
          if (data.type === "error") setError(typeof data.text === "string" ? data.text : "Ошибка Python.");
        }
      };
      setPhase("loading");
      channel.postMessage({ type: "run", ...active.current });
      watch(active.current.id, true);
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      window.clearTimeout(watchdog.current);
      if (active.current) port.current?.postMessage({ type: "stop", id: active.current.id });
      port.current?.close();
      port.current = null;
      active.current = null;
    };
  }, [watch]);

  useEffect(() => {
    if (consoleOutput.current) consoleOutput.current.scrollTop = consoleOutput.current.scrollHeight;
  }, [output, error]);

  const run = () => {
    if (!canRun || !code.trim() || active.current) return;
    const request = { id: ++sequence.current, code, input };
    active.current = request;
    setOutput("");
    setError("");
    setCopyStatus("");
    if (port.current) {
      setPhase("loading");
      port.current.postMessage({ type: "run", ...request });
    } else {
      setPhase("connecting");
      setFrameKey(request.id);
    }
    watch(request.id, Boolean(port.current));
  };

  const stop = () => {
    if (!active.current) return;
    window.clearTimeout(watchdog.current);
    if (port.current) port.current.postMessage({ type: "stop", id: active.current.id });
    else setFrameKey(null);
    active.current = null;
    setPhase("stopped");
  };

  return (
    <>
      <textarea className="lesson-room-code" aria-label={label}
        placeholder="Код Python" spellCheck={false} autoCapitalize="off" maxLength={30000} readOnly={!onChange}
        value={code} onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            run();
          }
        }} />
      {canRun && (
        <div className="lesson-python">
          {frameKey !== null && (
            <iframe key={frameKey} ref={frame} src={getRunnerUrl()} hidden
              title="Изолированная среда Python" sandbox="allow-scripts" referrerPolicy="no-referrer" />
          )}
          <div className="actions">
            <button className="btn primary small" type="button" disabled={busy || !code.trim()} onClick={run}
              title="Ctrl+Enter или ⌘+Enter">
              <Play size={15} aria-hidden="true" />Запустить
            </button>
            {busy && <button className="btn small" type="button" onClick={stop}>
              <Square size={14} aria-hidden="true" />Остановить
            </button>}
            <span className="muted" role="status">{statuses[phase]}</span>
          </div>
          <details>
            <summary>Ввод для input()</summary>
            <textarea aria-label="Входные данные Python" placeholder="Каждое значение с новой строки"
              rows={2} maxLength={10000} value={input} onChange={(event) => setInput(event.target.value)} />
          </details>
          {phase !== "idle" && (
            <div className="lesson-python-console">
              <div className="lesson-python-console-header">
                <span>Консоль</span>
                {(output || error) && (
                  <button className="icon-btn" type="button" aria-label="Скопировать вывод" title="Скопировать вывод"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText([output.trimEnd(), error].filter(Boolean).join("\n"));
                        setCopyStatus("Скопировано");
                      } catch {
                        setCopyStatus("Выделите текст и скопируйте вручную");
                      }
                    }}><Copy size={15} aria-hidden="true" /></button>
                )}
                {copyStatus && <span role="status" className="muted">{copyStatus}</span>}
              </div>
              <pre ref={consoleOutput} className="lesson-room-output" tabIndex={0} aria-label="Вывод Python">
                {output}{error && <span className="lesson-python-error">{error}</span>}
                {!output && !error && phase === "done" && "Программа завершилась без вывода."}
              </pre>
            </div>
          )}
        </div>
      )}
    </>
  );
}
