(() => {
  const workerScript = String.raw`
    self.onmessage = async ({ data }) => {
      const lines = data.input.split(/\r?\n/);
      let inputIndex = 0;
      let used = 0;
      const append = (line) => {
        used += line.length + 1;
        if (used > 16000) throw Error("Слишком большой вывод");
        self.postMessage({ type: "line", text: line });
      };
      try {
        importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js");
        const python = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/",
          stdin: () => inputIndex < lines.length ? lines[inputIndex++] : undefined,
          stdout: append,
          stderr: append,
        });
        const result = python.runPython(data.code);
        if (result?.destroy) result.destroy();
        self.postMessage({ type: "done" });
      } catch (error) {
        self.postMessage({ type: "done", text: String(error).slice(0, 4000) });
      }
    };
  `;

  let worker;
  let timer;
  let asset;
  let output = "";
  const announce = (message) => window.parent.postMessage(message, location.origin);
  const stop = (suffix) => {
    if (worker) worker.terminate();
    if (asset) URL.revokeObjectURL(asset);
    clearTimeout(timer);
    worker = undefined;
    asset = undefined;
    announce({ type: "python-result", text: output + (suffix || "") || "Нет вывода." });
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    const message = event.data;
    if (message?.type === "python-ready?") {
      announce({ type: "python-ready" });
    } else if (message?.type === "python-stop" && worker) {
      stop("Выполнение остановлено.");
    } else if (message?.type === "python-run" && !worker && typeof message.code === "string"
        && message.code.length <= 30000 && typeof message.input === "string" && message.input.length <= 10000) {
      output = "";
      try {
        asset = URL.createObjectURL(new Blob([workerScript], { type: "text/javascript" }));
        worker = new Worker(asset);
        worker.onmessage = ({ data }) => {
          if (data?.type === "line" && typeof data.text === "string") {
            output += data.text.slice(0, 16000 - output.length) + "\n";
            if (output.length >= 16000) stop("Достигнут предел вывода.");
          }
          if (data?.type === "done") stop(typeof data.text === "string" ? data.text.slice(0, 4000) : "");
        };
        worker.onerror = (event) => stop(event.message || "Не удалось загрузить среду Python.");
        timer = setTimeout(() => stop("Превышено время выполнения."), 30000);
        worker.postMessage({ code: message.code, input: message.input });
      } catch {
        stop("Не удалось запустить среду Python.");
      }
    }
  });
  announce({ type: "python-ready" });
})();
