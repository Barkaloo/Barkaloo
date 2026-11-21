(() => {
  const parentOrigin = new URLSearchParams(location.search).get("parent");
  if (window.parent === window ||
      (parentOrigin !== location.origin && parentOrigin !== "https://barkaloo88.sourcecraft.site")) return;
  const runtime = new URL("./runtime/0.27.7/", location.href).href;
  const files = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
  let cachedRuntime;
  const fetchRuntime = async (bundle) => {
    if (typeof DecompressionStream !== "function") {
      return Promise.all(files.map(async (file) => {
        const response = await fetch(runtime + file);
        if (!response.ok) throw new Error("Python runtime file unavailable");
        return response.arrayBuffer();
      }));
    }
    const response = bundle ? new Response(bundle) : await fetch(runtime + "runtime-v1.bin");
    if (!response.ok || !response.body) throw new Error("Python runtime bundle unavailable");
    const bytes = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    const lengths = new DataView(bytes);
    let offset = files.length * 4;
    const pieces = files.map((_, index) => {
      const size = lengths.getUint32(index * 4, true);
      const end = offset + size;
      if (!size || end > bytes.byteLength) throw new Error("Incomplete Python runtime bundle");
      const piece = bytes.slice(offset, end);
      offset = end;
      return piece;
    });
    if (offset !== bytes.byteLength) throw new Error("Unexpected Python runtime bundle size");
    return pieces;
  };
  const getRuntime = (bundle) => cachedRuntime ??= fetchRuntime(bundle).catch((error) => {
    cachedRuntime = undefined;
    throw error;
  });

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
        const [loader, glue, wasm, stdlib, lock] = data.files;
        for (const script of [loader, glue]) {
          const url = URL.createObjectURL(new Blob([script], { type: "application/javascript" }));
          try { importScripts(url); } finally { URL.revokeObjectURL(url); }
        }
        // Serve the pinned runtime bytes from memory. Each execution still gets a fresh worker.
        const resources = new Map([
          [data.runtime + "pyodide.asm.wasm", [wasm, "application/wasm"]],
          [data.runtime + "python_stdlib.zip", [stdlib, "application/zip"]],
          [data.runtime + "pyodide-lock.json", [lock, "application/json"]],
        ]);
        const browserFetch = self.fetch.bind(self);
        self.fetch = (request, options) => {
          const key = typeof request === "string" ? request : (request?.url || request?.href);
          const file = resources.get(key);
          return file ? Promise.resolve(new Response(file[0], { headers: { "Content-Type": file[1] } }))
            : browserFetch(request, options);
        };
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

  port.onmessage = async ({ data }) => {
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
      job.timer = setTimeout(() => finish(job, "error", "Python загружался слишком долго. Проверьте подключение и попробуйте снова."), 90000);
      const bundle = data.bundle instanceof ArrayBuffer && data.bundle.byteLength < 6500000 ? data.bundle : undefined;
      const assets = await getRuntime(bundle);
      if (active !== job) return;
      job.asset = URL.createObjectURL(new Blob([workerScript], { type: "text/javascript" }));
      job.worker = new Worker(job.asset);
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
      job.worker.postMessage({ code: data.code, input: data.input, runtime, files: assets });
    } catch {
      finish(job, "error", "Не удалось загрузить или запустить Python. Проверьте подключение и повторите запуск.");
    }
  };
  window.parent.postMessage({ type: "python-ready" }, parentOrigin, [parentPort]);
})();
