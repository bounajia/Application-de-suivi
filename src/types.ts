export type Role = "admin" | "user";
export type AccountStatus = "pending" | "active" | "rejected" | "suspended";
export type ProjectStatus = "planned" | "in_progress" | "paused" | "completed";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  createdAt: string;
}
export interface Attachment {
  id: string;
  name: string;
  originalName?: string;
  size: number;
  mimeType?: string;
  uploadedBy?: string;
  uploadedByName?: string;
  createdAt: string;
}
export interface Project {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  commencementOrder: string;
  progress: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  attachments: Attachment[];
}
export interface Activity {
  id: string;
  projectId: string | null;
  projectTitle: string;
  actorName: string;
  action: string;
  changes: { field: string; before: unknown; after: unknown }[];
  createdAt: string;
}
export type ProjectInput = Pick<
  Project,
  | "title"
  | "description"
  | "startDate"
  | "endDate"
  | "progress"
  | "status"
>;
