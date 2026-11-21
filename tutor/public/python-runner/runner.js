(() => {
  const parentOrigin = new URLSearchParams(location.search).get("parent");
  if (window.parent === window ||
      (parentOrigin !== location.origin && parentOrigin !== "https://barkaloo88.sourcecraft.site")) return;
  const runtime = new URL("./runtime/0.27.7/", location.href).href;

  const workerScript = String.raw`
    self.onmessage = async ({ data }) => {
      const source = data.input.replace(/\r\n/g, "\n");
      const lines = source ? source.split("\n") : [];
      if (source.endsWith("\n")) lines.pop();
      let index = 0;
      let remaining = 16000;
      let pending = "";
      let sent = false;
      const flush = () => {
        if (!pending) return;
        self.postMessage({ type: "output", text: pending });
        pending = "";
        sent = true;
      };
      const write = (line) => {
        const text = String(line) + "\n";
        pending += text.slice(0, remaining);
        remaining -= Math.min(remaining, text.length);
        if (!sent || pending.length >= 512 || !remaining) flush();
        if (!remaining) self.postMessage({ type: "limit" });
      };
      let python;
      try {
        importScripts(data.runtime + "pyodide.js");
        python = await loadPyodide({
          indexURL: data.runtime,
          stdin: () => lines[index++],
          stdout: write,
          stderr: write,
        });
      } catch {
        self.postMessage({ type: "boot-error" });
        return;
      }
      self.postMessage({ type: "running" });
      try {
        const result = python.runPython(data.code, { filename: "lesson.py" });
        if (result?.destroy) result.destroy();
        flush();
        self.postMessage({ type: "done" });
      } catch (error) {
        flush();
        self.postMessage({ type: "error", text: String(error).slice(0, 4000) });
      }
    };
  `;

  let active;
  const { port1: port, port2: parentPort } = new MessageChannel();
  const send = (id, type, text) => port.postMessage({ id, type, text });
  const finish = (job, type, text) => {
    if (active !== job) return;
    active = undefined;
    clearTimeout(job.timer);
    job.worker?.terminate();
    if (job.asset) URL.revokeObjectURL(job.asset);
    send(job.id, type, text);
  };

  port.onmessage = ({ data }) => {
    if (!data || !Number.isSafeInteger(data.id)) return;
    if (data.type === "stop" && active?.id === data.id) {
      finish(active, "stopped");
      return;
    }
    if (data.type !== "run" || typeof data.code !== "string" || data.code.length > 30000 ||
        typeof data.input !== "string" || data.input.length > 10000) return;
    if (active) finish(active, "stopped");
    const job = { id: data.id, remaining: 16000 };
    active = job;
    try {
      job.asset = URL.createObjectURL(new Blob([workerScript], { type: "text/javascript" }));
      job.worker = new Worker(job.asset);
      job.timer = setTimeout(() => finish(job, "error", "Python не загрузился. Попробуйте запустить снова."), 40000);
      job.worker.onmessage = ({ data: message }) => {
        if (active !== job || !message) return;
        switch (message.type) {
          case "running":
            clearTimeout(job.timer);
            job.timer = setTimeout(() => finish(job, "error", "Программа работала дольше 10 секунд."), 10000);
            send(job.id, "running");
            break;
          case "output": {
            if (typeof message.text !== "string") break;
            const text = message.text.slice(0, job.remaining);
            job.remaining -= text.length;
            if (text) send(job.id, "output", text);
            if (!job.remaining) finish(job, "error", "Достигнут предел вывода.");
            break;
          }
          case "limit":
            finish(job, "error", "Достигнут предел вывода.");
            break;
          case "boot-error":
            finish(job, "error", "Не удалось загрузить Python. Проверьте подключение и повторите запуск.");
            break;
          case "error":
            finish(job, "error", typeof message.text === "string" ? message.text.slice(0, 4000) : "Ошибка Python.");
            break;
          case "done":
            finish(job, "done");
            break;
        }
      };
      job.worker.onerror = () => finish(job, "error", "Среда Python остановилась. Попробуйте запустить снова.");
      job.worker.postMessage({ code: data.code, input: data.input, runtime });
    } catch {
      finish(job, "error", "Браузер не смог запустить среду Python.");
    }
  };
  window.parent.postMessage({ type: "python-ready" }, parentOrigin, [parentPort]);
})();
