import { useEffect, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useHighlightedCode } from "../lib/code-highlight";
import { Info, AlertTriangle, ImageOff, Code2 } from "lucide-react";
import type { Block } from "../types";
import { supabase, videoEmbed } from "../lib/api";
import RichText from "./RichText";
export function Formula({ text }: { text: string }) {
  return (
    <div
      className="formula"
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(text, {
          throwOnError: false,
          displayMode: true,
          trust: false,
          strict: "warn",
        }),
      }}
    />
  );
}
function ImageBlock({ block }: { block: Block }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!block.path) return;
      const { data, error } = await supabase.storage
        .from("tutor-images")
        .createSignedUrl(block.path, 300);
      if (alive) {
        setUrl(data?.signedUrl ?? "");
        setError(!!error);
      }
    };
    void load();
    const t = setInterval(load, 240000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [block.path]);
  return (
    <figure>
      {error ? (
        <div className="image-error">
          <ImageOff />
          Изображение недоступно
        </div>
      ) : url ? (
        <img
          src={url}
          alt={block.caption || "Иллюстрация к материалу"}
          loading="lazy"
        />
      ) : (
        <p className="muted">Загрузка изображения…</p>
      )}
      {block.caption && <figcaption>{block.caption}</figcaption>}
    </figure>
  );
}
function CodeBlock({ block }: { block: Block }) {
  const language = block.language ?? "python";
  const code = block.text ?? "";
  const highlighted = useHighlightedCode(code, language);
  return (
    <div className="code-block">
      <div><Code2 size={14} />{language === "python" ? "Python" : language}</div>
      <pre>{highlighted === null ? <code>{code}</code> :
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />}</pre>
    </div>
  );
}

export default function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return <h2 className="lesson-heading">{block.text}</h2>;
    case "text":
      return <RichText value={block.content} readOnly />;
    case "example":
      return (
        <section className="example-block">
          <span className="eyebrow">Разобранный пример</span>
          <h3>{block.text}</h3>
          <RichText value={block.content} readOnly />
        </section>
      );
    case "note":
      return (
        <aside
          className={`note-block ${block.tone === "warning" ? "warning" : ""}`}
        >
          {block.tone === "warning" ? (
            <AlertTriangle size={20} />
          ) : (
            <Info size={20} />
          )}
          <p>{block.text}</p>
        </aside>
      );
    case "image":
      return <ImageBlock block={block} />;
    case "formula":
      return <Formula text={block.text ?? ""} />;
    case "code":
      return <CodeBlock block={block} />;
    case "table":
      return (
        <div className="table-scroll">
          <table className="lesson-table">
            <tbody>
              {block.cells?.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) =>
                    i === 0 ? <th key={j}>{cell}</th> : <td key={j}>{cell}</td>,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "video": {
      const source = videoEmbed(block.url ?? "");
      return source?.embed ? (
        <div className="video-frame">
          <iframe
            src={source.embed}
            title={block.caption || "Видеоурок"}
            loading="lazy"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation"
          />
        </div>
      ) : source?.video ? (
        <video controls src={source.video} preload="metadata" />
      ) : (
        <p className="muted">
          Добавьте ссылку на YouTube, Vimeo или видео MP4/WebM.
        </p>
      );
    }
    default:
      return null;
  }
}
