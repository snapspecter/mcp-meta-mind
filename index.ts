#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  // ToolSchema, // Not directly used, schema comes from zod-to-json-schema output
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { z } from "zod";
import { zodToJsonSchema as convertZodToJsonSchema } from "zod-to-json-schema";

// --- Configuration ---
const DEFAULT_TASKS_DIR = path.join(os.homedir(), "dev/countradar");
const TASK_FILE_NAME = "tasks.json";
const COMPLETED_TASKS_FILE_NAME = "completed-tasks.json";

const TASKS_DIR_PATH = process.env.TASK_MANAGER_DIR_PATH || DEFAULT_TASKS_DIR;
const TASK_FILE_PATH = path.join(TASKS_DIR_PATH, TASK_FILE_NAME);
const COMPLETED_TASKS_FILE_PATH = path.join(TASKS_DIR_PATH, COMPLETED_TASKS_FILE_NAME);

// --- Enums ---
enum TaskStatus {
  Pending = "pending",
  Active = "active",
  Done = "done",
  Failed = "failed",
}

enum TaskPriority {
  High = "high",
  Medium = "medium",
  Low = "low",
}

// --- Interfaces ---
interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dependsOn?: string[];
  parentId?: string;
  subtaskIds?: string[];
  failureReason?: string;
  completedDetails?: string;
  createdAt: string; // Added for tracking
  updatedAt: string; // Added for tracking
}

interface RequestEntry {
  requestId: string;
  originalRequest: string;
  splitDetails: string;
  tasks: Task[]; // Tasks will be managed here
  completed: boolean;
  createdAt: string; // Added for tracking
  updatedAt: string; // Added for tracking
}

interface TaskManagerFile {
  requests: RequestEntry[];
  metadata: {
    lastRequestId: number;
    lastTaskId: number;
  };
}

/**
 * Represents a bundle of an archived root task and its descendants.
 */
interface ArchivedTaskBundle {
  originalRequestId: string;
  originalRequestText: string; // For context when viewing archives
  archivedRootTask: Task;
  archivedSubtasks: Task[]; // All descendant tasks that were archived with the root
  archivedAt: string;
}

/**
 * Structure of the completed-tasks.json file.
 */
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
const TaskPriorityEnum = z.enum([TaskPriority.High, TaskPriority.Medium, TaskPriority.Low]);

const BaseTaskDefinitionSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  priority: TaskPriorityEnum.optional(),
  dependsOn: z.array(z.string()).optional(),
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
});

const MarkTaskFailedSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  reason: z.string().optional(),
});

const OpenTaskDetailsSchema = z.object({
  taskId: z.string(),
});

const ListRequestsSchema = z.object({}); // No params

const AddTasksToRequestSchema = z.object({
  requestId: z.string(),
  tasks: z.array(BaseTaskDefinitionSchema).min(1),
});

const UpdateTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: TaskPriorityEnum.optional(),
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
  dependsOn: z.array(z.string()).optional(),
});

const RemoveSubtaskSchema = z.object({
  requestId: z.string(),
  subtaskId: z.string(),
  parentTaskId: z.string().optional(), // Optional: if provided, ensures it's a direct subtask of this parent
});


// --- Tool Definitions ---
const REQUEST_PLANNING_TOOL: Tool = {
  name: "request_planning",
  description: "Register a new user request and plan its tasks.",
  inputSchema: convertZodToJsonSchema(RequestPlanningSchema, "RequestPlanningInput") as any,
};
const GET_NEXT_TASK_TOOL: Tool = {
  name: "get_next_task",
  description: "Get the next actionable task for a request.",
  inputSchema: convertZodToJsonSchema(GetNextTaskSchema, "GetNextTaskInput") as any,
};
const MARK_TASK_DONE_TOOL: Tool = {
  name: "mark_task_done",
  description: "Mark a task as done.",
  inputSchema: convertZodToJsonSchema(MarkTaskDoneSchema, "MarkTaskDoneInput") as any,
};
const MARK_TASK_FAILED_TOOL: Tool = {
  name: "mark_task_failed",
  description: "Mark a task as failed.",
  inputSchema: convertZodToJsonSchema(MarkTaskFailedSchema, "MarkTaskFailedInput") as any,
};
const OPEN_TASK_DETAILS_TOOL: Tool = {
  name: "open_task_details",
  description: "Get details of a specific task.",
  inputSchema: convertZodToJsonSchema(OpenTaskDetailsSchema, "OpenTaskDetailsInput") as any,
};
const LIST_REQUESTS_TOOL: Tool = {
  name: "list_requests",
  description: "List all active requests.",
  inputSchema: convertZodToJsonSchema(ListRequestsSchema, "ListRequestsInput") as any,
};
const ADD_TASKS_TO_REQUEST_TOOL: Tool = {
  name: "add_tasks_to_request",
  description: "Add new tasks to an existing request.",
  inputSchema: convertZodToJsonSchema(AddTasksToRequestSchema, "AddTasksToRequestInput") as any,
};
const UPDATE_TASK_TOOL: Tool = {
  name: "update_task",
  description: "Update an existing task's details.",
  inputSchema: convertZodToJsonSchema(UpdateTaskSchema, "UpdateTaskInput") as any,
};
const ADD_DEPENDENCY_TOOL: Tool = {
  name: "add_dependency",
  description: "Add a dependency between two tasks.",
  inputSchema: convertZodToJsonSchema(AddDependencySchema, "AddDependencyInput") as any,
};
const REMOVE_DEPENDENCY_TOOL: Tool = {
  name: "remove_dependency",
  description: "Remove a dependency between two tasks.",
  inputSchema: convertZodToJsonSchema(RemoveDependencySchema, "RemoveDependencyInput") as any,
};
const VALIDATE_DEPENDENCIES_TOOL: Tool = {
  name: "validate_dependencies",
  description: "Validate task dependencies within a request for issues like cycles.",
  inputSchema: convertZodToJsonSchema(ValidateDependenciesSchema, "ValidateDependenciesInput") as any,
};
const DELETE_TASK_TOOL: Tool = {
  name: "delete_task",
  description: "Delete a task. Completed tasks meeting criteria will be archived.",
  inputSchema: convertZodToJsonSchema(DeleteTaskSchema, "DeleteTaskInput") as any,
};
const ADD_SUBTASK_TOOL: Tool = {
  name: "add_subtask",
  description: "Add a subtask to a parent task.",
  inputSchema: convertZodToJsonSchema(AddSubtaskSchema, "AddSubtaskInput") as any,
};
const REMOVE_SUBTASK_TOOL: Tool = {
  name: "remove_subtask",
  description: "Remove a subtask and its descendants. Completed subtasks meeting criteria will be archived.",
  inputSchema: convertZodToJsonSchema(RemoveSubtaskSchema, "RemoveSubtaskInput") as any,
};

// --- TaskManagerServer Class ---
class TaskManagerServer {
  private requestCounter = 0;
  private taskCounter = 0;
  private requestsMap: Map<string, RequestEntry> = new Map();
  private completedTasksData: CompletedTasksFile = { archivedTaskBundles: [], metadata: {} };
  private isInitialized = false;

  constructor() {
    // Initialization is now handled by an async init() method
  }

  /**
   * Initializes the TaskManagerServer by loading data from files.
   * Must be called and awaited before the server starts accepting requests.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;

    await fs.mkdir(TASKS_DIR_PATH, { recursive: true }); // Ensure directory exists
    await this._loadTasksFromFile();
    await this._loadCompletedTasksFromFile();
    this.isInitialized = true;
    console.log("Task Manager Server initialized.");
    console.log(`Active tasks file: ${TASK_FILE_PATH}`);
    console.log(`Completed tasks archive: ${COMPLETED_TASKS_FILE_PATH}`);
  }

  private _assertInitialized(): void {
    if (!this.isInitialized) {
      throw new Error("TaskManagerServer is not initialized. Call init() first.");
    }
  }

  private async _loadTasksFromFile(): Promise<void> {
    try {
      const fileContent = await fs.readFile(TASK_FILE_PATH, "utf-8");
      const parsedData = JSON.parse(fileContent) as TaskManagerFile;

      this.requestsMap.clear();
      parsedData.requests.forEach(req => this.requestsMap.set(req.requestId, req));

      if (parsedData.metadata) {
        this.requestCounter = parsedData.metadata.lastRequestId || 0;
        this.taskCounter = parsedData.metadata.lastTaskId || 0;
      } else {
        this._recalculateCountersFromData(); // Fallback if metadata is missing
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log("Tasks file not found. Initializing with empty data.");
        this.requestsMap.clear();
        this.requestCounter = 0;
        this.taskCounter = 0;
        // Save initial empty state
        await this._saveTasksToFile();
      } else {
        console.error("Error loading tasks file:", error);
        throw error; // Re-throw if it's not a simple file not found
      }
    }
  }

  private _recalculateCountersFromData(): void {
    let maxReqId = 0;
    let maxTaskId = 0;
    for (const req of this.requestsMap.values()) {
      const reqNum = parseInt(req.requestId.replace("req-", ""), 10);
      if (!isNaN(reqNum) && reqNum > maxReqId) maxReqId = reqNum;
      for (const task of req.tasks) {
        const taskNum = parseInt(task.id.replace("task-", ""), 10);
        if (!isNaN(taskNum) && taskNum > maxTaskId) maxTaskId = taskNum;
      }
    }
    this.requestCounter = maxReqId;
    this.taskCounter = maxTaskId;
  }

  private async _saveTasksToFile(): Promise<void> {
    this._assertInitialized();
    const dataToSave: TaskManagerFile = {
      requests: Array.from(this.requestsMap.values()),
      metadata: {
        lastRequestId: this.requestCounter,
        lastTaskId: this.taskCounter,
      },
    };
    try {
      await fs.writeFile(TASK_FILE_PATH, JSON.stringify(dataToSave, null, 2), "utf-8");
    } catch (error) {
      console.error("Failed to save tasks file:", error);
      throw error; // Propagate error for handling upstream if necessary
    }
  }

  private async _loadCompletedTasksFromFile(): Promise<void> {
    try {
      const fileContent = await fs.readFile(COMPLETED_TASKS_FILE_PATH, "utf-8");
      this.completedTasksData = JSON.parse(fileContent) as CompletedTasksFile;
      if (!this.completedTasksData.archivedTaskBundles) {
        this.completedTasksData.archivedTaskBundles = [];
      }
      if (!this.completedTasksData.metadata) {
        this.completedTasksData.metadata = {};
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log("Completed tasks file not found. Initializing empty archive.");
        this.completedTasksData = { archivedTaskBundles: [], metadata: {} };
        await this._saveCompletedTasksToFile(); // Save initial empty state
      } else {
        console.error("Error loading completed tasks file:", error);
        // Decide if to throw or continue with empty completed tasks
        this.completedTasksData = { archivedTaskBundles: [], metadata: {} };
      }
    }
  }

  private async _saveCompletedTasksToFile(): Promise<void> {
    this._assertInitialized();
    this.completedTasksData.metadata.lastArchiveDate = new Date().toISOString();
    try {
      await fs.writeFile(COMPLETED_TASKS_FILE_PATH, JSON.stringify(this.completedTasksData, null, 2), "utf-8");
    } catch (error) {
      console.error("Failed to save completed tasks file:", error);
      throw error;
    }
  }

  private _getRequestEntryOrThrow(requestId: string): RequestEntry {
    const reqEntry = this.requestsMap.get(requestId);
    if (!reqEntry) {
      throw new NotFoundError(`Request with ID '${requestId}' not found.`);
    }
    return reqEntry;
  }

  private _getTaskOrThrow(reqEntry: RequestEntry, taskId: string): Task {
    const task = reqEntry.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new NotFoundError(`Task with ID '${taskId}' not found in request '${reqEntry.requestId}'.`);
    }
    return task;
  }
  
  private _getTaskFromAnyRequestOrThrow(taskId: string): { task: Task, requestEntry: RequestEntry } {
    for (const requestEntry of this.requestsMap.values()) {
        const task = requestEntry.tasks.find(t => t.id === taskId);
        if (task) {
            return { task, requestEntry };
        }
    }
    throw new NotFoundError(`Task with ID '${taskId}' not found in any active request.`);
  }


  private _generateTaskId(): string {
    this.taskCounter += 1;
    return `task-${this.taskCounter}`;
  }

  private _generateRequestId(): string {
    this.requestCounter += 1;
    return `req-${this.requestCounter}`;
  }

  /**
   * Checks if a task and all its descendants (subtasks recursively) are in 'done' status.
   */
  private _areAllDescendantsDone(task: Task, allTasksInRequestMap: Map<string, Task>): boolean {
    if (task.status !== TaskStatus.Done) return false;
    if (!task.subtaskIds || task.subtaskIds.length === 0) return true; // No subtasks, and it's done

    for (const subtaskId of task.subtaskIds) {
      const subtask = allTasksInRequestMap.get(subtaskId);
      if (!subtask || !this._areAllDescendantsDone(subtask, allTasksInRequestMap)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Collects a task and all its descendant tasks.
   */
  private _collectTaskWithDescendants(rootTask: Task, allTasksInRequestMap: Map<string, Task>): Task[] {
    const collectedTasks: Task[] = [rootTask];
    const queue: string[] = [...(rootTask.subtaskIds || [])];
    const visited = new Set<string>([rootTask.id]);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const task = allTasksInRequestMap.get(currentId);
      if (task) {
        collectedTasks.push(task);
        if (task.subtaskIds) {
          queue.push(...task.subtaskIds);
        }
      }
    }
    return collectedTasks;
  }

  /**
   * Removes a task and its descendants from a RequestEntry's task list.
   * Also cleans up dependencies and parent links.
   * @returns true if any task was removed, false otherwise.
   */
  private _removeTaskAndDescendantsFromRequest(reqEntry: RequestEntry, taskIdToRemove: string): boolean {
    const taskMap = new Map(reqEntry.tasks.map(t => [t.id, t]));
    if (!taskMap.has(taskIdToRemove)) return false;

    const tasksToDeleteIds = new Set<string>();
    const queue = [taskIdToRemove];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (tasksToDeleteIds.has(currentId)) continue;
      tasksToDeleteIds.add(currentId);
      const task = taskMap.get(currentId);
      if (task?.subtaskIds) {
        for (const subId of task.subtaskIds) {
          if (taskMap.has(subId)) queue.push(subId);
        }
      }
    }

    const taskToRemove = taskMap.get(taskIdToRemove);
    if (taskToRemove?.parentId) {
      const parent = taskMap.get(taskToRemove.parentId);
      if (parent?.subtaskIds) {
        parent.subtaskIds = parent.subtaskIds.filter(id => id !== taskIdToRemove);
        if (parent.subtaskIds.length === 0) delete parent.subtaskIds;
      }
    }
    
    const initialTaskCount = reqEntry.tasks.length;
    reqEntry.tasks = reqEntry.tasks.filter(t => !tasksToDeleteIds.has(t.id));
    
    reqEntry.tasks.forEach(task => {
      if (task.dependsOn) {
        task.dependsOn = task.dependsOn.filter(depId => !tasksToDeleteIds.has(depId));
        if (task.dependsOn.length === 0) delete task.dependsOn;
      }
      if (task.parentId && tasksToDeleteIds.has(task.parentId)) {
          delete task.parentId; // Orphan if its direct parent was deleted
      }
    });
    reqEntry.updatedAt = new Date().toISOString();
    return reqEntry.tasks.length < initialTaskCount;
  }

  // --- Public Tool Methods ---

  public async requestPlanning(
    params: z.infer<typeof RequestPlanningSchema>
  ): Promise<object> {
    this._assertInitialized();
    const { originalRequest, tasks: taskDefs, splitDetails } = params;
    const now = new Date().toISOString();

    const requestId = this._generateRequestId();
    const newTasks: Task[] = taskDefs.map(taskDef => ({
      id: this._generateTaskId(),
      title: taskDef.title,
      description: taskDef.description,
      status: TaskStatus.Pending,
      priority: taskDef.priority || TaskPriority.Medium,
      dependsOn: taskDef.dependsOn || [],
      completedDetails: "",
      createdAt: now,
      updatedAt: now,
      subtaskIds: [], // Initialize subtaskIds as empty array
    }));

    const newRequestEntry: RequestEntry = {
      requestId,
      originalRequest,
      splitDetails: splitDetails || originalRequest,
      tasks: newTasks,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    this.requestsMap.set(requestId, newRequestEntry);

    await this._saveTasksToFile();
    const progressTable = this._formatTaskProgressTable(requestId);

    return {
      status: "planned",
      requestId,
      totalTasks: newTasks.length,
      tasks: newTasks.map(t => ({ id: t.id, title: t.title, priority: t.priority })),
      message: `Request '${requestId}' planned with ${newTasks.length} tasks.\n${progressTable}`,
    };
  }

  public async getNextTask(params: z.infer<typeof GetNextTaskSchema>): Promise<object> {
    this._assertInitialized();
    const { requestId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);

    if (reqEntry.completed) {
      return { status: "already_completed", message: "Request already completed." };
    }

    const taskMap = new Map(reqEntry.tasks.map(t => [t.id, t]));
    const areDependenciesMet = (task: Task): boolean =>
      task.dependsOn?.every(depId => taskMap.get(depId)?.status === TaskStatus.Done) ?? true;

    let potentialNextTasks: Task[] = [];

    // Prioritize subtasks of active parent tasks
    const activeParentTasks = reqEntry.tasks.filter(t => t.status === TaskStatus.Active && t.subtaskIds && t.subtaskIds.length > 0);
    for (const parent of activeParentTasks) {
      for (const subtaskId of parent.subtaskIds!) {
        const subtask = taskMap.get(subtaskId);
        if (subtask && subtask.status === TaskStatus.Pending && areDependenciesMet(subtask)) {
          potentialNextTasks.push(subtask);
        }
      }
    }
    
    // If no subtasks of active parents, look for other pending/active tasks
    if (potentialNextTasks.length === 0) {
      potentialNextTasks = reqEntry.tasks.filter(task => {
        const parent = task.parentId ? taskMap.get(task.parentId) : null;
        // Don't pick a subtask if its parent is active (unless it was picked in the block above)
        if (parent && parent.status === TaskStatus.Active && !activeParentTasks.find(p => p.id === parent.id)?.subtaskIds?.includes(task.id)) return false;
        // Don't pick a subtask if its parent is pending (parent should become active first)
        if (parent && parent.status === TaskStatus.Pending) return false;

        return (task.status === TaskStatus.Pending || task.status === TaskStatus.Active) && areDependenciesMet(task);
      });
    }

    if (potentialNextTasks.length === 0) {
      const allTerminal = reqEntry.tasks.every(t => t.status === TaskStatus.Done || t.status === TaskStatus.Failed);
      const progressTable = this._formatTaskProgressTable(requestId);
      if (allTerminal && !reqEntry.completed) {
        reqEntry.completed = true;
        reqEntry.updatedAt = new Date().toISOString();
        await this._saveTasksToFile();
        return {
          status: "all_tasks_terminal_request_completed",
          message: `All tasks are terminal. Request '${requestId}' completed.\n${progressTable}`,
        };
      }
      return {
        status: "no_actionable_task",
        message: `No actionable tasks found for request '${requestId}'. Check dependencies or parent task statuses.\n${progressTable}`,
      };
    }

    potentialNextTasks.sort((a, b) => {
      const priorityOrder = { [TaskPriority.High]: 0, [TaskPriority.Medium]: 1, [TaskPriority.Low]: 2 };
      // Favor subtasks of active parents
      const aIsSubtaskOfActive = a.parentId && taskMap.get(a.parentId)?.status === TaskStatus.Active;
      const bIsSubtaskOfActive = b.parentId && taskMap.get(b.parentId)?.status === TaskStatus.Active;
      if (aIsSubtaskOfActive && !bIsSubtaskOfActive) return -1;
      if (!aIsSubtaskOfActive && bIsSubtaskOfActive) return 1;

      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return parseInt(a.id.replace("task-", ""), 10) - parseInt(b.id.replace("task-", ""), 10);
    });

    const nextTask = potentialNextTasks[0];
    const now = new Date().toISOString();
    if (nextTask.status === TaskStatus.Pending) {
      if (nextTask.parentId) {
        const parent = taskMap.get(nextTask.parentId);
        if (parent && parent.status === TaskStatus.Pending) {
           parent.status = TaskStatus.Active; // Activate parent if starting one of its subtasks
           parent.updatedAt = now;
        }
      }
      nextTask.status = TaskStatus.Active;
      nextTask.updatedAt = now;
      reqEntry.updatedAt = now;
      await this._saveTasksToFile();
    }
    
    const progressTable = this._formatTaskProgressTable(requestId);
    return {
      status: "next_task",
      task: { id: nextTask.id, title: nextTask.title, priority: nextTask.priority, parentId: nextTask.parentId },
      message: `Next task for '${requestId}': '${nextTask.title}' (ID: ${nextTask.id}).\n${progressTable}`,
    };
  }

  public async markTaskDone(params: z.infer<typeof MarkTaskDoneSchema>): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, completedDetails } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);

    if (task.status === TaskStatus.Done) return { status: "already_done", message: "Task already marked done." };
    if (task.status === TaskStatus.Failed) throw new InvalidOperationError("Task is marked failed. Cannot mark as done.");

    const now = new Date().toISOString();
    task.status = TaskStatus.Done;
    task.completedDetails = completedDetails || "Completed successfully.";
    task.failureReason = undefined;
    task.updatedAt = now;
    reqEntry.updatedAt = now;

    let message = `Task '${taskId}' marked done.`;

    // Check if parent task can be marked done
    if (task.parentId) {
      const parentTask = reqEntry.tasks.find(p => p.id === task.parentId);
      if (parentTask && (parentTask.status === TaskStatus.Pending || parentTask.status === TaskStatus.Active)) {
        const allSubtasksTerminal = parentTask.subtaskIds?.every(subId => {
          const sub = reqEntry.tasks.find(s => s.id === subId);
          return sub && (sub.status === TaskStatus.Done || sub.status === TaskStatus.Failed);
        });
        if (allSubtasksTerminal) {
          parentTask.status = TaskStatus.Done;
          parentTask.completedDetails = "Automatically completed as all subtasks are terminal.";
          parentTask.updatedAt = now;
          message += ` Parent task '${parentTask.id}' automatically marked done.`;
        }
      }
    }

    // Check if entire request is completed
    const allTasksInRequestTerminal = reqEntry.tasks.every(t => t.status === TaskStatus.Done || t.status === TaskStatus.Failed);
    if (allTasksInRequestTerminal && !reqEntry.completed) {
      reqEntry.completed = true;
      message += ` All tasks in request '${reqEntry.requestId}' are terminal. Request completed.`;
    }
    
    await this._saveTasksToFile();
    const progressTable = this._formatTaskProgressTable(requestId);
    return {
      status: "task_marked_done",
      message: `${message}\n${progressTable}`,
      task: { id: task.id, title: task.title, status: task.status },
      requestCompleted: reqEntry.completed,
    };
  }

  public async markTaskFailed(params: z.infer<typeof MarkTaskFailedSchema>): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, reason } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);

    if (task.status === TaskStatus.Failed) return { status: "already_failed", message: "Task already marked failed." };
    if (task.status === TaskStatus.Done) throw new InvalidOperationError("Task is marked done. Cannot mark as failed.");
    
    const now = new Date().toISOString();
    task.status = TaskStatus.Failed;
    task.failureReason = reason || "No reason provided.";
    task.completedDetails = "";
    task.updatedAt = now;
    reqEntry.updatedAt = now;

    let message = `Task '${taskId}' marked failed. Reason: ${task.failureReason}.`;

    // Check if parent task should be marked done (even if some subtasks failed, if all are terminal)
     if (task.parentId) {
      const parentTask = reqEntry.tasks.find(p => p.id === task.parentId);
      if (parentTask && (parentTask.status === TaskStatus.Pending || parentTask.status === TaskStatus.Active)) {
        const allSubtasksTerminal = parentTask.subtaskIds?.every(subId => {
          const sub = reqEntry.tasks.find(s => s.id === subId);
          return sub && (sub.status === TaskStatus.Done || sub.status === TaskStatus.Failed);
        });
        if (allSubtasksTerminal) {
          // Parent becomes 'done' if all subtasks are terminal, even if some failed.
          // If a parent *must* fail if any subtask fails, this logic would change.
          parentTask.status = TaskStatus.Done; 
          parentTask.completedDetails = "Automatically completed as all subtasks are terminal (some may have failed).";
          parentTask.updatedAt = now;
          message += ` Parent task '${parentTask.id}' automatically marked done as all its subtasks are now terminal.`;
        }
      }
    }
    
    const allTasksInRequestTerminal = reqEntry.tasks.every(t => t.status === TaskStatus.Done || t.status === TaskStatus.Failed);
    if (allTasksInRequestTerminal && !reqEntry.completed) {
      reqEntry.completed = true;
      message += ` All tasks in request '${reqEntry.requestId}' are now in a terminal state. Request completed.`;
    }

    await this._saveTasksToFile();
    const progressTable = this._formatTaskProgressTable(requestId);
    return {
      status: "task_marked_failed",
      message: `${message}\n${progressTable}`,
      task: { id: task.id, title: task.title, status: task.status, failureReason: task.failureReason },
      requestCompleted: reqEntry.completed,
    };
  }

  public async openTaskDetails(params: z.infer<typeof OpenTaskDetailsSchema>): Promise<object> {
    this._assertInitialized();
    const { taskId } = params;
    const { task, requestEntry } = this._getTaskFromAnyRequestOrThrow(taskId);
    return {
      status: "task_details",
      requestId: requestEntry.requestId,
      task, // Return the full task object
    };
  }

  public async listRequests(_params: z.infer<typeof ListRequestsSchema>): Promise<object> {
    this._assertInitialized();
    const requestsListSummary = this._formatRequestsList();
    return {
      status: "requests_listed",
      message: `Current active requests:\n${requestsListSummary}`,
      requests: Array.from(this.requestsMap.values()).map(req => ({
        requestId: req.requestId,
        originalRequest: req.originalRequest,
        totalTasks: req.tasks.length,
        terminalTasks: req.tasks.filter(t => t.status === TaskStatus.Done || t.status === TaskStatus.Failed).length,
        requestCompleted: req.completed,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
      })),
    };
  }

  public async addTasksToRequest(params: z.infer<typeof AddTasksToRequestSchema>): Promise<object> {
    this._assertInitialized();
    const { requestId, tasks: taskDefs } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    if (reqEntry.completed) throw new InvalidOperationError("Cannot add tasks to a completed request.");

    const now = new Date().toISOString();
    const newTasks: Task[] = taskDefs.map(taskDef => ({
      id: this._generateTaskId(),
      title: taskDef.title,
      description: taskDef.description,
      status: TaskStatus.Pending,
      priority: taskDef.priority || TaskPriority.Medium,
      dependsOn: taskDef.dependsOn || [],
      completedDetails: "",
      createdAt: now,
      updatedAt: now,
      subtaskIds: [],
    }));

    reqEntry.tasks.push(...newTasks);
    reqEntry.updatedAt = now;
    if (reqEntry.completed && newTasks.length > 0) { // Re-open request if it was completed and new tasks are added
        reqEntry.completed = false;
    }


    await this._saveTasksToFile();
    const progressTable = this._formatTaskProgressTable(requestId);
    return {
      status: "tasks_added",
      message: `Added ${newTasks.length} new tasks to request '${requestId}'.\n${progressTable}`,
      newTasks: newTasks.map(t => ({ id: t.id, title: t.title })),
    };
  }

  public async updateTask(params: z.infer<typeof UpdateTaskSchema>): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, ...updates } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);

    if (task.status === TaskStatus.Done || task.status === TaskStatus.Failed) {
      throw new InvalidOperationError(`Cannot update task in terminal status ('${task.status}').`);
    }

    let updated = false;
    if (updates.title && task.title !== updates.title) { task.title = updates.title; updated = true; }
    if (updates.description && task.description !== updates.description) { task.description = updates.description; updated = true; }
    if (updates.priority && task.priority !== updates.priority) { task.priority = updates.priority; updated = true; }

    if (!updated) return { status: "no_change", message: "No changes applied to task." };
    
    const now = new Date().toISOString();
    task.updatedAt = now;
    reqEntry.updatedAt = now;

    await this._saveTasksToFile();
    const progressTable = this._formatTaskProgressTable(requestId);
    return {
      status: "task_updated",
      message: `Task '${taskId}' updated.\n${progressTable}`,
      task: { id: task.id, title: task.title, description: task.description, priority: task.priority },
    };
  }
  
  public async addDependency(params: z.infer<typeof AddDependencySchema>): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, dependsOnTaskId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);
    const dependsOnTask = this._getTaskOrThrow(reqEntry, dependsOnTaskId); // Ensure dependency exists

    if (taskId === dependsOnTaskId) throw new InvalidOperationError("Task cannot depend on itself.");

    // Circular dependency check (simple immediate check, full check in validateDependencies)
    if (dependsOnTask.dependsOn?.includes(taskId)) {
        throw new InvalidOperationError(`Circular dependency detected: ${dependsOnTaskId} already depends on ${taskId}.`);
    }

    if (!task.dependsOn) task.dependsOn = [];
    if (task.dependsOn.includes(dependsOnTaskId)) {
      return { status: "no_change", message: `Task '${taskId}' already depends on '${dependsOnTaskId}'.` };
    }

    task.dependsOn.push(dependsOnTaskId);
    task.updatedAt = new Date().toISOString();
    reqEntry.updatedAt = new Date().toISOString();
    await this._saveTasksToFile();
    return { status: "dependency_added", message: `Task '${taskId}' now depends on '${dependsOnTaskId}'.` };
  }

  public async removeDependency(params: z.infer<typeof RemoveDependencySchema>): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, dependsOnTaskId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(reqEntry, taskId);

    if (!task.dependsOn || !task.dependsOn.includes(dependsOnTaskId)) {
      return { status: "no_change", message: `Task '${taskId}' does not depend on '${dependsOnTaskId}'.` };
    }

    task.dependsOn = task.dependsOn.filter(id => id !== dependsOnTaskId);
    if (task.dependsOn.length === 0) delete task.dependsOn;
    
    task.updatedAt = new Date().toISOString();
    reqEntry.updatedAt = new Date().toISOString();
    await this._saveTasksToFile();
    return { status: "dependency_removed", message: `Dependency of task '${taskId}' on '${dependsOnTaskId}' removed.` };
  }

  public async validateDependencies(params: z.infer<typeof ValidateDependenciesSchema>): Promise<object> {
    this._assertInitialized();
    const { requestId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const issues: string[] = [];
    const taskMap = new Map(reqEntry.tasks.map(task => [task.id, task]));

    // Check for non-existent dependencies
    for (const task of reqEntry.tasks) {
      if (task.dependsOn) {
        for (const depId of task.dependsOn) {
          if (!taskMap.has(depId)) {
            issues.push(`Task ${task.id} ('${task.title}') depends on non-existent task ${depId}.`);
          }
        }
      }
    }

    // Check for circular dependencies (DFS-based)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    let cycleFound = false;

    function detectCycle(taskId: string): void {
      if (cycleFound) return;
      visited.add(taskId);
      recursionStack.add(taskId);

      const task = taskMap.get(taskId);
      if (task?.dependsOn) {
        for (const depId of task.dependsOn) {
          if (!taskMap.has(depId)) continue; // Already caught by non-existent check

          if (!visited.has(depId)) {
            detectCycle(depId);
            if (cycleFound) return;
          } else if (recursionStack.has(depId)) {
            issues.push(`Circular dependency detected involving task ${depId} (e.g., ${taskId} -> ... -> ${depId}).`);
            cycleFound = true;
            return;
          }
        }
      }
      recursionStack.delete(taskId);
    }

    for (const task of reqEntry.tasks) {
      if (!visited.has(task.id) && !cycleFound) {
        detectCycle(task.id);
      }
    }
    
    const uniqueIssues = Array.from(new Set(issues));
    if (uniqueIssues.length > 0) {
      return { status: "validation_failed", issues: uniqueIssues, message: `Found ${uniqueIssues.length} dependency issues.` };
    }
    return { status: "validation_passed", issues: [], message: "All dependencies are valid." };
  }

  public async addSubtask(params: z.infer<typeof AddSubtaskSchema>): Promise<object> {
    this._assertInitialized();
    const { requestId, parentTaskId, subtaskTitle, subtaskDescription, priority, dependsOn } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const parentTask = this._getTaskOrThrow(reqEntry, parentTaskId);

    if (reqEntry.completed) throw new InvalidOperationError("Cannot add subtask to a completed request.");
    if (parentTask.status === TaskStatus.Done || parentTask.status === TaskStatus.Failed) {
      throw new InvalidOperationError(`Cannot add subtask to parent task '${parentTaskId}' in terminal status ('${parentTask.status}').`);
    }

    const now = new Date().toISOString();
    const newSubtaskId = this._generateTaskId();
    const newSubtask: Task = {
      id: newSubtaskId,
      title: subtaskTitle,
      description: subtaskDescription,
      status: TaskStatus.Pending,
      priority: priority || parentTask.priority || TaskPriority.Medium,
      dependsOn: dependsOn || [],
      parentId: parentTaskId,
      completedDetails: "",
      createdAt: now,
      updatedAt: now,
      subtaskIds: [],
    };

    reqEntry.tasks.push(newSubtask);
    if (!parentTask.subtaskIds) parentTask.subtaskIds = [];
    parentTask.subtaskIds.push(newSubtaskId);
    parentTask.updatedAt = now;
    reqEntry.updatedAt = now;
    if (reqEntry.completed) reqEntry.completed = false; // Re-open request if new subtask added

    await this._saveTasksToFile();
    const progressTable = this._formatTaskProgressTable(requestId);
    return {
      status: "subtask_added",
      parentTaskId,
      subtask: { id: newSubtask.id, title: newSubtask.title, parentId: newSubtask.parentId },
      message: `Subtask '${newSubtask.title}' added to parent '${parentTask.title}'.\n${progressTable}`,
    };
  }

  /**
   * Handles deletion or archival of a task.
   * If a task (and its descendants, if applicable) are all 'done', they are archived.
   * Otherwise, they are deleted from the active tasks.
   */
  public async deleteTask(params: z.infer<typeof DeleteTaskSchema>): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const taskToProcess = this._getTaskOrThrow(reqEntry, taskId);

    const allTasksInRequestMap = new Map(reqEntry.tasks.map(t => [t.id, t]));
    
    // Determine if the task and its descendants (if any) are eligible for archival
    const canArchive = this._areAllDescendantsDone(taskToProcess, allTasksInRequestMap);

    if (canArchive) {
      // Archive the task and its descendants
      const tasksToArchiveBundle = this._collectTaskWithDescendants(taskToProcess, allTasksInRequestMap);
      
      this.completedTasksData.archivedTaskBundles.push({
        originalRequestId: requestId,
        originalRequestText: reqEntry.originalRequest,
        archivedRootTask: tasksToArchiveBundle.find(t => t.id === taskToProcess.id)!, // Should be the first one or find explicitly
        archivedSubtasks: tasksToArchiveBundle.filter(t => t.id !== taskToProcess.id),
        archivedAt: new Date().toISOString(),
      });
      
      // Remove archived tasks from active data
      this._removeTaskAndDescendantsFromRequest(reqEntry, taskId);
      
      await this._saveCompletedTasksToFile();
      await this._saveTasksToFile();
      const progressTable = this._formatTaskProgressTable(requestId);
      return {
        status: "task_archived",
        message: `Task '${taskId}' and its ${tasksToArchiveBundle.length -1} descendants (if any) were completed and have been archived.\n${progressTable}`,
        archivedCount: tasksToArchiveBundle.length,
      };
    } else {
      // Delete the task and its descendants
      const removed = this._removeTaskAndDescendantsFromRequest(reqEntry, taskId);
      if (removed) {
        await this._saveTasksToFile();
        const progressTable = this._formatTaskProgressTable(requestId);
        return {
          status: "task_deleted",
          message: `Task '${taskId}' and its descendants have been deleted (not all were 'done' for archival).\n${progressTable}`,
        };
      } else {
        // Should not happen if task was found initially
        throw new NotFoundError(`Task '${taskId}' could not be processed for deletion (already removed or error).`);
      }
    }
  }

  public async removeSubtask(params: z.infer<typeof RemoveSubtaskSchema>): Promise<object> {
    this._assertInitialized();
    const { requestId, subtaskId, parentTaskId } = params;
    const reqEntry = this._getRequestEntryOrThrow(requestId);
    const subtaskToRemove = this._getTaskOrThrow(reqEntry, subtaskId);

    if (!subtaskToRemove.parentId) {
        throw new InvalidOperationError(`Task '${subtaskId}' is not a subtask, cannot remove with this operation. Use 'delete_task'.`);
    }

    if (parentTaskId) {
        const explicitParent = this._getTaskOrThrow(reqEntry, parentTaskId);
        if (subtaskToRemove.parentId !== explicitParent.id) {
            throw new InvalidOperationError(`Task '${subtaskId}' is not a direct subtask of specified parent '${parentTaskId}'. Its actual parent is '${subtaskToRemove.parentId}'.`);
        }
    }
    // Proceed with deletion/archival logic, same as deleteTask but specifically for a subtask
    // The deleteTask method already handles descendants and archival checks.
    return this.deleteTask({ requestId, taskId: subtaskId });
  }

  // --- Formatting Helpers (could be moved to a separate utility module) ---
  private _formatTaskProgressTable(requestId: string): string {
    const reqEntry = this.requestsMap.get(requestId);
    if (!reqEntry) return "Request not found for progress table.";

    let table = "\nProgress Status:\n";
    table += "| Task ID  | Prio | Status   | Parent | Deps | Subtasks | Title (Description Snippet) |\n";
    table += "|----------|------|----------|--------|------|----------|-----------------------------|\n";

    const taskMap = new Map(reqEntry.tasks.map(t => [t.id, t]));
    const processedTaskIds = new Set<string>();

    const formatTaskRowRecursive = (taskId: string, level: number) => {
      if (processedTaskIds.has(taskId)) return;
      const task = taskMap.get(taskId);
      if (!task) return;
      processedTaskIds.add(taskId);

      const indent = "  ".repeat(level);
      const statusIcon = { [TaskStatus.Pending]: "⏳", [TaskStatus.Active]: "🔄", [TaskStatus.Done]: "✅", [TaskStatus.Failed]: "❌" }[task.status];
      const prio = task.priority.substring(0,1).toUpperCase();
      const parent = task.parentId ? task.parentId.replace("task-","p") : "----";
      const deps = task.dependsOn?.length || 0;
      const subtasks = task.subtaskIds?.length || 0;
      const titleDesc = `${indent}${task.title.substring(0, 20 - indent.length)} (${task.description.substring(0,15)}...)`;
      
      table += `| ${task.id.padEnd(8)} | ${prio.padEnd(4)} | ${statusIcon} ${task.status.padEnd(7)} | ${parent.padEnd(6)} | ${String(deps).padEnd(4)} | ${String(subtasks).padEnd(8)} | ${titleDesc} |\n`;

      if (task.subtaskIds) {
        task.subtaskIds.forEach(subId => formatTaskRowRecursive(subId, level + 1));
      }
    };
    
    const topLevelTasks = reqEntry.tasks
        .filter(t => !t.parentId)
        .sort((a,b) => parseInt(a.id.replace("task-", ""), 10) - parseInt(b.id.replace("task-", ""), 10));

    topLevelTasks.forEach(task => formatTaskRowRecursive(task.id, 0));

    // Catch any orphaned or unprocessed tasks (should be rare with good data integrity)
    reqEntry.tasks.forEach(task => {
        if (!processedTaskIds.has(task.id)) {
            formatTaskRowRecursive(task.id, 0); // Display it at root level if missed
            table += `| ${task.id.padEnd(8)} | ---- | [Orphan] | ---- | ---- | ----     | ${task.title.substring(0,15)}... |\n`;
        }
    });
    return table;
  }

  private _formatRequestsList(): string {
    let output = "\nActive Requests List:\n";
    output += "| Request ID | Total | Done | Failed | Active | Pending | Status    |\n";
    output += "|------------|-------|------|--------|--------|---------|-----------|\n";

    for (const req of this.requestsMap.values()) {
      const counts = { done: 0, failed: 0, active: 0, pending: 0 };
      req.tasks.forEach(t => {
        if (t.status === TaskStatus.Done) counts.done++;
        else if (t.status === TaskStatus.Failed) counts.failed++;
        else if (t.status === TaskStatus.Active) counts.active++;
        else if (t.status === TaskStatus.Pending) counts.pending++;
      });
      const total = req.tasks.length;
      const status = req.completed ? "✅ Completed" : (total === 0 ? "⏳ Empty" : "🔄 In Prog");
      output += `| ${req.requestId.padEnd(10)} | ${String(total).padEnd(5)} | ${String(counts.done).padEnd(4)} | ${String(counts.failed).padEnd(6)} | ${String(counts.active).padEnd(6)} | ${String(counts.pending).padEnd(7)} | ${status.padEnd(9)} |\n`;
    }
    return output;
  }
}


// --- Server Setup & Request Handling ---
const server = new Server(
  { name: "task-manager-server", version: "2.1.0" }, // Updated version
  { capabilities: { tools: {} } }
);

const taskManagerServer = new TaskManagerServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    REQUEST_PLANNING_TOOL, GET_NEXT_TASK_TOOL, MARK_TASK_DONE_TOOL,
    MARK_TASK_FAILED_TOOL, OPEN_TASK_DETAILS_TOOL, LIST_REQUESTS_TOOL,
    ADD_TASKS_TO_REQUEST_TOOL, UPDATE_TASK_TOOL, ADD_DEPENDENCY_TOOL,
    REMOVE_DEPENDENCY_TOOL, VALIDATE_DEPENDENCIES_TOOL, DELETE_TASK_TOOL,
    ADD_SUBTASK_TOOL, REMOVE_SUBTASK_TOOL,
  ],
}));

// Generic tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    await taskManagerServer.init(); // Ensure initialized on first call (idempotent)
    const { name, arguments: args } = request.params;

    // A map for cleaner dispatching
    const toolHandlers: Record<string, (params: any) => Promise<object>> = {
      [REQUEST_PLANNING_TOOL.name]: (p) => taskManagerServer.requestPlanning(RequestPlanningSchema.parse(p)),
      [GET_NEXT_TASK_TOOL.name]: (p) => taskManagerServer.getNextTask(GetNextTaskSchema.parse(p)),
      [MARK_TASK_DONE_TOOL.name]: (p) => taskManagerServer.markTaskDone(MarkTaskDoneSchema.parse(p)),
      [MARK_TASK_FAILED_TOOL.name]: (p) => taskManagerServer.markTaskFailed(MarkTaskFailedSchema.parse(p)),
      [OPEN_TASK_DETAILS_TOOL.name]: (p) => taskManagerServer.openTaskDetails(OpenTaskDetailsSchema.parse(p)),
      [LIST_REQUESTS_TOOL.name]: (p) => taskManagerServer.listRequests(ListRequestsSchema.parse(p)),
      [ADD_TASKS_TO_REQUEST_TOOL.name]: (p) => taskManagerServer.addTasksToRequest(AddTasksToRequestSchema.parse(p)),
      [UPDATE_TASK_TOOL.name]: (p) => taskManagerServer.updateTask(UpdateTaskSchema.parse(p)),
      [ADD_DEPENDENCY_TOOL.name]: (p) => taskManagerServer.addDependency(AddDependencySchema.parse(p)),
      [REMOVE_DEPENDENCY_TOOL.name]: (p) => taskManagerServer.removeDependency(RemoveDependencySchema.parse(p)),
      [VALIDATE_DEPENDENCIES_TOOL.name]: (p) => taskManagerServer.validateDependencies(ValidateDependenciesSchema.parse(p)),
      [DELETE_TASK_TOOL.name]: (p) => taskManagerServer.deleteTask(DeleteTaskSchema.parse(p)),
      [ADD_SUBTASK_TOOL.name]: (p) => taskManagerServer.addSubtask(AddSubtaskSchema.parse(p)),
      [REMOVE_SUBTASK_TOOL.name]: (p) => taskManagerServer.removeSubtask(RemoveSubtaskSchema.parse(p)),
    };

    const handler = toolHandlers[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    
    // Zod parsing is now done inside the handler call for type safety
    const result = await handler(args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };

  } catch (error: any) {
    let errorMessage = "An unexpected error occurred.";
    let errorDetails;

    if (error instanceof z.ZodError) {
      errorMessage = "Invalid arguments provided.";
      errorDetails = error.format(); // Detailed Zod error structure
      console.warn(`Zod validation error for tool '${request.params.name}':`, JSON.stringify(errorDetails));
    } else if (error instanceof NotFoundError || error instanceof InvalidOperationError) {
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    console.error(`Error processing tool '${request.params.name}':`, errorMessage, errorDetails || error);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: errorMessage, details: errorDetails }) }],
      isError: true,
    };
  }
});

async function runServer() {
  try {
    await taskManagerServer.init(); // Initialize server data before connecting
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // No console.error here, init() logs paths.
    // console.error is for actual errors.
    console.log("Task Manager MCP Server running and connected to transport.");
  } catch (error) {
    console.error("Fatal error running server:", error);
    process.exit(1);
  }
}

runServer();