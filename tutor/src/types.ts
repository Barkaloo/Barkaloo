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
  audience?: "all" | "assigned";
  assigned?: boolean;
};
export type TaskType = "number" | "text" | "single" | "multiple" | "manual";
export type Answer = string | string[];
export type Task = {
  statement_doc?: JSONContent;
  bank_number?: number;
  bank_serial?: number;
  has_solution?: boolean;
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
  homework_item_id?: string | null;
  criteria?: string;
};
export type Progress = {
  user_id?: string;
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
    onboarding_complete: boolean;
  };
  role: "teacher" | "student";
  sections: Section[];
  topics: Topic[];
  modules: Module[];
  tasks: Task[];
  attempts: Attempt[];
  progress: Progress[];
  review_queue: Attempt[];
  students: Student[];
  student_notes: StudentNote[];
  teachers: {
    teacher_id: string;
    display_name: string;
    status: "active" | "archived";
    started_on: string;
  }[];
  assignments: ModuleAssignment[];
  invites: StudentInvite[];
  homeworks: Homework[];
  lessons: LessonRecord[];
  student_progress: Progress[];
  assignable_tasks: Task[];
};
export type Student = {
  teacher_id: string;
  student_id: string;
  nickname: string;
  display_name: string;
  started_on: string;
  status: "active" | "archived";
  notes: string;
  created_at: string;
  login_method?: "code" | "email";
  code_enabled?: boolean;
};
export type StudentInvite = {
  id: string;
  label: string;
  created_at: string;
  expires_at: string;
  revoked: boolean;
  used_by: string | null;
  used_at: string | null;
};
export type StudentNote = {
  id: string;
  teacher_id: string;
  student_id: string;
  body: string;
  noted_on: string;
  created_at: string;
  updated_at: string;
};
export type ModuleAssignment = {
  module_id: string;
  teacher_id: string;
  student_id: string;
  assigned_at: string;
};
export type HomeworkItem = {
  id: string;
  homework_id: string;
  task_id: string;
  position: number;
  snapshot: Task;
};
export type Homework = {
  id: string;
  teacher_id: string;
  student_id: string;
  title: string;
  comment: string;
  due_at: string | null;
  assigned_at: string;
  canceled_at: string | null;
  items: HomeworkItem[];
  requires_submission?: boolean;
  resources?: HomeworkResource[];
  submissions?: HomeworkSubmission[];
};
export type HomeworkResource = {
  id?: string;
  kind: "link" | "file";
  url?: string | null;
  path?: string | null;
  filename?: string | null;
  mime_type?: string | null;
};
export type HomeworkSubmission = {
  id: string;
  homework_id: string;
  student_id: string;
  is_preview: boolean;
  answer: string;
  status: "pending" | "accepted" | "returned";
  feedback: string;
  submitted_at: string;
  reviewed_at: string | null;
};
export type LessonStatus = "planned" | "completed" | "canceled";
export type LessonRecord = {
  id: string;
  teacher_id: string;
  student_id: string;
  starts_at: string;
  duration_minutes: number;
  status: LessonStatus;
  comment?: string;
  topic_ids: string[];
  homework_ids: string[];
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
