import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Link2,
  Code,
} from "lucide-react";
export default function RichText({
  value,
  onChange,
  readOnly = false,
}: {
  value?: JSONContent;
  onChange?: (v: JSONContent) => void;
  readOnly?: boolean;
}) {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          link: {
            openOnClick: readOnly,
            HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
          },
        }),
      ],
      content: value ?? { type: "doc", content: [{ type: "paragraph" }] },
      editable: !readOnly,
      immediatelyRender: false,
      onUpdate: ({ editor }) => onChange?.(editor.getJSON()),
      editorProps: {
        attributes: {
          class: "rich-content",
          "aria-label": readOnly
            ? "Учебный материал"
            : "Текст учебного материала",
        },
      },
    },
    [readOnly],
  );
  if (!editor) return null;
  return (
    <div className={`rich-editor ${readOnly ? "readonly" : ""}`}>
      {!readOnly && (
        <div
          className="rich-toolbar"
          role="toolbar"
          aria-label="Форматирование текста"
        >
          {[
            {
              label: "Полужирный",
              icon: Bold,
              active: editor.isActive("bold"),
              action: () => editor.chain().focus().toggleBold().run(),
            },
            {
              label: "Курсив",
              icon: Italic,
              active: editor.isActive("italic"),
              action: () => editor.chain().focus().toggleItalic().run(),
            },
            {
              label: "Маркированный список",
              icon: List,
              active: editor.isActive("bulletList"),
              action: () => editor.chain().focus().toggleBulletList().run(),
            },
            {
              label: "Нумерованный список",
              icon: ListOrdered,
              active: editor.isActive("orderedList"),
              action: () => editor.chain().focus().toggleOrderedList().run(),
            },
            {
              label: "Строчный код",
              icon: Code,
              active: editor.isActive("code"),
              action: () => editor.chain().focus().toggleCode().run(),
            },
            {
              label: "Ссылка",
              icon: Link2,
              active: editor.isActive("link"),
              action: () => {
                const url = window.prompt("Ссылка (https://…)");
                if (url?.startsWith("https://"))
                  editor.chain().focus().setLink({ href: url }).run();
              },
            },
            {
              label: "Отменить",
              icon: Undo2,
              active: false,
              action: () => editor.chain().focus().undo().run(),
            },
            {
              label: "Повторить",
              icon: Redo2,
              active: false,
              action: () => editor.chain().focus().redo().run(),
            },
          ].map(({ label, icon: Icon, active, action }) => (
            <button
              key={label}
              type="button"
              className={`icon-btn ${active ? "selected" : ""}`}
              title={label}
              aria-label={label}
              aria-pressed={active}
              onClick={action}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
