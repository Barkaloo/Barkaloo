(() => {
  const parentOrigin = new URLSearchParams(location.search).get("parent");
  if (window.parent === window ||
      (parentOrigin !== location.origin && parentOrigin !== "https://barkaloo88.sourcecraft.site")) return;
  const runtime = new URL("./runtime/0.27.7/", location.href).href;
  const files = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
  const outputLimit = 64000;
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
      const input = new TextEncoder().encode(data.input);
      let inputRead = false;
      let remaining = data.outputLimit;
      let pending = "";
      let sentOutput = false;
      const flush = () => {
        if (!pending) return;
        self.postMessage({ type: "output", text: pending });
        pending = "";
        sentOutput = true;
      };
      const decoders = [new TextDecoder(), new TextDecoder()];
      let truncated = false;
      const write = (decoder) => (bytes) => {
        const kept = Math.min(remaining, bytes.length);
        if (kept) {
          pending += decoder.decode(bytes.subarray(0, kept), { stream: true });
          remaining -= kept;
          if (!sentOutput || pending.length >= 1024 || !remaining) flush();
        }
        if (kept < bytes.length && !truncated) {
          truncated = true;
          self.postMessage({ type: "truncated" });
        }
        return bytes.length;
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
        });
        python.setStdin({ stdin: () => {
          if (inputRead || !input.length) return undefined;
          inputRead = true;
          return input;
        } });
        python.setStdout({ write: write(decoders[0]), isatty: true });
        python.setStderr({ write: write(decoders[1]), isatty: true });
        python.FS.mkdir("/tmp/tutor");
        python.FS.chdir("/tmp/tutor");
        for (const attachment of data.attachments) {
          python.FS.writeFile(attachment.name, new Uint8Array(await attachment.arrayBuffer()), { canOwn: true });
        }
      } catch {
        self.postMessage({ type: "boot-error" });
        return;
      }
      self.postMessage({ type: "running" });
      let failure = "";
      try {
        const result = python.runPython(data.code, { filename: "lesson.py" });
        if (result?.destroy) result.destroy();
      } catch (error) {
        failure = String(error).slice(0, 4000);
      }
      try {
        python.runPython("__import__('sys').stdout.flush()\n__import__('sys').stderr.flush()");
      } catch { /* The script may have closed or redirected its streams. */ }
      for (const decoder of decoders) pending += decoder.decode();
      flush();
      self.postMessage(failure ? { type: "error", text: failure } : { type: "done" });
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
    if (data.type !== "run") return;
    const seconds = data.seconds ?? 10;
    const attachments = data.attachments ?? [];
    if (typeof data.code !== "string" || data.code.length > 30000 || typeof data.input !== "string" ||
        data.input.length > 250000 || ![10, 30, 60].includes(seconds) || !Array.isArray(attachments)) {
      send(data.id, "error", "Неверные параметры запуска.");
      return;
    }
    if (attachments.length > 8 || attachments.some((file) => !(file instanceof File) || !file.name ||
        file.name.length > 160 || file.name === "." || file.name === ".." || /[/\\\u0000-\u001f]/.test(file.name)) ||
        new Set(attachments.map((file) => file.name)).size !== attachments.length ||
        attachments.reduce((total, file) => total + file.size, 0) > 16 * 1024 * 1024) {
      send(data.id, "error", "Проверьте имена и общий размер файлов.");
      return;
    }
    if (active) finish(active, "stopped");
    const job = { id: data.id, remaining: outputLimit };
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
            job.timer = setTimeout(
              () => finish(job, "error", `Превышен лимит выполнения (${seconds} с).`),
              seconds * 1000,
            );
            send(job.id, "running");
            break;
          case "output": {
            if (typeof message.text !== "string") break;
            const text = message.text.slice(0, job.remaining);
            job.remaining -= text.length;
            if (text) send(job.id, "output", text);
            break;
          }
          case "truncated":
            send(job.id, "truncated");
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
      job.worker.postMessage({ code: data.code, input: data.input, attachments, runtime, files: assets, outputLimit });
    } catch {
      finish(job, "error", "Не удалось загрузить или запустить Python. Проверьте подключение и повторите запуск.");
    }
  };
  window.parent.postMessage({ type: "python-ready", version: 6 }, parentOrigin, [parentPort]);
})();
