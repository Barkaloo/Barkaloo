import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { supabase } from "../lib/api";
import type { HomeworkResource } from "../types";
import { ErrorBox } from "./ui";
export default function HomeworkMaterials({ resources }: { resources: HomeworkResource[] }) {
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  const download = async (resource: HomeworkResource) => {
    if (!resource.path) return;
    setBusy(resource.path); setError("");
    try {
      const { data, error } = await supabase.storage.from("tutor-homework").download(resource.path);
      if (error) throw error;
      const url = URL.createObjectURL(data), link = document.createElement("a");
      link.href = url; link.download = resource.filename ?? "material";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(`Не удалось скачать файл: ${(e as Error).message}`); }
    finally { setBusy(null); }
  };
  return <div className="homework-materials">
    {resources.map((r, index) => r.kind === "link" && /^https?:\/\//i.test(r.url ?? "") ? <a className="homework-resource" key={r.id ?? index} href={r.url!} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /><span>{r.url}</span></a> : r.kind === "file" ? <button type="button" className="homework-resource" key={r.id ?? index} disabled={busy !== null} onClick={() => void download(r)}><Download size={16} /><span>{busy === r.path ? "Скачивание…" : r.filename}</span></button> : null)}
    {error && <ErrorBox message={error} />}
  </div>;
}
