import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const version = "0.27.7";
const digest = "RUSVJlhQdfWfgO9hVHCiXoG+nVZQRS5D9FzgpLJ/VcgGBLSAKoPL8kTiOikxbHQm1kRISeWUBdulEgO26qpSRA==";
const [output, archive] = process.argv.slice(2);
if (!output) throw new Error("Укажите каталог для файлов Pyodide.");
const target = resolve(output, version);
let bytes;
if (archive) {
  bytes = await readFile(archive);
} else {
  const response = await fetch(`https://registry.npmjs.org/pyodide/-/pyodide-${version}.tgz`, {
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Не удалось скачать Pyodide: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
if (createHash("sha512").update(bytes).digest("base64") !== digest) {
  throw new Error("Контрольная сумма архива Pyodide не совпадает.");
}
const files = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
await mkdir(target, { recursive: true });
execFileSync("tar", [
  "-xzf", "-", "-C", target, "--strip-components=1", ...files.map((file) => `package/${file}`),
], { input: bytes });
