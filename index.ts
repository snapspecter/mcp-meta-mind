#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import { zodToJsonSchema as convertZodToJsonSchema } from "zod-to-json-schema";

// --- Configuration ---
const DEFAULT_DATA_DIR = path.join(
  os.homedir(),
  "dev/countradar/mcp_task_manager_data",
);
const TASKS_DIR_PATH = process.env.TASK_MANAGER_DATA_DIR || DEFAULT_DATA_DIR;

const ACTIVE_TASKS_FILE_NAME = "tasks.json";
const COMPLETED_TASKS_FILE_NAME = "completed_tasks.json";
const COMPLETED_TASK_SUMMARIES_DIR_NAME = "completed_task_summaries";

const ACTIVE_TASKS_FILE_PATH = path.join(
  TASKS_DIR_PATH,
  ACTIVE_TASKS_FILE_NAME,
);
const COMPLETED_TASKS_FILE_PATH = path.join(
  TASKS_DIR_PATH,
  COMPLETED_TASKS_FILE_NAME,
);
const COMPLETED_TASK_SUMMARIES_DIR_PATH = path.join(
  TASKS_DIR_PATH,
  COMPLETED_TASK_SUMMARIES_DIR_NAME,
);

// --- Enums ---
enum TaskStatus {
  Pending = "pending",
  Active = "active",
  Done = "done",
  Failed = "failed",
  RequiresClarification = "requires_clarification",
  Split = "split",
}

enum TaskPriority {
  High = "high",
  Medium = "medium",
  Low = "low",
}

enum TaskType {
  Code = "code",
  Debug = "debug",
  Test = "test",
  Plan = "plan",
  Refactor = "refactor",
  Documentation = "documentation",
  Research = "research",
  Generic = "generic",
}

// --- Interfaces ---
interface Task {
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

interface RequestEntry {
  requestId: string;
  originalRequest: string;
  splitDetails: string;
  tasks: Task[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TaskManagerFile {
  requests: RequestEntry[];
  metadata: {
    lastRequestId: number;
    lastTaskId: number;
  };
}

interface ArchivedTaskBundle {
  originalRequestId: string;
  originalRequestText: string;
  archivedRootTask: Task;
  archivedSubtasks: Task[];
  archivedAt: string;
}

interface CompletedTasksFile {
  archivedTaskBundles: ArchivedTaskBundle[];
  metadata: {
    lastArchiveDate?: string;
  };
}

// --- Custom Errors ---
class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

class InvalidOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOperationError";
  }
}

// --- Zod Schemas (Input Validation) ---
const TaskPriorityEnum = z.enum([
  TaskPriority.High,
  TaskPriority.Medium,
  TaskPriority.Low,
]);
const TaskTypeEnum = z.enum([
  TaskType.Code,
  TaskType.Debug,
  TaskType.Test,
  TaskType.Plan,
  TaskType.Refactor,
  TaskType.Documentation,
  TaskType.Research,
  TaskType.Generic,
]);
const SettableTaskStatusEnum = z.enum([
  TaskStatus.Pending,
  TaskStatus.Active,
  TaskStatus.Done,
  TaskStatus.Failed,
  TaskStatus.RequiresClarification,
]);

const BaseTaskDefinitionSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  priority: TaskPriorityEnum.optional(),
  type: TaskTypeEnum.optional(),
  dependsOn: z.array(z.string()).optional(),
  artifactsGenerated: z.array(z.string()).optional(),
  environmentContext: z.string().optional(),
});

const RequestPlanningSchema = z.object({
  originalRequest: z.string().min(1),
  splitDetails: z.string().optional(),
  tasks: z.array(BaseTaskDefinitionSchema).min(1),
});

const GetNextTaskSchema = z.object({
  requestId: z.string(),
});

const MarkTaskDoneSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  completedDetails: z.string().optional(),
  artifactsGenerated: z.array(z.string()).optional(),
});

const MarkTaskFailedSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  reason: z.string().optional(),
  suggestedRetryStrategy: z.string().optional(),
});

const OpenTaskDetailsSchema = z.object({
  taskId: z.string(),
});

const ListRequestsSchema = z.object({});

const AddTasksToRequestSchema = z.object({
  requestId: z.string(),
  tasks: z.array(BaseTaskDefinitionSchema).min(1),
});

const UpdateTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: SettableTaskStatusEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  type: TaskTypeEnum.optional(),
  dependsOn: z.array(z.string()).optional(),
  artifactsGenerated: z.array(z.string()).optional(),
  environmentContext: z.string().optional(),
  suggestedRetryStrategy: z.string().optional(),
});

const AddDependencySchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  dependsOnTaskId: z.string(),
});

const RemoveDependencySchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  dependsOnTaskId: z.string(),
});

const ValidateDependenciesSchema = z.object({
  requestId: z.string(),
});

const DeleteTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
});

const AddSubtaskSchema = z.object({
  requestId: z.string(),
  parentTaskId: z.string(),
  subtaskTitle: z.string().min(1),
  subtaskDescription: z.string(),
  priority: TaskPriorityEnum.optional(),
  type: TaskTypeEnum.optional(),
  dependsOn: z.array(z.string()).optional(),
  artifactsGenerated: z.array(z.string()).optional(),
  environmentContext: z.string().optional(),
});

const RemoveSubtaskSchema = z.object({
  requestId: z.string(),
  subtaskId: z.string(),
  parentTaskId: z.string().optional(),
});

const ArchiveTaskTreeSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
});

const LogTaskCompletionSummarySchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  summaryMarkdownContent: z.string().min(1),
  artifactsGenerated: z.array(z.string()).optional(),
});

// New Schemas for Phase 2
const SplitTaskSchema = z.object({
  requestId: z.string(),
  taskIdToSplit: z.string(),
  newSubtaskDefinitions: z
    .array(
      z.object({
        // Essentially BaseTaskDefinitionSchema
        title: z.string().min(1),
        description: z.string(),
        priority: TaskPriorityEnum.optional(),
        type: TaskTypeEnum.optional(),
        dependsOn: z.array(z.string()).optional(),
        artifactsGenerated: z.array(z.string()).optional(),
        environmentContext: z.string().optional(),
      }),
    )
    .min(1), // Must define at least one new subtask
});

const MergeTasksSchema = z.object({
  requestId: z.string(),
  primaryTaskId: z.string(),
  taskIdsToMerge: z.array(z.string()).min(1), // At least one task to merge
  newTitle: z.string().min(1).optional(),
  newDescription: z.string().optional(),
  newPriority: TaskPriorityEnum.optional(),
  newType: TaskTypeEnum.optional(),
  newEnvironmentContext: z.string().optional(),
  newArtifactsGenerated: z.array(z.string()).optional(),
});

// --- Tool Definitions ---
const REQUEST_PLANNING_TOOL: Tool = {
  name: "request_planning",
  description: "Register a new user request and plan its tasks.",
  inputSchema: convertZodToJsonSchema(RequestPlanningSchema) as any,
};
const GET_NEXT_TASK_TOOL: Tool = {
  name: "get_next_task",
  description: "Get the next actionable task for a request.",
  inputSchema: convertZodToJsonSchema(GetNextTaskSchema) as any,
};
const MARK_TASK_DONE_TOOL: Tool = {
  name: "mark_task_done",
  description: "Mark a task as done. Can include artifacts generated.",
  inputSchema: convertZodToJsonSchema(MarkTaskDoneSchema) as any,
};
const MARK_TASK_FAILED_TOOL: Tool = {
  name: "mark_task_failed",
  description: "Mark a task as failed. Can include a suggested retry strategy.",
  inputSchema: convertZodToJsonSchema(MarkTaskFailedSchema) as any,
};
const OPEN_TASK_DETAILS_TOOL: Tool = {
  name: "open_task_details",
  description: "Get details of a specific task.",
  inputSchema: convertZodToJsonSchema(OpenTaskDetailsSchema) as any,
};
const LIST_REQUESTS_TOOL: Tool = {
  name: "list_requests",
  description: "List all active requests.",
  inputSchema: convertZodToJsonSchema(ListRequestsSchema) as any,
};
const ADD_TASKS_TO_REQUEST_TOOL: Tool = {
  name: "add_tasks_to_request",
  description: "Add new tasks to an existing request.",
  inputSchema: convertZodToJsonSchema(AddTasksToRequestSchema) as any,
};
const UPDATE_TASK_TOOL: Tool = {
  name: "update_task",
  description:
    "Update an existing task's details (title, desc, priority, type, status, artifacts, envContext).",
  inputSchema: convertZodToJsonSchema(UpdateTaskSchema) as any,
};
const ADD_DEPENDENCY_TOOL: Tool = {
  name: "add_dependency",
  description: "Add a dependency between two tasks.",
  inputSchema: convertZodToJsonSchema(AddDependencySchema) as any,
};
const REMOVE_DEPENDENCY_TOOL: Tool = {
  name: "remove_dependency",
  description: "Remove a dependency between two tasks.",
  inputSchema: convertZodToJsonSchema(RemoveDependencySchema) as any,
};
const VALIDATE_DEPENDENCIES_TOOL: Tool = {
  name: "validate_dependencies",
  description: "Validate task dependencies within a request.",
  inputSchema: convertZodToJsonSchema(ValidateDependenciesSchema) as any,
};
const DELETE_TASK_TOOL: Tool = {
  name: "delete_task",
  description:
    "Permanently delete a task and its descendants from active tasks.",
  inputSchema: convertZodToJsonSchema(DeleteTaskSchema) as any,
};
const ADD_SUBTASK_TOOL: Tool = {
  name: "add_subtask",
  description: "Add a subtask to a parent task.",
  inputSchema: convertZodToJsonSchema(AddSubtaskSchema) as any,
};
const REMOVE_SUBTASK_TOOL: Tool = {
  name: "remove_subtask",
  description:
    "Permanently delete a subtask and its descendants from active tasks.",
  inputSchema: convertZodToJsonSchema(RemoveSubtaskSchema) as any,
};
const ARCHIVE_TASK_TREE_TOOL: Tool = {
  name: "archive_task_tree",
  description:
    "Archives a fully completed task tree (root task and all descendants must be 'done') to completed_tasks.json.",
  inputSchema: convertZodToJsonSchema(ArchiveTaskTreeSchema) as any,
};
const LOG_TASK_COMPLETION_SUMMARY_TOOL: Tool = {
  name: "log_task_completion_summary",
  description:
    "Logs a completion summary for a task with relevant details and achievements.",
  inputSchema: convertZodToJsonSchema(LogTaskCompletionSummarySchema) as any,
};

// New Tools for Phase 2
const SPLIT_TASK_TOOL: Tool = {
  name: "split_task",
  description:
    "Splits a task into multiple new subtasks. The original task becomes a container.",
  inputSchema: convertZodToJsonSchema(SplitTaskSchema) as any,
};

const MERGE_TASKS_TOOL: Tool = {
  name: "merge_tasks",
  description:
    "Merges multiple tasks into a primary task, consolidating details and dependencies.",
  inputSchema: convertZodToJsonSchema(MergeTasksSchema) as any,
};

// --- TaskManagerServer Class ---
class TaskManagerServer {
  private requestCounter = 0;
  private taskCounter = 0;
  private requestsMap: Map<string, RequestEntry> = new Map();
  private completedTasksData: CompletedTasksFile = {
    archivedTaskBundles: [],
    metadata: {},
  };
  private isInitialized = false;

  constructor() {}

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    await fs.mkdir(TASKS_DIR_PATH, { recursive: true });
    await fs.mkdir(COMPLETED_TASK_SUMMARIES_DIR_PATH, { recursive: true });

    await this._loadActiveTasksFromFile();
    await this._loadCompletedTasksFromFile();

    this.isInitialized = true; // Set initialized to true AFTER all loading/initial saving is done.

    console.log("MCP-AgentTaskHub Server initialized."); // Updated name
    console.log(`Active tasks file: ${ACTIVE_TASKS_FILE_PATH}`);
    console.log(`Completed tasks archive: ${COMPLETED_TASKS_FILE_PATH}`);
    console.log(
      `Task summaries directory: ${COMPLETED_TASK_SUMMARIES_DIR_PATH}`,
    );
  }

  private _assertInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(
        "TaskManagerServer is not initialized. Call init() first.",
      );
    }
  }

  private async _loadActiveTasksFromFile(): Promise<void> {
    try {
      const fileContent = await fs.readFile(ACTIVE_TASKS_FILE_PATH, "utf-8");
      const parsedData = JSON.parse(fileContent) as TaskManagerFile;
      this.requestsMap.clear();
      parsedData.requests.forEach((req) =>
        this.requestsMap.set(req.requestId, req),
      );
      this.requestCounter = parsedData.metadata?.lastRequestId || 0;
      this.taskCounter = parsedData.metadata?.lastTaskId || 0;
      if (!parsedData.metadata) this._recalculateCountersFromData();
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.log(
          `Active tasks file (${ACTIVE_TASKS_FILE_PATH}) not found. Initializing with empty data.`,
        );
        this.requestsMap.clear();
        this.requestCounter = 0;
        this.taskCounter = 0;
        await this._saveActiveTasksToFile(); // This will create the initial empty file
      } else {
        console.error("Error loading active tasks file:", error);
        throw error;
      }
    }
  }

  private _recalculateCountersFromData(): void {
    let maxReqId = 0;
    let maxTaskId = 0;
    for (const req of this.requestsMap.values()) {
      const reqNum = parseInt(req.requestId.replace("req-", ""), 10);
      if (!isNaN(reqNum) && reqNum > maxReqId) maxReqId = reqNum;
      req.tasks.forEach((task) => {
        const taskNum = parseInt(task.id.replace("task-", ""), 10);
        if (!isNaN(taskNum) && taskNum > maxTaskId) maxTaskId = taskNum;
      });
    }
    this.requestCounter = maxReqId;
    this.taskCounter = maxTaskId;
    console.log(
      "Recalculated counters from existing data as metadata was missing.",
    );
  }

  private async _saveActiveTasksToFile(): Promise<void> {
    // No _assertInitialized() here, as it can be called during init itself
    const dataToSave: TaskManagerFile = {
      requests: Array.from(this.requestsMap.values()),
      metadata: {
        lastRequestId: this.requestCounter,
        lastTaskId: this.taskCounter,
      },
    };
    try {
      await fs.mkdir(path.dirname(ACTIVE_TASKS_FILE_PATH), { recursive: true });
      await fs.writeFile(
        ACTIVE_TASKS_FILE_PATH,
        JSON.stringify(dataToSave, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("Failed to save active tasks file:", error);
      throw error;
    }
  }

  private async _loadCompletedTasksFromFile(): Promise<void> {
    try {
      const fileContent = await fs.readFile(COMPLETED_TASKS_FILE_PATH, "utf-8");
      this.completedTasksData = JSON.parse(fileContent) as CompletedTasksFile;
      if (!this.completedTasksData.archivedTaskBundles)
        this.completedTasksData.archivedTaskBundles = [];
      if (!this.completedTasksData.metadata)
        this.completedTasksData.metadata = {};
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.log(
          `Completed tasks file (${COMPLETED_TASKS_FILE_PATH}) not found. Initializing empty archive.`,
        );
        this.completedTasksData = { archivedTaskBundles: [], metadata: {} };
        await this._saveCompletedTasksToFile(); // This will create the initial empty file
      } else {
        console.error("Error loading completed tasks file:", error);
        // Decide if to throw or continue with empty completed tasks; for now, continue.
        this.completedTasksData = { archivedTaskBundles: [], metadata: {} };
      }
    }
  }

  private async _saveCompletedTasksToFile(): Promise<void> {
    // No _assertInitialized() here
    this.completedTasksData.metadata.lastArchiveDate = new Date().toISOString();
    try {
      await fs.mkdir(path.dirname(COMPLETED_TASKS_FILE_PATH), {
        recursive: true,
      });
      await fs.writeFile(
        COMPLETED_TASKS_FILE_PATH,
        JSON.stringify(this.completedTasksData, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("Failed to save completed tasks file:", error);
      throw error;
    }
  }

  private _getRequestEntryOrThrow(requestId: string): RequestEntry {
    this._assertInitialized(); // Public facing methods should assert
    const reqEntry = this.requestsMap.get(requestId);
    if (!reqEntry) throw new NotFoundError(`Request '${requestId}' not found.`);
    return reqEntry;
  }

  private _getTaskOrThrow(reqEntry: RequestEntry, taskId: string): Task {
    // Assuming reqEntry is already validated by caller
    const task = reqEntry.tasks.find((t) => t.id === taskId);
    if (!task)
      throw new NotFoundError(
        `Task '${taskId}' not found in request '${reqEntry.requestId}'.`,
      );
    return task;
  }

  private _getTaskFromAnyRequestOrThrow(taskId: string): {
    task: Task;
    requestEntry: RequestEntry;
  } {
    this._assertInitialized(); // Public facing methods should assert
    for (const requestEntry of this.requestsMap.values()) {
      const task = requestEntry.tasks.find((t) => t.id === taskId);
      if (task) return { task, requestEntry };
    }
    throw new NotFoundError(
      `Task '${taskId}' not found in any active request.`,
    );
  }

  private _generateTaskId(): string {
    this.taskCounter++;
    return `task-${this.taskCounter}`;
  }
  private _generateRequestId(): string {
    this.requestCounter++;
    return `req-${this.requestCounter}`;
  }

  private _areAllDescendantsStatus(
    task: Task,
    allTasksInRequestMap: Map<string, Task>,
    targetStatus: TaskStatus,
  ): boolean {
    if (task.status !== targetStatus) return false;
    if (!task.subtaskIds || task.subtaskIds.length === 0) return true;
    for (const subtaskId of task.subtaskIds) {
      const subtask = allTasksInRequestMap.get(subtaskId);
      if (
        !subtask ||
        !this._areAllDescendantsStatus(
          subtask,
          allTasksInRequestMap,
          targetStatus,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  private _isTaskTreeFullyTerminal(
    rootTask: Task,
    allTasksInRequestMap: Map<string, Task>,
  ): boolean {
    const isTerminal = (taskStatus: TaskStatus) =>
      taskStatus === TaskStatus.Done || taskStatus === TaskStatus.Failed;
    if (!isTerminal(rootTask.status)) return false;
    if (!rootTask.subtaskIds || rootTask.subtaskIds.length === 0) return true;
    for (const subtaskId of rootTask.subtaskIds) {
      const subtask = allTasksInRequestMap.get(subtaskId);
      if (
        !subtask ||
        !this._isTaskTreeFullyTerminal(subtask, allTasksInRequestMap)
      ) {
        return false;
      }
    }
    return true;
  }

  private _collectTaskWithDescendants(
    rootTask: Task,
    allTasksInRequestMap: Map<string, Task>,
  ): Task[] {
    const collectedTasks: Task[] = [];
    const queue: Task[] = [rootTask];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const currentTask = queue.shift()!;
      if (visited.has(currentTask.id)) continue;
      visited.add(currentTask.id);
      collectedTasks.push(JSON.parse(JSON.stringify(currentTask)));
      if (currentTask.subtaskIds) {
        for (const subId of currentTask.subtaskIds) {
          const subtask = allTasksInRequestMap.get(subId);
          if (subtask) queue.push(subtask);
        }
      }
    }
    return collectedTasks;
  }

  private _removeTaskAndDescendantsFromRequest(
    reqEntry: RequestEntry,
    taskIdToRemove: string,
  ): boolean {
    const taskMap = new Map(reqEntry.tasks.map((t) => [t.id, t]));
    if (!taskMap.has(taskIdToRemove)) return false;
    const tasksToDeleteIds = new Set<string>();
    const queue = [taskIdToRemove];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (tasksToDeleteIds.has(currentId)) continue;
      tasksToDeleteIds.add(currentId);
      const task = taskMap.get(currentId);
      if (task?.subtaskIds)
        task.subtaskIds.forEach((subId) => {
          if (taskMap.has(subId)) queue.push(subId);
        });
    }
    const taskToRemove = taskMap.get(taskIdToRemove);
    if (taskToRemove?.parentId) {
      const parent = taskMap.get(taskToRemove.parentId);
      if (parent?.subtaskIds) {
        parent.subtaskIds = parent.subtaskIds.filter(
          (id) => id !== taskIdToRemove,
        );
        if (parent.subtaskIds.length === 0) delete parent.subtaskIds;
      }
    }
    const initialTaskCount = reqEntry.tasks.length;
    reqEntry.tasks = reqEntry.tasks.filter((t) => !tasksToDeleteIds.has(t.id));
    reqEntry.tasks.forEach((task) => {
      if (task.dependsOn) {
        task.dependsOn = task.dependsOn.filter(
          (depId) => !tasksToDeleteIds.has(depId),
        );
        if (task.dependsOn.length === 0) delete task.dependsOn;
      }
      if (task.parentId && tasksToDeleteIds.has(task.parentId))
        delete task.parentId;
    });
    reqEntry.updatedAt = new Date().toISOString();
    return reqEntry.tasks.length < initialTaskCount;
  }

  // --- Private Helper for Auto-Archiving ---

  private async _autoArchiveTaskTree(
    requestId: string,
    rootTaskIdToArchive: string,
  ): Promise<{ archivedCount: number }> {
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const rootTask = this._getTaskOrThrow(reqEntry, rootTaskIdToArchive);

    const taskMap = new Map(reqEntry.tasks.map((t) => [t.id, t]));
    const tasksToArchiveBundleRaw = this._collectTaskWithDescendants(
      rootTask,
      taskMap,
    );

    const archivedRootTask = tasksToArchiveBundleRaw.find(
      (t) => t.id === rootTask.id,
    )!;
    const summaryFileName = `req-${reqEntry.requestId}-task-${archivedRootTask.id}.md`;
    const summaryFilePathFull = path.join(
      COMPLETED_TASK_SUMMARIES_DIR_PATH,
      summaryFileName,
    );
    try {
      await fs.access(summaryFilePathFull);
      archivedRootTask.summaryFilePath = summaryFileName;
    } catch (e) {
      /* File doesn't exist */
    }

    this.completedTasksData.archivedTaskBundles.push({
      originalRequestId: requestId,
      originalRequestText: reqEntry.originalRequest,
      archivedRootTask: archivedRootTask,
      archivedSubtasks: tasksToArchiveBundleRaw.filter(
        (t) => t.id !== rootTask.id,
      ),
      archivedAt: new Date().toISOString(),
    });

    this._removeTaskAndDescendantsFromRequest(reqEntry, rootTaskIdToArchive);

    await this._saveCompletedTasksToFile();
    await this._saveActiveTasksToFile();

    return {
      archivedCount: tasksToArchiveBundleRaw.length,
    };
  }

  // --- Public Tool Methods ---

  // In TaskManagerServer class:

  public async requestPlanning(
    params: z.infer<typeof RequestPlanningSchema>,
  ): Promise<object> {
    this._assertInitialized();

    const { originalRequest, tasks: taskDefs, splitDetails } = params;
    const now = new Date().toISOString();
    const requestId = this._generateRequestId(); // A new requestId is generated here

    const newTasks: Task[] = taskDefs.map((taskDef) => ({
      id: this._generateTaskId(),
      title: taskDef.title,
      description: taskDef.description,
      status: TaskStatus.Pending,
      priority: taskDef.priority || TaskPriority.Medium,
      type: taskDef.type || TaskType.Generic,
      dependsOn: taskDef.dependsOn || [],
      artifactsGenerated: taskDef.artifactsGenerated || [],
      environmentContext: taskDef.environmentContext,
      completedDetails: "",
      createdAt: now,
      updatedAt: now,
      subtaskIds: [],
    }));

    const newRequestEntry: RequestEntry = {
      requestId, // Use the newly generated requestId
      originalRequest,
      splitDetails: splitDetails || originalRequest,
      tasks: newTasks,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    this.requestsMap.set(requestId, newRequestEntry);
    await this._saveActiveTasksToFile();

    return {
      status: "planned",
      requestId, // Return the new requestId
      totalTasks: newTasks.length,
      tasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        type: t.type,
      })),
      message: `Request '${requestId}' planned.\n${this._formatTaskProgressTable(requestId)}`,
    };
  }
  public async getNextTask(
    params: z.infer<typeof GetNextTaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    if (reqEntry.completed)
      return {
        status: "already_completed",
        message: "Request already completed.",
      };

    const taskMap = new Map(reqEntry.tasks.map((t) => [t.id, t]));
    const areDependenciesMet = (task: Task): boolean =>
      task.dependsOn?.every(
        (depId) => taskMap.get(depId)?.status === TaskStatus.Done,
      ) ?? true;

    let actionableTasks = reqEntry.tasks.filter((task) => {
      if (
        task.status === TaskStatus.Done ||
        task.status === TaskStatus.Failed ||
        task.status === TaskStatus.Split
      ) {
        // Exclude Split tasks
        return false;
      }
      const parent = task.parentId ? taskMap.get(task.parentId) : null;
      if (
        parent &&
        (parent.status === TaskStatus.Active ||
          parent.status === TaskStatus.Pending ||
          parent.status === TaskStatus.Split)
      ) {
        if (
          parent.status === TaskStatus.Active ||
          parent.status === TaskStatus.Split
        ) {
          // Children of Active or Split parents
          return (
            parent.subtaskIds?.includes(task.id) && areDependenciesMet(task)
          );
        }
        return false;
      }
      return areDependenciesMet(task);
    });

    let tasksRequiringClarification = actionableTasks.filter(
      (t) => t.status === TaskStatus.RequiresClarification,
    );
    let potentialNextTasks = actionableTasks.filter(
      (t) => t.status === TaskStatus.Pending || t.status === TaskStatus.Active,
    );

    if (
      potentialNextTasks.length === 0 &&
      tasksRequiringClarification.length > 0
    ) {
      potentialNextTasks = tasksRequiringClarification;
    }

    if (potentialNextTasks.length === 0) {
      const allTerminalOrSplit = reqEntry.tasks.every(
        (t) =>
          t.status === TaskStatus.Done ||
          t.status === TaskStatus.Failed ||
          t.status === TaskStatus.Split,
      );
      const progressTable = this._formatTaskProgressTable(requestId);
      if (allTerminalOrSplit && !reqEntry.completed) {
        const nonSplitTasks = reqEntry.tasks.filter(
          (t) => t.status !== TaskStatus.Split,
        );
        if (
          nonSplitTasks.every(
            (t) =>
              t.status === TaskStatus.Done || t.status === TaskStatus.Failed,
          )
        ) {
          reqEntry.completed = true;
          reqEntry.updatedAt = new Date().toISOString();
          await this._saveActiveTasksToFile();
          return {
            status: "all_tasks_terminal_request_completed",
            message: `All actionable tasks terminal. Request '${requestId}' completed.\n${progressTable}`,
          };
        }
      }
      return {
        status: "no_actionable_task",
        message: `No actionable tasks found for '${requestId}'.\n${progressTable}`,
      };
    }

    const statusOrder: Record<
      TaskStatus.Active | TaskStatus.Pending | TaskStatus.RequiresClarification,
      number
    > = {
      [TaskStatus.Active]: 0,
      [TaskStatus.Pending]: 1,
      [TaskStatus.RequiresClarification]: 2,
    };

    potentialNextTasks.sort((a, b) => {
      const priorityOrder = {
        [TaskPriority.High]: 0,
        [TaskPriority.Medium]: 1,
        [TaskPriority.Low]: 2,
      };
      const aStatusSortable = a.status as
        | TaskStatus.Active
        | TaskStatus.Pending
        | TaskStatus.RequiresClarification;
      const bStatusSortable = b.status as
        | TaskStatus.Active
        | TaskStatus.Pending
        | TaskStatus.RequiresClarification;

      if (statusOrder[aStatusSortable] !== statusOrder[bStatusSortable]) {
        return statusOrder[aStatusSortable] - statusOrder[bStatusSortable];
      }
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return (
        parseInt(a.id.replace("task-", ""), 10) -
        parseInt(b.id.replace("task-", ""), 10)
      );
    });

    const nextTask = potentialNextTasks[0];
    const now = new Date().toISOString();
    if (nextTask.status === TaskStatus.Pending) {
      if (nextTask.parentId) {
        const parent = taskMap.get(nextTask.parentId);
        if (parent && parent.status === TaskStatus.Pending) {
          parent.status = TaskStatus.Active;
          parent.updatedAt = now;
        }
      }
      nextTask.status = TaskStatus.Active;
      nextTask.updatedAt = now;
      reqEntry.updatedAt = now;
      await this._saveActiveTasksToFile();
    }

    return {
      status: "next_task",
      task: {
        id: nextTask.id,
        title: nextTask.title,
        priority: nextTask.priority,
        type: nextTask.type,
        status: nextTask.status,
      },
      message: `Next task for '${requestId}': '${nextTask.title}'.\n${this._formatTaskProgressTable(requestId)}`,
    };
  }

  public async markTaskDone(
    params: z.infer<typeof MarkTaskDoneSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, completedDetails, artifactsGenerated } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);

    if (task.status === TaskStatus.Done)
      return { status: "already_done", message: "Task already done." };
    if (task.status === TaskStatus.Failed)
      throw new InvalidOperationError("Task failed. Cannot mark as done.");
    if (task.status === TaskStatus.Split)
      throw new InvalidOperationError(
        "Split task cannot be marked done directly; its subtasks must be completed.",
      );

    const now = new Date().toISOString();
    task.status = TaskStatus.Done;
    task.completedDetails = completedDetails || "Completed successfully.";
    task.failureReason = undefined;
    task.suggestedRetryStrategy = undefined;
    if (artifactsGenerated) task.artifactsGenerated = artifactsGenerated;
    task.updatedAt = now;
    reqEntry.updatedAt = now;

    let message = `Task '${taskId}' marked done.`;

    const parentCompletionResult = await this._handleParentCompletion(
      reqEntry,
      task,
      now,
    );
    message += parentCompletionResult.messageAugmentation;
    const treeCompletionStatus = parentCompletionResult.treeCompletionStatus;

    const allTasksInRequestTerminalOrSplit = reqEntry.tasks.every(
      (t) =>
        t.status === TaskStatus.Done ||
        t.status === TaskStatus.Failed ||
        t.status === TaskStatus.Split,
    );
    if (allTasksInRequestTerminalOrSplit && !reqEntry.completed) {
      const nonSplitTasks = reqEntry.tasks.filter(
        (t) => t.status !== TaskStatus.Split,
      );
      if (
        nonSplitTasks.every(
          (t) => t.status === TaskStatus.Done || t.status === TaskStatus.Failed,
        )
      ) {
        reqEntry.completed = true;
        message += ` All actionable tasks in request '${reqEntry.requestId}' are terminal. Request completed.`;
      }
    }

    await this._saveActiveTasksToFile();
    return {
      status: "task_marked_done",
      message: `${message}\n${this._formatTaskProgressTable(requestId)}`,
      task: { id: task.id, title: task.title, status: task.status },
      requestCompleted: reqEntry.completed,
      ...(treeCompletionStatus && { treeCompletionStatus }),
    };
  }

  public async markTaskFailed(
    params: z.infer<typeof MarkTaskFailedSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, reason, suggestedRetryStrategy } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);

    if (task.status === TaskStatus.Failed)
      return { status: "already_failed", message: "Task already failed." };
    if (task.status === TaskStatus.Done)
      throw new InvalidOperationError("Task done. Cannot mark as failed.");
    if (task.status === TaskStatus.Split)
      throw new InvalidOperationError(
        "Split task cannot be marked failed directly.",
      );

    const now = new Date().toISOString();
    task.status = TaskStatus.Failed;
    task.failureReason = reason || "No reason provided.";
    if (suggestedRetryStrategy)
      task.suggestedRetryStrategy = suggestedRetryStrategy;
    task.completedDetails = "";
    task.updatedAt = now;
    reqEntry.updatedAt = now;

    let message = `Task '${taskId}' marked failed.`;
    const parentCompletionResult = await this._handleParentCompletion(
      reqEntry,
      task,
      now,
    );
    message += parentCompletionResult.messageAugmentation;
    const treeCompletionStatus = parentCompletionResult.treeCompletionStatus;

    const allTasksInRequestTerminalOrSplit = reqEntry.tasks.every(
      (t) =>
        t.status === TaskStatus.Done ||
        t.status === TaskStatus.Failed ||
        t.status === TaskStatus.Split,
    );
    if (allTasksInRequestTerminalOrSplit && !reqEntry.completed) {
      const nonSplitTasks = reqEntry.tasks.filter(
        (t) => t.status !== TaskStatus.Split,
      );
      if (
        nonSplitTasks.every(
          (t) => t.status === TaskStatus.Done || t.status === TaskStatus.Failed,
        )
      ) {
        reqEntry.completed = true;
        message += ` All actionable tasks in request '${reqEntry.requestId}' are terminal. Request completed.`;
      }
    }

    await this._saveActiveTasksToFile();
    return {
      status: "task_marked_failed",
      message: `${message}\n${this._formatTaskProgressTable(requestId)}`,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        failureReason: task.failureReason,
      },
      requestCompleted: reqEntry.completed,
      ...(treeCompletionStatus && { treeCompletionStatus }),
    };
  }

  public async updateTask(
    params: z.infer<typeof UpdateTaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, ...updates } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);

    if (task.status === TaskStatus.Done && updates.status !== TaskStatus.Done) {
      throw new InvalidOperationError(
        `Cannot change status of a 'done' task unless to itself.`,
      );
    }
    if (task.status !== TaskStatus.Failed && updates.suggestedRetryStrategy) {
      throw new InvalidOperationError(
        `'suggestedRetryStrategy' can only be set on 'failed' tasks.`,
      );
    }

    let updated = false;
    if (updates.title && task.title !== updates.title) {
      task.title = updates.title;
      updated = true;
    }
    if (updates.description && task.description !== updates.description) {
      task.description = updates.description;
      updated = true;
    }
    if (updates.priority && task.priority !== updates.priority) {
      task.priority = updates.priority;
      updated = true;
    }
    if (updates.type && task.type !== updates.type) {
      task.type = updates.type;
      updated = true;
    }
    if (updates.status && task.status !== updates.status) {
      task.status = updates.status;
      updated = true;
    }
    if (
      updates.artifactsGenerated &&
      JSON.stringify(task.artifactsGenerated) !==
        JSON.stringify(updates.artifactsGenerated)
    ) {
      task.artifactsGenerated = updates.artifactsGenerated;
      updated = true;
    }
    if (
      updates.environmentContext &&
      task.environmentContext !== updates.environmentContext
    ) {
      task.environmentContext = updates.environmentContext;
      updated = true;
    }
    if (
      updates.suggestedRetryStrategy &&
      task.suggestedRetryStrategy !== updates.suggestedRetryStrategy
    ) {
      if (task.status !== TaskStatus.Failed)
        throw new InvalidOperationError(
          "Can only set retry strategy on failed tasks.",
        );
      task.suggestedRetryStrategy = updates.suggestedRetryStrategy;
      updated = true;
    }

    if (!updated)
      return { status: "no_change", message: "No changes applied." };

    const now = new Date().toISOString();
    task.updatedAt = now;
    reqEntry.updatedAt = now;
    await this._saveActiveTasksToFile();
    return {
      status: "task_updated",
      message: `Task '${taskId}' updated.\n${this._formatTaskProgressTable(requestId)}`,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        type: task.type,
      },
    };
  }

  public async deleteTask(
    params: z.infer<typeof DeleteTaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    this._getTaskOrThrow(reqEntry, taskId);

    const removed = this._removeTaskAndDescendantsFromRequest(reqEntry, taskId);
    if (removed) {
      await this._saveActiveTasksToFile();
      return {
        status: "task_deleted",
        message: `Task '${taskId}' and its descendants permanently deleted.\n${this._formatTaskProgressTable(requestId)}`,
      };
    }
    throw new InvalidOperationError(
      `Failed to delete task '${taskId}'. It might have already been removed or an issue occurred.`,
    );
  }

  public async removeSubtask(
    params: z.infer<typeof RemoveSubtaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, subtaskId, parentTaskId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const subtaskToRemove = this._getTaskOrThrow(reqEntry, subtaskId);

    if (!subtaskToRemove.parentId) {
      throw new InvalidOperationError(
        `Task '${subtaskId}' is not a subtask. Use 'delete_task'.`,
      );
    }
    if (parentTaskId) {
      const explicitParent = this._getTaskOrThrow(reqEntry, parentTaskId);
      if (subtaskToRemove.parentId !== explicitParent.id) {
        throw new InvalidOperationError(
          `Task '${subtaskId}' is not a direct subtask of specified parent '${parentTaskId}'.`,
        );
      }
    }
    return this.deleteTask({ requestId, taskId: subtaskId });
  }

  public async addSubtask(
    params: z.infer<typeof AddSubtaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const {
      requestId,
      parentTaskId,
      subtaskTitle,
      subtaskDescription,
      priority,
      type,
      dependsOn,
      artifactsGenerated,
      environmentContext,
    } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const parentTask = this._getTaskOrThrow(reqEntry, parentTaskId);

    if (reqEntry.completed)
      throw new InvalidOperationError(
        "Cannot add subtask to a completed request.",
      );
    if (
      parentTask.status === TaskStatus.Done ||
      parentTask.status === TaskStatus.Failed
    ) {
      throw new InvalidOperationError(
        `Cannot add subtask to parent '${parentTaskId}' in terminal status ('${parentTask.status}').`,
      );
    }

    const now = new Date().toISOString();
    const newSubtask: Task = {
      id: this._generateTaskId(),
      title: subtaskTitle,
      description: subtaskDescription,
      status: TaskStatus.Pending,
      priority: priority || parentTask.priority || TaskPriority.Medium,
      type: type || parentTask.type || TaskType.Generic,
      dependsOn: dependsOn || [],
      artifactsGenerated: artifactsGenerated || [],
      environmentContext: environmentContext || parentTask.environmentContext,
      parentId: parentTaskId,
      completedDetails: "",
      createdAt: now,
      updatedAt: now,
      subtaskIds: [],
    };
    reqEntry.tasks.push(newSubtask);
    if (!parentTask.subtaskIds) parentTask.subtaskIds = [];
    parentTask.subtaskIds.push(newSubtask.id);
    parentTask.updatedAt = now;
    reqEntry.updatedAt = now;
    if (reqEntry.completed) reqEntry.completed = false;

    await this._saveActiveTasksToFile();
    return {
      status: "subtask_added",
      parentTaskId,
      subtask: {
        id: newSubtask.id,
        title: newSubtask.title,
        type: newSubtask.type,
      },
      message: `Subtask '${newSubtask.title}' added.\n${this._formatTaskProgressTable(requestId)}`,
    };
  }

  public async archiveTaskTree(
    params: z.infer<typeof ArchiveTaskTreeSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId: rootTaskIdToArchive } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const rootTask = this._getTaskOrThrow(reqEntry, rootTaskIdToArchive);

    const taskMap = new Map(reqEntry.tasks.map((t) => [t.id, t]));
    if (!this._areAllDescendantsStatus(rootTask, taskMap, TaskStatus.Done)) {
      throw new InvalidOperationError(
        `Cannot archive task tree '${rootTaskIdToArchive}'. Not all tasks in the tree are 'done'.`,
      );
    }

    const tasksToArchiveBundleRaw = this._collectTaskWithDescendants(
      rootTask,
      taskMap,
    );

    const archivedRootTask = tasksToArchiveBundleRaw.find(
      (t) => t.id === rootTask.id,
    )!;
    const summaryFileName = `req-${reqEntry.requestId}-task-${archivedRootTask.id}.md`;
    const summaryFilePathFull = path.join(
      COMPLETED_TASK_SUMMARIES_DIR_PATH,
      summaryFileName,
    );
    try {
      await fs.access(summaryFilePathFull);
      archivedRootTask.summaryFilePath = summaryFileName;
    } catch (e) {
      /* File doesn't exist */
    }

    this.completedTasksData.archivedTaskBundles.push({
      originalRequestId: requestId,
      originalRequestText: reqEntry.originalRequest,
      archivedRootTask: archivedRootTask,
      archivedSubtasks: tasksToArchiveBundleRaw.filter(
        (t) => t.id !== rootTask.id,
      ),
      archivedAt: new Date().toISOString(),
    });

    this._removeTaskAndDescendantsFromRequest(reqEntry, rootTaskIdToArchive);

    await this._saveCompletedTasksToFile();
    await this._saveActiveTasksToFile();

    return {
      status: "task_tree_archived",
      message: `Task tree rooted at '${rootTaskIdToArchive}' (${tasksToArchiveBundleRaw.length} tasks) archived.\n${this._formatTaskProgressTable(requestId)}`,
      archivedCount: tasksToArchiveBundleRaw.length,
    };
  }

  public async logTaskCompletionSummary(
    params: z.infer<typeof LogTaskCompletionSummarySchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, summaryMarkdownContent, artifactsGenerated } =
      params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);

    let taskUpdated = false;
    if (
      artifactsGenerated &&
      JSON.stringify(task.artifactsGenerated) !==
        JSON.stringify(artifactsGenerated)
    ) {
      task.artifactsGenerated = artifactsGenerated;
      task.updatedAt = new Date().toISOString();
      reqEntry.updatedAt = new Date().toISOString();
      taskUpdated = true;
    }

    const summaryFileName = `req-${requestId}-task-${taskId}.md`;
    const summaryFilePath = path.join(
      COMPLETED_TASK_SUMMARIES_DIR_PATH,
      summaryFileName,
    );

    try {
      await fs.writeFile(summaryFilePath, summaryMarkdownContent, "utf-8");
      if (taskUpdated) {
        await this._saveActiveTasksToFile();
      }
      return {
        status: "summary_logged",
        taskId,
        summaryFilePath: summaryFileName,
        message: `Completion summary for task '${taskId}' logged to '${summaryFileName}'. ${taskUpdated ? "Task artifacts also updated." : ""}`,
      };
    } catch (error: any) {
      console.error(`Failed to write summary for task ${taskId}:`, error);
      throw new Error(`Failed to write summary file: ${error.message}`);
    }
  }

  public async openTaskDetails(
    params: z.infer<typeof OpenTaskDetailsSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { taskId } = params;
    const { task, requestEntry } = this._getTaskFromAnyRequestOrThrow(taskId);
    return { status: "task_details", requestId: requestEntry.requestId, task };
  }

  public async listRequests(
    _params: z.infer<typeof ListRequestsSchema>,
  ): Promise<object> {
    this._assertInitialized();
    return {
      status: "requests_listed",
      message: `Current active requests:\n${this._formatRequestsList()}`,
      requests: Array.from(this.requestsMap.values()).map((req) => ({
        requestId: req.requestId,
        originalRequest: req.originalRequest,
        totalTasks: req.tasks.length,
        terminalTasks: req.tasks.filter(
          (t) => t.status === TaskStatus.Done || t.status === TaskStatus.Failed,
        ).length,
        requestCompleted: req.completed,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
      })),
    };
  }

  public async addTasksToRequest(
    params: z.infer<typeof AddTasksToRequestSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, tasks: taskDefs } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    if (reqEntry.completed)
      throw new InvalidOperationError(
        "Cannot add tasks to a completed request.",
      );

    const now = new Date().toISOString();
    const newTasks: Task[] = taskDefs.map((taskDef) => ({
      id: this._generateTaskId(),
      title: taskDef.title,
      description: taskDef.description,
      status: TaskStatus.Pending,
      priority: taskDef.priority || TaskPriority.Medium,
      type: taskDef.type || TaskType.Generic,
      dependsOn: taskDef.dependsOn || [],
      artifactsGenerated: taskDef.artifactsGenerated || [],
      environmentContext: taskDef.environmentContext,
      completedDetails: "",
      createdAt: now,
      updatedAt: now,
      subtaskIds: [],
    }));

    reqEntry.tasks.push(...newTasks);
    reqEntry.updatedAt = now;
    if (reqEntry.completed && newTasks.length > 0) reqEntry.completed = false;

    await this._saveActiveTasksToFile();
    return {
      status: "tasks_added",
      message: `Added ${newTasks.length} tasks.\n${this._formatTaskProgressTable(requestId)}`,
      newTasks: newTasks.map((t) => ({
        id: t.id,
        title: t.title,
        type: t.type,
      })),
    };
  }

  public async addDependency(
    params: z.infer<typeof AddDependencySchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, dependsOnTaskId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);
    const dependsOnTask = this._getTaskOrThrow(reqEntry, dependsOnTaskId);
    if (taskId === dependsOnTaskId)
      throw new InvalidOperationError("Task cannot depend on itself.");
    if (dependsOnTask.dependsOn?.includes(taskId))
      throw new InvalidOperationError(
        `Circular dependency: ${dependsOnTaskId} already depends on ${taskId}.`,
      );
    if (!task.dependsOn) task.dependsOn = [];
    if (task.dependsOn.includes(dependsOnTaskId))
      return {
        status: "no_change",
        message: `Task '${taskId}' already depends on '${dependsOnTaskId}'.`,
      };
    task.dependsOn.push(dependsOnTaskId);
    const now = new Date().toISOString();
    task.updatedAt = now;
    reqEntry.updatedAt = now;
    await this._saveActiveTasksToFile();
    return {
      status: "dependency_added",
      message: `Task '${taskId}' now depends on '${dependsOnTaskId}'.`,
    };
  }

  public async removeDependency(
    params: z.infer<typeof RemoveDependencySchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, dependsOnTaskId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);
    if (!task.dependsOn || !task.dependsOn.includes(dependsOnTaskId))
      return {
        status: "no_change",
        message: `Task '${taskId}' does not depend on '${dependsOnTaskId}'.`,
      };
    task.dependsOn = task.dependsOn.filter((id) => id !== dependsOnTaskId);
    if (task.dependsOn.length === 0) delete task.dependsOn;
    const now = new Date().toISOString();
    task.updatedAt = now;
    reqEntry.updatedAt = now;
    await this._saveActiveTasksToFile();
    return {
      status: "dependency_removed",
      message: `Dependency of '${taskId}' on '${dependsOnTaskId}' removed.`,
    };
  }

  public async validateDependencies(
    params: z.infer<typeof ValidateDependenciesSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const issues: string[] = [];
    const taskMap = new Map(reqEntry.tasks.map((task) => [task.id, task]));
    for (const task of reqEntry.tasks) {
      if (task.dependsOn)
        task.dependsOn.forEach((depId) => {
          if (!taskMap.has(depId))
            issues.push(
              `Task ${task.id} depends on non-existent task ${depId}.`,
            );
        });
    }
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    let cycleFound = false;
    function detectCycle(taskId: string): void {
      if (cycleFound) return;
      visited.add(taskId);
      recursionStack.add(taskId);
      const task = taskMap.get(taskId);
      if (task?.dependsOn)
        task.dependsOn.forEach((depId) => {
          if (!taskMap.has(depId)) return;
          if (!visited.has(depId)) {
            detectCycle(depId);
            if (cycleFound) return;
          } else if (recursionStack.has(depId)) {
            issues.push(`Circular dependency: ${taskId} -> ... -> ${depId}`);
            cycleFound = true;
            return;
          }
        });
      recursionStack.delete(taskId);
    }
    for (const task of reqEntry.tasks) {
      if (!visited.has(task.id) && !cycleFound) detectCycle(task.id);
    }
    const uniqueIssues = Array.from(new Set(issues));
    if (uniqueIssues.length > 0)
      return {
        status: "validation_failed",
        issues: uniqueIssues,
        message: `Found ${uniqueIssues.length} dependency issues.`,
      };
    return {
      status: "validation_passed",
      issues: [],
      message: "All dependencies are valid.",
    };
  }

  // --- Phase 2 Methods: SplitTask and MergeTasks ---

  public async splitTask(
    params: z.infer<typeof SplitTaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskIdToSplit, newSubtaskDefinitions } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const originalTask = this._getTaskOrThrow(reqEntry, taskIdToSplit);

    if (
      originalTask.status === TaskStatus.Done ||
      originalTask.status === TaskStatus.Failed
    ) {
      throw new InvalidOperationError(
        `Cannot split task '${taskIdToSplit}' as it is in a terminal status ('${originalTask.status}').`,
      );
    }
    if (originalTask.status === TaskStatus.Split) {
      throw new InvalidOperationError(
        `Task '${taskIdToSplit}' has already been split. Add subtasks directly or split one of its existing subtasks.`,
      );
    }

    const now = new Date().toISOString();
    originalTask.status = TaskStatus.Split;
    originalTask.title = `[SPLIT] ${originalTask.title}`;
    originalTask.description = `(Original task split, work delegated to subtasks) ${originalTask.description}`;
    originalTask.updatedAt = now;

    if (!originalTask.subtaskIds) originalTask.subtaskIds = [];
    const createdSubtasks: Partial<Task>[] = [];

    for (const subDef of newSubtaskDefinitions) {
      const newSubtaskId = this._generateTaskId();
      const newSubtask: Task = {
        id: newSubtaskId,
        title: subDef.title,
        description: subDef.description,
        status: TaskStatus.Pending,
        priority: subDef.priority || originalTask.priority,
        type: subDef.type || originalTask.type || TaskType.Generic,
        dependsOn: subDef.dependsOn || [],
        parentId: originalTask.id,
        artifactsGenerated: subDef.artifactsGenerated || [],
        environmentContext:
          subDef.environmentContext || originalTask.environmentContext,
        createdAt: now,
        updatedAt: now,
        subtaskIds: [],
        completedDetails: "",
      };
      reqEntry.tasks.push(newSubtask);
      originalTask.subtaskIds.push(newSubtaskId);
      createdSubtasks.push({
        id: newSubtask.id,
        title: newSubtask.title,
        type: newSubtask.type,
      });
    }

    reqEntry.updatedAt = now;
    if (reqEntry.completed) reqEntry.completed = false;

    await this._saveActiveTasksToFile();
    return {
      status: "task_split",
      originalTaskId: originalTask.id,
      newSubtasks: createdSubtasks,
      message: `Task '${originalTask.title}' (ID: ${originalTask.id}) split into ${createdSubtasks.length} new subtasks.\n${this._formatTaskProgressTable(requestId)}`,
    };
  }

  public async mergeTasks(
    params: z.infer<typeof MergeTasksSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const {
      requestId,
      primaryTaskId,
      taskIdsToMerge,
      newTitle,
      newDescription,
      newPriority,
      newType,
      newEnvironmentContext,
      newArtifactsGenerated,
    } = params;

    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const primaryTask = this._getTaskOrThrow(reqEntry, primaryTaskId);

    if (taskIdsToMerge.includes(primaryTaskId)) {
      throw new InvalidOperationError(
        "Primary task ID cannot be in the list of tasks to merge.",
      );
    }
    if (
      primaryTask.status === TaskStatus.Done ||
      primaryTask.status === TaskStatus.Failed ||
      primaryTask.status === TaskStatus.Split
    ) {
      throw new InvalidOperationError(
        `Primary task '${primaryTaskId}' is in a non-mergeable status ('${primaryTask.status}').`,
      );
    }

    const now = new Date().toISOString();
    const uniqueSubtaskIds = new Set<string>(primaryTask.subtaskIds || []);
    const uniqueDependsOn = new Set<string>(primaryTask.dependsOn || []);
    let combinedArtifacts = new Set<string>(
      primaryTask.artifactsGenerated || [],
    );
    let combinedDescription = primaryTask.description;

    for (const idToMerge of taskIdsToMerge) {
      const taskToMerge = this._getTaskOrThrow(reqEntry, idToMerge);
      if (
        taskToMerge.status === TaskStatus.Done ||
        taskToMerge.status === TaskStatus.Failed ||
        taskToMerge.status === TaskStatus.Split
      ) {
        throw new InvalidOperationError(
          `Task '${idToMerge}' cannot be merged as it's in a non-mergeable status ('${taskToMerge.status}').`,
        );
      }

      if (taskToMerge.description) {
        combinedDescription += `\n\n--- Merged from ${taskToMerge.id} (${taskToMerge.title}) ---\n${taskToMerge.description}`;
      }

      if (taskToMerge.subtaskIds) {
        for (const subId of taskToMerge.subtaskIds) {
          const subtask = reqEntry.tasks.find((t) => t.id === subId);
          if (subtask) {
            subtask.parentId = primaryTask.id;
            subtask.updatedAt = now;
            uniqueSubtaskIds.add(subId);
          }
        }
      }
      if (taskToMerge.dependsOn) {
        taskToMerge.dependsOn.forEach((depId) => {
          if (depId !== primaryTask.id) uniqueDependsOn.add(depId);
        });
      }
      if (taskToMerge.artifactsGenerated) {
        taskToMerge.artifactsGenerated.forEach((art) =>
          combinedArtifacts.add(art),
        );
      }
    }

    primaryTask.title = newTitle || primaryTask.title;
    primaryTask.description = newDescription || combinedDescription;
    primaryTask.priority = newPriority || primaryTask.priority;
    primaryTask.type = newType || primaryTask.type;
    primaryTask.environmentContext =
      newEnvironmentContext || primaryTask.environmentContext;
    primaryTask.artifactsGenerated =
      newArtifactsGenerated || Array.from(combinedArtifacts);
    primaryTask.subtaskIds = Array.from(uniqueSubtaskIds);
    primaryTask.dependsOn = Array.from(uniqueDependsOn);
    primaryTask.updatedAt = now;

    for (const task of reqEntry.tasks) {
      if (task.id === primaryTask.id || taskIdsToMerge.includes(task.id))
        continue;
      if (task.dependsOn) {
        let depsChanged = false;
        const newDeps = new Set<string>(task.dependsOn);
        task.dependsOn.forEach((depId) => {
          if (taskIdsToMerge.includes(depId)) {
            newDeps.delete(depId);
            if (depId !== primaryTask.id) newDeps.add(primaryTask.id);
            depsChanged = true;
          }
        });
        if (depsChanged) {
          task.dependsOn = Array.from(newDeps);
          if (task.dependsOn.length === 0) delete task.dependsOn;
          task.updatedAt = now;
        }
      }
    }

    reqEntry.tasks = reqEntry.tasks.filter(
      (t) => !taskIdsToMerge.includes(t.id),
    );
    reqEntry.updatedAt = now;

    await this._saveActiveTasksToFile();
    return {
      status: "tasks_merged",
      primaryTaskId: primaryTask.id,
      mergedTaskIds: taskIdsToMerge,
      message: `Tasks ${taskIdsToMerge.join(", ")} merged into '${primaryTask.title}' (ID: ${primaryTask.id}).\n${this._formatTaskProgressTable(requestId)}`,
    };
  }

  private async _handleParentCompletion(
    reqEntry: RequestEntry,
    changedTask: Task,
    now: string,
  ): Promise<{ messageAugmentation: string; treeCompletionStatus?: object }> {
    let messageAugmentation = "";
    let treeCompletionStatus: object | undefined = undefined;
    const taskMap = new Map(reqEntry.tasks.map((t) => [t.id, t]));

    const checkAndCompleteParent = async (currentTask: Task) => {
      if (!currentTask.parentId) return;

      const parentTask = taskMap.get(currentTask.parentId);
      if (
        parentTask &&
        (parentTask.status === TaskStatus.Pending ||
          parentTask.status === TaskStatus.Active ||
          parentTask.status === TaskStatus.Split)
      ) {
        const allSubtasksTerminalOrSplit = parentTask.subtaskIds?.every(
          (subId) => {
            const sub = taskMap.get(subId);
            return (
              sub &&
              (sub.status === TaskStatus.Done ||
                sub.status === TaskStatus.Failed ||
                sub.status === TaskStatus.Split)
            );
          },
        );

        if (allSubtasksTerminalOrSplit) {
          parentTask.status = TaskStatus.Done;
          parentTask.completedDetails =
            parentTask.completedDetails ||
            "Automatically completed as all subtasks are terminal or split.";
          parentTask.updatedAt = now;
          messageAugmentation += ` Parent task '${parentTask.id}' auto-completed.`;

          await checkAndCompleteParent(parentTask);

          if (
            this._areAllDescendantsStatus(parentTask, taskMap, TaskStatus.Done)
          ) {
            treeCompletionStatus = {
              isTreeFullyDone: true,
              rootTaskId: parentTask.id,
              message: `Task tree rooted at '${parentTask.id}' is now fully 'done'. Consider 'archive_task_tree'.`,
              suggestedAction: {
                toolName: "archive_task_tree",
                params: {
                  requestId: reqEntry.requestId,
                  taskId: parentTask.id,
                },
              },
            };
          }
        }
      }
    };

    await checkAndCompleteParent(changedTask);

    if (
      !changedTask.parentId &&
      !treeCompletionStatus &&
      this._areAllDescendantsStatus(changedTask, taskMap, TaskStatus.Done)
    ) {
      treeCompletionStatus = {
        isTreeFullyDone: true,
        rootTaskId: changedTask.id,
        message: `Task tree rooted at '${changedTask.id}' is now fully 'done'. Consider using 'archive_task_tree'.`,
        suggestedAction: {
          toolName: "archive_task_tree",
          params: { requestId: reqEntry.requestId, taskId: changedTask.id },
        },
      };
    }
    return { messageAugmentation, treeCompletionStatus };
  }

  // --- Formatting Helpers ---
  private _formatTaskProgressTable(requestId: string): string {
    const reqEntry = this.requestsMap.get(requestId); // No assert needed, internal helper
    if (!reqEntry) return "Request not found for progress table.";

    let table = "\nProgress Status:\n";
    table +=
      "| Task ID  | Prio | Type    | Status                | Parent | Deps | Subs | Title (Description Snippet) |\n";
    table +=
      "|----------|------|---------|-----------------------|--------|------|------|-----------------------------|\n";

    const taskMap = new Map(reqEntry.tasks.map((t) => [t.id, t]));
    const processedTaskIds = new Set<string>();

    const formatTaskRowRecursive = (taskId: string, level: number) => {
      if (processedTaskIds.has(taskId)) return;
      const task = taskMap.get(taskId);
      if (!task) return;
      processedTaskIds.add(taskId);

      const indent = "  ".repeat(level);
      const statusIcons: Record<TaskStatus, string> = {
        [TaskStatus.Pending]: "⏳",
        [TaskStatus.Active]: "🔄",
        [TaskStatus.Done]: "✅",
        [TaskStatus.Failed]: "❌",
        [TaskStatus.RequiresClarification]: "❓",
        [TaskStatus.Split]: "🔗",
      };
      const statusIcon = statusIcons[task.status] || "?";
      const prio = task.priority.substring(0, 1).toUpperCase();
      const type = (task.type || TaskType.Generic).padEnd(7);
      const statusDisplay = `${statusIcon} ${task.status}`.padEnd(21);
      const parent = task.parentId
        ? task.parentId.replace("task-", "p")
        : "----";
      const deps = task.dependsOn?.length || 0;
      const subs = task.subtaskIds?.length || 0;
      const titleDesc = `${indent}${task.title.substring(0, 25 - indent.length)} (${task.description.substring(0, 10)}...)`;

      table += `| ${task.id.padEnd(8)} | ${prio.padEnd(4)} | ${type} | ${statusDisplay} | ${parent.padEnd(6)} | ${String(deps).padEnd(4)} | ${String(subs).padEnd(4)} | ${titleDesc} |\n`;

      if (task.subtaskIds) {
        task.subtaskIds.forEach((subId) =>
          formatTaskRowRecursive(subId, level + 1),
        );
      }
    };

    const topLevelTasks = reqEntry.tasks
      .filter((t) => !t.parentId)
      .sort(
        (a, b) =>
          parseInt(a.id.replace("task-", ""), 10) -
          parseInt(b.id.replace("task-", ""), 10),
      );
    topLevelTasks.forEach((task) => formatTaskRowRecursive(task.id, 0));
    reqEntry.tasks.forEach((task) => {
      if (!processedTaskIds.has(task.id)) formatTaskRowRecursive(task.id, 0);
    });
    return table;
  }

  private _formatRequestsList(): string {
    let output = "\nActive Requests List:\n";
    output +=
      "| Request ID | Total | Done | Failed | Active | Pending | Clarify | Split | Status    |\n";
    output +=
      "|------------|-------|------|--------|--------|---------|---------|-------|-----------|\n";

    for (const req of this.requestsMap.values()) {
      const counts: Record<TaskStatus | "total", number> = {
        [TaskStatus.Done]: 0,
        [TaskStatus.Failed]: 0,
        [TaskStatus.Active]: 0,
        [TaskStatus.Pending]: 0,
        [TaskStatus.RequiresClarification]: 0,
        [TaskStatus.Split]: 0,
        total: 0,
      };
      req.tasks.forEach((t) => {
        counts[t.status] = (counts[t.status] || 0) + 1;
        counts.total++;
      });
      const status = req.completed
        ? "✅ Completed"
        : counts.total === 0
          ? "⏳ Empty"
          : "🔄 In Prog";
      output += `| ${req.requestId.padEnd(10)} | ${String(counts.total).padEnd(5)} | ${String(counts[TaskStatus.Done]).padEnd(4)} | ${String(counts[TaskStatus.Failed]).padEnd(6)} | ${String(counts[TaskStatus.Active]).padEnd(6)} | ${String(counts[TaskStatus.Pending]).padEnd(7)} | ${String(counts[TaskStatus.RequiresClarification]).padEnd(7)} | ${String(counts[TaskStatus.Split]).padEnd(5)} | ${status.padEnd(9)} |\n`;
    }
    return output;
  }
}

// --- Server Setup & Request Handling ---
const server = new Server(
  { name: "MCP-AgentTaskHub", version: "0.3.0" }, // Updated name and version
  { capabilities: { tools: {} } },
);

const taskManagerServer = new TaskManagerServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    REQUEST_PLANNING_TOOL,
    GET_NEXT_TASK_TOOL,
    MARK_TASK_DONE_TOOL,
    MARK_TASK_FAILED_TOOL,
    OPEN_TASK_DETAILS_TOOL,
    LIST_REQUESTS_TOOL,
    ADD_TASKS_TO_REQUEST_TOOL,
    UPDATE_TASK_TOOL,
    ADD_DEPENDENCY_TOOL,
    REMOVE_DEPENDENCY_TOOL,
    VALIDATE_DEPENDENCIES_TOOL,
    DELETE_TASK_TOOL,
    ADD_SUBTASK_TOOL,
    REMOVE_SUBTASK_TOOL,
    ARCHIVE_TASK_TREE_TOOL,
    LOG_TASK_COMPLETION_SUMMARY_TOOL,
    SPLIT_TASK_TOOL,
    MERGE_TASKS_TOOL,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    await taskManagerServer.init();
    const { name, arguments: args } = request.params;

    const toolHandlers: Record<string, (params: any) => Promise<object>> = {
      [REQUEST_PLANNING_TOOL.name]: (p) =>
        taskManagerServer.requestPlanning(RequestPlanningSchema.parse(p)),
      [GET_NEXT_TASK_TOOL.name]: (p) =>
        taskManagerServer.getNextTask(GetNextTaskSchema.parse(p)),
      [MARK_TASK_DONE_TOOL.name]: (p) =>
        taskManagerServer.markTaskDone(MarkTaskDoneSchema.parse(p)),
      [MARK_TASK_FAILED_TOOL.name]: (p) =>
        taskManagerServer.markTaskFailed(MarkTaskFailedSchema.parse(p)),
      [OPEN_TASK_DETAILS_TOOL.name]: (p) =>
        taskManagerServer.openTaskDetails(OpenTaskDetailsSchema.parse(p)),
      [LIST_REQUESTS_TOOL.name]: (p) =>
        taskManagerServer.listRequests(ListRequestsSchema.parse(p)),
      [ADD_TASKS_TO_REQUEST_TOOL.name]: (p) =>
        taskManagerServer.addTasksToRequest(AddTasksToRequestSchema.parse(p)),
      [UPDATE_TASK_TOOL.name]: (p) =>
        taskManagerServer.updateTask(UpdateTaskSchema.parse(p)),
      [ADD_DEPENDENCY_TOOL.name]: (p) =>
        taskManagerServer.addDependency(AddDependencySchema.parse(p)),
      [REMOVE_DEPENDENCY_TOOL.name]: (p) =>
        taskManagerServer.removeDependency(RemoveDependencySchema.parse(p)),
      [VALIDATE_DEPENDENCIES_TOOL.name]: (p) =>
        taskManagerServer.validateDependencies(
          ValidateDependenciesSchema.parse(p),
        ),
      [DELETE_TASK_TOOL.name]: (p) =>
        taskManagerServer.deleteTask(DeleteTaskSchema.parse(p)),
      [ADD_SUBTASK_TOOL.name]: (p) =>
        taskManagerServer.addSubtask(AddSubtaskSchema.parse(p)),
      [REMOVE_SUBTASK_TOOL.name]: (p) =>
        taskManagerServer.removeSubtask(RemoveSubtaskSchema.parse(p)),
      [ARCHIVE_TASK_TREE_TOOL.name]: (p) =>
        taskManagerServer.archiveTaskTree(ArchiveTaskTreeSchema.parse(p)),
      [LOG_TASK_COMPLETION_SUMMARY_TOOL.name]: (p) =>
        taskManagerServer.logTaskCompletionSummary(
          LogTaskCompletionSummarySchema.parse(p),
        ),
      [SPLIT_TASK_TOOL.name]: (p) =>
        taskManagerServer.splitTask(SplitTaskSchema.parse(p)),
      [MERGE_TASKS_TOOL.name]: (p) =>
        taskManagerServer.mergeTasks(MergeTasksSchema.parse(p)),
    };

    const handler = toolHandlers[name];
    if (!handler) throw new Error(`Unknown tool: ${name}`);

    const result = await handler(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error: any) {
    let errorMessage = "An unexpected error occurred.";
    let errorDetails;
    if (error instanceof z.ZodError) {
      errorMessage = "Invalid arguments.";
      errorDetails = error.format();
      console.warn(
        `Zod validation error for tool '${request.params.name}':`,
        JSON.stringify(errorDetails),
      );
    } else if (
      error instanceof NotFoundError ||
      error instanceof InvalidOperationError
    ) {
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    console.error(
      `Error processing tool '${request.params.name}':`,
      errorMessage,
      errorDetails || error.stack,
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: errorMessage, details: errorDetails }),
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  try {
    await taskManagerServer.init();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("MCP-AgentTaskHub Server (v1.0.0) running and connected."); // Updated name
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer();
