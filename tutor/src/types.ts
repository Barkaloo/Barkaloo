import type { JSONContent } from "@tiptap/react";
export type BlockType =
  | "heading"
  | "text"
  | "image"
  | "video"
  | "formula"
  | "table"
  | "code"
  | "example"
  | "practice"
  | "note";
export type Block = {
  id: string;
  type: BlockType;
  text?: string;
  content?: JSONContent;
  path?: string;
  caption?: string;
  url?: string;
  language?: string;
  cells?: string[][];
  task_id?: string;
  tone?: "info" | "warning";
};
export type Section = {
  id: string;
  number: number;
  title: string;
  description: string;
  position: number;
  active: boolean;
};
export type Topic = {
  id: string;
  section_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  owner_id: string;
  position: number;
};
export type Module = {
  id: string;
  topic_id: string;
  title: string;
  description: string;
  blocks: Block[];
  revision: number;
  published_version: number | null;
  published_at: string | null;
  updated_at?: string;
};
export type TaskType = "number" | "text" | "single" | "multiple" | "manual";
export type Answer = string | string[];
export type Task = {
  id: string;
  module_id: string;
  type: TaskType;
  title: string;
  statement: string;
  prototype: string;
  difficulty: number;
  options: { id: string; label: string }[];
  position: number;
  version?: number;
  answer?: Answer;
  solution?: string;
  common_mistakes?: string;
  criteria?: string;
  ignore_case?: boolean;
  collapse_spaces?: boolean;
  reveal?: "after_attempt" | "after_correct" | "never";
};
export type Attempt = {
  id: string;
  student_id: string;
  task_id: string;
  module_id: string;
  topic_id: string;
  publication_version: number;
  answer: Answer;
  status: "correct" | "wrong" | "pending";
  feedback: {
    answer?: Answer;
    solution?: string;
    common_mistakes?: string;
    comment?: string;
  };
  task_snapshot: Task;
  created_at: string;
  is_preview: boolean;
  request_id: string;
};
export type Progress = {
  module_id: string;
  last_block_id: string | null;
  completed_at: string | null;
  updated_at: string;
};
export type Data = {
  profile: {
    user_id: string;
    display_name: string;
    theme: "system" | "light" | "dark";
  };
  role: "teacher" | "student";
  sections: Section[];
  topics: Topic[];
  modules: Module[];
  tasks: Task[];
  attempts: Attempt[];
  progress: Progress[];
  review_queue: Attempt[];
};
export const blockLabels: Record<BlockType, string> = {
  heading: "Заголовок",
  text: "Текст",
  image: "Изображение",
  video: "Видео",
  formula: "Формула",
  table: "Таблица",
  code: "Код",
  example: "Разобранный пример",
  practice: "Практическое задание",
  note: "Примечание",
};
export const taskLabels: Record<TaskType, string> = {
  number: "Числовой ответ",
  text: "Строковый ответ",
  single: "Один вариант",
  multiple: "Несколько вариантов",
  manual: "Ручная проверка",
};
