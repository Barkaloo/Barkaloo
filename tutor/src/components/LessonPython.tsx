import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Play, Square, X } from "lucide-react";
import { PythonEditor } from "./PythonEditor";

type Run = { id: number; code: string; input: string; attachments: File[]; seconds: number };
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
const maxFiles = 8;
const maxBytes = 16 * 1024 * 1024;
const maxOutput = 64000;
let bundleRequest: Promise<ArrayBuffer | undefined> | undefined;

function sourceCraftRuntime() {
  if (window.location.origin !== mainHost || typeof DecompressionStream !== "function") return;
  return bundleRequest ??= fetch(import.meta.env.BASE_URL + "python-runner/runtime/0.27.7/runtime-v1.bin", {
    signal: AbortSignal.timeout(90000),
    cache: "force-cache",
  }).then((response) => {
    if (!response.ok) throw new Error("Python runtime unavailable");
    return response.arrayBuffer();
  }).catch(() => {
    bundleRequest = undefined;
    return undefined;
  });
}

function getRunnerUrls() {
  const origin = window.location.origin;
  const runnerPath = import.meta.env.BASE_URL + "python-runner/index.html";
  const paths = origin === mainHost ? [
    ...(typeof DecompressionStream === "function" ? ["https://barkaloo.github.io/Barkaloo/python-runner/index.html"] : []),
    `https://barkaloo-tutor.vercel.app${runnerPath}`,
  ] : [runnerPath];
  return paths.map((path) => {
    const url = new URL(path, origin);
    url.search = new URLSearchParams({ v: "6", parent: origin }).toString();
    return url.href;
  });
}

export function LessonPython({ label, code, canRun, onChange }: {
  label: string;
  code: string;
  canRun: boolean;
  onChange?: (code: string) => void;
}) {
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const port = useRef<MessagePort | null>(null);
  const active = useRef<Run | null>(null);
  const loadedBundle = useRef(false);
  const sequence = useRef(0);
  const watchdog = useRef<number | undefined>(undefined);
  const [runnerUrls, setRunnerUrls] = useState<string[]>([]);
  const [connectionId, setConnectionId] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [seconds, setSeconds] = useState(30);
  const [truncated, setTruncated] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const consoleOutput = useRef<HTMLPreElement>(null);
  const busy = phase === "connecting" || phase === "loading" || phase === "running";

  const watch = useCallback((id: number, timeout: number, message: string) => {
    window.clearTimeout(watchdog.current);
    watchdog.current = window.setTimeout(() => {
      port.current?.postMessage({ type: "stop", id });
      port.current?.close();
      port.current = null;
      loadedBundle.current = false;
      active.current = null;
      setRunnerUrls([]);
      setPhase("error");
      setError(message);
    }, timeout);
  }, []);

  const launch = useCallback(async (channel: MessagePort, request: Run) => {
    setPhase("loading");
    watch(request.id, 105000, "Среда Python не загрузилась. Проверьте подключение и повторите запуск.");
    const bundle = loadedBundle.current ? undefined : await sourceCraftRuntime();
    if (active.current?.id !== request.id || port.current !== channel) return;
    channel.postMessage({ type: "run", ...request, bundle });
    if (bundle) loadedBundle.current = true;
  }, [watch]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== "null" || event.data?.type !== "python-ready" || event.data.version !== 6 ||
          !event.ports[0] || !active.current || port.current) return;
      const matchingFrame = [...frames.current].find(([, frame]) => event.source === frame.contentWindow);
      if (!matchingFrame) return;
      const channel = event.ports[0];
      port.current = channel;
      setRunnerUrls([matchingFrame[0]]);
      channel.onmessage = ({ data }) => {
        if (!active.current || data?.id !== active.current.id) return;
        if (data.type === "running") {
          setPhase("running");
          watch(data.id, (active.current.seconds + 5) * 1000, "Среда перестала отвечать. Повторите запуск.");
        }
        if (data.type === "output" && typeof data.text === "string") {
          setOutput((previous) => (previous + data.text).slice(0, maxOutput));
        }
        if (data.type === "truncated") setTruncated(true);
        if (data.type === "error" || data.type === "done" || data.type === "stopped") {
          window.clearTimeout(watchdog.current);
          active.current = null;
          setPhase(data.type);
          if (data.type === "error") {
            loadedBundle.current = false;
            setError(typeof data.text === "string" ? data.text : "Ошибка Python.");
          }
        }
      };
      void launch(channel, active.current);
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
  }, [launch, watch]);

  useEffect(() => {
    if (consoleOutput.current) consoleOutput.current.scrollTop = consoleOutput.current.scrollHeight;
  }, [output, error]);

  const run = () => {
    if (!canRun || !code.trim() || active.current) return;
    const request = { id: ++sequence.current, code, input, attachments, seconds };
    active.current = request;
    setOutput("");
    setError("");
    setTruncated(false);
    setCopyStatus("");
    if (port.current) {
      void launch(port.current, request);
    } else {
      void sourceCraftRuntime();
      setPhase("connecting");
      setConnectionId(request.id);
      setRunnerUrls(getRunnerUrls());
      watch(request.id, 25000, "Не удалось связаться со средой Python. Проверьте подключение и повторите запуск.");
    }
  };

  const stop = () => {
    if (!active.current) return;
    window.clearTimeout(watchdog.current);
    if (port.current) port.current.postMessage({ type: "stop", id: active.current.id });
    else setRunnerUrls([]);
    active.current = null;
    setPhase("stopped");
  };

  const addAttachments = (files: File[]) => {
    const next = [...attachments, ...files];
    if (next.length > maxFiles || next.reduce((size, file) => size + file.size, 0) > maxBytes) {
      setFileError("Можно добавить до 8 файлов общим размером до 16 МБ.");
    } else if (next.some(({ name }) => name.length > 160 || name === "." || name === ".." || /[/\\\u0000-\u001f]/.test(name))) {
      setFileError("В имени файла допустимо до 160 символов. Уберите разделители пути.");
    } else if (new Set(next.map(({ name }) => name)).size !== next.length) {
      setFileError("Файлы с одинаковыми именами добавлять нельзя.");
    } else {
      setAttachments(next);
      setFileError("");
    }
  };

  return (
    <>
      <PythonEditor label={label} code={code} onChange={onChange} onRun={run} />
      {canRun && (
        <div className="lesson-python">
          {runnerUrls.map((url) => (
            <iframe key={`${connectionId}:${url}`} ref={(frame) => {
              if (frame) frames.current.set(url, frame);
              else frames.current.delete(url);
            }} src={url} hidden
              title="Изолированная среда Python" sandbox="allow-scripts" referrerPolicy="no-referrer" />
          ))}
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
              {truncated && <p className="lesson-python-truncated muted">Показаны первые 64 КБ вывода.</p>}
            </div>
          )}
          <details className="lesson-python-inputs">
            <summary>Входные данные и файлы{attachments.length > 0 && ` · ${attachments.length}`}</summary>
            <label>
              Стандартный ввод
              <textarea aria-label="Входные данные Python" placeholder="Вставьте данные для input() или sys.stdin"
                rows={4} maxLength={250000} value={input} onChange={(event) => setInput(event.target.value)} />
            </label>
            <label>
              Файлы для программы
              <input type="file" multiple aria-label="Файлы для программы" onChange={(event) => {
                addAttachments(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }} />
            </label>
            <p className="muted">Файлы доступны по имени через <code>open()</code> в этой вкладке.</p>
            {attachments.length > 0 && <ul className="lesson-python-files">
              {attachments.map((file) => (
                <li key={file.name}><code>{file.name}</code>
                  <button className="icon-btn" type="button" aria-label={`Убрать файл ${file.name}`}
                    onClick={() => {
                      setAttachments((current) => current.filter((item) => item !== file));
                      setFileError("");
                    }}><X size={14} aria-hidden="true" /></button>
                </li>
              ))}
            </ul>}
            {fileError && <p className="lesson-python-error" role="alert">{fileError}</p>}
            <label className="lesson-python-timeout">
              Лимит выполнения
              <select value={seconds} aria-label="Лимит выполнения" onChange={(event) => setSeconds(Number(event.target.value))}>
                <option value={10}>10 с</option>
                <option value={30}>30 с</option>
                <option value={60}>60 с</option>
              </select>
            </label>
          </details>
        </div>
      )}
    </>
  );
}
