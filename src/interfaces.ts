export enum TaskStatus {
  Pending = "pending",
  Active = "active",
  Done = "done",
  Failed = "failed",
  RequiresClarification = "requires-clarification",
}

export enum TaskPriority {
  Low = "low",
  Medium = "medium",
  High = "high",
  Critical = "critical",
}

export enum TaskType {
  Code = "code",
  Debug = "debug",
  Test = "test",
  Plan = "plan",
  Refactor = "refactor",
  Documentation = "documentation",
  Research = "research",
  Generic = "generic",
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  type?: TaskType;
  dependsOn?: string[];
  parentId?: string;
  subtaskIds?: string[];
  failureReason?: string;
  suggestedRetryStrategy?: string;
  completedDetails?: string;
  artifactsGenerated?: string[];
  environmentContext?: string;
  summaryFilePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequestEntry {
  requestId: string;
  originalRequest: string;
  splitDetails: string;
  tasks: Task[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskManagerFile {
  requests: RequestEntry[];
  metadata: {
    lastRequestId: number;
    lastTaskId: number;
  };
}

export interface ArchivedTaskBundle {
  originalRequestId: string;
  originalRequestText: string;
  archivedRootTask: Task;
  archivedSubtasks: Task[];
  archivedAt: string;
}

export interface CompletedTasksFile {
  archivedTaskBundles: ArchivedTaskBundle[];
  metadata: {
    lastArchiveDate?: string;
  };
}

export interface TaskRow {
  taskId: string;
  requestId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string | null;
  dependsOn: string | null; // JSON
  subtaskIds: string | null; // JSON
  failureReason: string | null;
  suggestedRetryStrategy: string | null;
  completedDetails: string | null;
  artifactsGenerated: string | null; // JSON
  environmentContext: string | null;
  summaryFilePath: string | null;
  costData: string | null; // JSON
  feedbackHistory: string | null; // JSON
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequestRow {
  requestId: string;
  originalRequest: string;
  splitDetails: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ArchivedTaskRow {
  taskId: string;
  originalRequestId: string;
  originalRequestText: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  type: string | null;
  dependsOn: string | null; // JSON
  subtaskIds: string | null; // JSON
  failureReason: string | null;
  suggestedRetryStrategy: string | null;
  completedDetails: string | null;
  artifactsGenerated: string | null; // JSON
  environmentContext: string | null;
  summaryFilePath: string | null;
  costData: string | null; // JSON
  feedbackHistory: string | null; // JSON
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string;
}

export interface MetadataRow {
  key: string;
  value: string;
  updatedAt: string;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvalidOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOperationError";
  }
}
