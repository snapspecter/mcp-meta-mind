import { z } from "zod";
import { TaskRepository } from "./taskRepository.js";
import {
  Task,
  TaskStatus,
  TaskPriority,
  TaskType,
  RequestEntry,
  NotFoundError,
  InvalidOperationError,
} from "./interfaces.js";
import {
  RequestPlanningSchema,
  GetNextTaskSchema,
  MarkTaskDoneSchema,
  MarkTaskFailedSchema,
  OpenTaskDetailsSchema,
  ListRequestsSchema,
  AddTasksToRequestSchema,
  UpdateTaskSchema,
  AddDependencySchema,
  RemoveDependencySchema,
  ValidateDependenciesSchema,
  DeleteTaskSchema,
  AddSubtaskSchema,
  RemoveSubtaskSchema,
  ArchiveTaskTreeSchema,
  LogTaskCompletionSummarySchema,
  SplitTaskSchema,
  MergeTasksSchema,
} from "./schemas.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { MigrationUtility } from "./migration.js";

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".mcp_agent_task_hub");
const COMPLETED_TASK_SUMMARIES_DIR_PATH = path.join(
  DEFAULT_DATA_DIR,
  "completed_task_summaries",
);

export class TaskManagerServer {
  private taskRepository: TaskRepository;
  private isInitialized = false;

  constructor() {
    this.taskRepository = new TaskRepository();
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    // Ensure directories exist for summary files
    await fs.mkdir(DEFAULT_DATA_DIR, { recursive: true });
    await fs.mkdir(COMPLETED_TASK_SUMMARIES_DIR_PATH, { recursive: true });

    // Check for migration from old JSON files
    const migration = new MigrationUtility();
    if (await migration.isMigrationNeeded()) {
      console.log(
        "🔄 Old JSON files detected. Performing automatic migration to SQLite...",
      );
      const result = await migration.performMigration();

      if (result.success) {
        console.log("✅ Migration completed successfully!");
        console.log(
          `📊 Migrated: ${result.migratedRequests} requests, ${result.migratedTasks} active tasks, ${result.migratedArchivedTasks} archived tasks`,
        );
        console.log(
          "💾 Original files backed up to ~/.mcp_agent_task_hub/backup/",
        );
      } else {
        console.error("❌ Migration failed with errors:");
        result.errors.forEach((error) => console.error(`  • ${error}`));
        console.log(
          "⚠️  Continuing with empty database. Check migration errors above.",
        );
      }
    }

    this.isInitialized = true;

    console.log("MCP-AgentTaskHub Server initialized with SQLite backend.");
    console.log(`Database path: ${this.taskRepository.constructor.name}`);
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

  private _getRequestEntryOrThrow(requestId: string): RequestEntry {
    const request = this.taskRepository.findRequestById(requestId);
    if (!request) {
      throw new NotFoundError(`Request '${requestId}' not found.`);
    }
    return request;
  }

  private _getTaskOrThrow(requestEntry: RequestEntry, taskId: string): Task {
    const task = requestEntry.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new NotFoundError(
        `Task '${taskId}' not found in request '${requestEntry.requestId}'.`,
      );
    }
    return task;
  }

  private _getTaskFromAnyRequestOrThrow(taskId: string): Task {
    const task = this.taskRepository.findTaskById(taskId);
    if (!task) {
      throw new NotFoundError(`Task '${taskId}' not found.`);
    }
    return task;
  }

  private _areAllDescendantsStatus(
    task: Task,
    targetStatus: TaskStatus,
  ): boolean {
    if (!task.subtaskIds || task.subtaskIds.length === 0) {
      return task.status === targetStatus;
    }

    for (const subtaskId of task.subtaskIds) {
      const subtask = this.taskRepository.findTaskById(subtaskId);
      if (!subtask || !this._areAllDescendantsStatus(subtask, targetStatus)) {
        return false;
      }
    }
    return task.status === targetStatus;
  }

  private _isTaskTreeFullyTerminal(task: Task): boolean {
    const terminalStatuses = [TaskStatus.Done, TaskStatus.Failed];
    if (!terminalStatuses.includes(task.status)) return false;

    if (!task.subtaskIds || task.subtaskIds.length === 0) {
      return true;
    }

    for (const subtaskId of task.subtaskIds) {
      const subtask = this.taskRepository.findTaskById(subtaskId);
      if (!subtask || !this._isTaskTreeFullyTerminal(subtask)) {
        return false;
      }
    }
    return true;
  }

  private _collectTaskWithDescendants(
    task: Task,
    collected: Task[] = [],
  ): Task[] {
    collected.push(task);
    if (task.subtaskIds) {
      for (const subtaskId of task.subtaskIds) {
        const subtask = this.taskRepository.findTaskById(subtaskId);
        if (subtask) {
          this._collectTaskWithDescendants(subtask, collected);
        }
      }
    }
    return collected;
  }

  private async _autoArchiveTaskTree(
    requestId: string,
    task: Task,
  ): Promise<string> {
    if (!this._isTaskTreeFullyTerminal(task)) {
      return "";
    }

    const request = this._getRequestEntryOrThrow(requestId);
    const allTasksToArchive = this._collectTaskWithDescendants(task);
    const taskIds = allTasksToArchive.map((t) => t.id);

    // Archive the task tree
    const archivedCount = this.taskRepository.archiveTaskTree(
      taskIds,
      requestId,
      request.originalRequest,
    );

    if (archivedCount > 0) {
      // Check if request is now complete
      const remainingTasks =
        this.taskRepository.findTasksByRequestId(requestId);
      if (remainingTasks.length === 0) {
        this.taskRepository.updateRequestCompletion(requestId, true);
      }

      return ` Task tree '${task.id}' and ${archivedCount} descendant(s) auto-archived.`;
    }

    return "";
  }

  public async requestPlanning(
    params: z.infer<typeof RequestPlanningSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { originalRequest, splitDetails, tasks } = params;

    // Create the request
    const requestId = this.taskRepository.createRequest(
      originalRequest,
      splitDetails || "",
    );

    // Create tasks
    const now = new Date().toISOString();
    const createdTasks: Task[] = [];

    for (const taskDef of tasks) {
      const taskId = this.taskRepository.getNextTaskId();
      const task: Task = {
        id: taskId,
        title: taskDef.title,
        description: taskDef.description,
        status: TaskStatus.Pending,
        priority: taskDef.priority || TaskPriority.Medium,
        type: taskDef.type,
        dependsOn: taskDef.dependsOn || [],
        parentId: undefined,
        subtaskIds: [],
        artifactsGenerated: taskDef.artifactsGenerated || [],
        environmentContext: taskDef.environmentContext,
        createdAt: now,
        updatedAt: now,
      };

      this.taskRepository.createTask(task, requestId);
      createdTasks.push(task);
    }

    return {
      status: "planned",
      requestId,
      tasksCreated: createdTasks.length,
      message: `Request '${requestId}' planned with ${createdTasks.length} task(s).`,
    };
  }

  public async getNextTask(
    params: z.infer<typeof GetNextTaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId } = params;
    const request = this._getRequestEntryOrThrow(requestId);

    if (request.completed) {
      return {
        status: "request_completed",
        message: `Request '${requestId}' is already completed.`,
      };
    }

    const tasks = this.taskRepository.findTasksByRequestId(requestId);

    // Find next actionable task (pending with no unmet dependencies)
    for (const task of tasks) {
      if (task.status !== TaskStatus.Pending) continue;

      // Check if all dependencies are met
      const hasUnmetDependencies = (task.dependsOn || []).some((depId) => {
        const depTask = this.taskRepository.findTaskById(depId);
        return !depTask || depTask.status !== TaskStatus.Done;
      });

      if (!hasUnmetDependencies) {
        return {
          status: "next_task",
          task: {
            id: task.id,
            title: task.title,
            priority: task.priority,
            type: task.type,
            status: task.status,
          },
          message: `Next task for '${requestId}': '${task.title}'.\n${this._formatTaskProgressTable(requestId)}`,
        };
      }
    }

    return {
      status: "no_actionable_tasks",
      message: `No actionable tasks found for request '${requestId}'. All tasks are either completed, failed, or waiting for dependencies.`,
    };
  }

  public async markTaskDone(
    params: z.infer<typeof MarkTaskDoneSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, completedDetails, artifactsGenerated } = params;
    const request = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(request, taskId);

    if (task.status === TaskStatus.Done) {
      return { status: "already_done", message: "Task already done." };
    }
    if (task.status === TaskStatus.Failed) {
      throw new InvalidOperationError("Task failed. Cannot mark as done.");
    }

    // Update task in database
    this.taskRepository.updateTaskStatus(
      taskId,
      TaskStatus.Done,
      completedDetails || "Completed successfully.",
    );

    // Update artifacts if provided
    if (artifactsGenerated) {
      this.taskRepository.updateTask(taskId, { artifactsGenerated });
    }

    let message = `Task '${taskId}' marked done.`;

    // Handle parent completion logic
    const parentCompletionResult = await this._handleParentCompletion(
      requestId,
      task,
    );
    message += parentCompletionResult.messageAugmentation;

    // Check if entire request is complete
    const remainingTasks = this.taskRepository.findTasksByRequestId(requestId);
    const allTasksTerminal = remainingTasks.every(
      (t) => t.status === TaskStatus.Done || t.status === TaskStatus.Failed,
    );

    if (allTasksTerminal) {
      this.taskRepository.updateRequestCompletion(requestId, true);
      message += " Request fully completed!";
    }

    return {
      status: "done",
      message,
      taskProgress: this._formatTaskProgressTable(requestId),
    };
  }

  public async markTaskFailed(
    params: z.infer<typeof MarkTaskFailedSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, reason, suggestedRetryStrategy } = params;
    const request = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(request, taskId);

    if (task.status === TaskStatus.Done) {
      throw new InvalidOperationError(
        "Task is already done. Cannot mark as failed.",
      );
    }
    if (task.status === TaskStatus.Failed) {
      return { status: "already_failed", message: "Task already failed." };
    }

    // Update task failure in database
    this.taskRepository.updateTaskFailure(
      taskId,
      reason || "Task failed without specific reason.",
      suggestedRetryStrategy,
    );

    let message = `Task '${taskId}' marked failed.`;
    if (reason) message += ` Reason: ${reason}`;
    if (suggestedRetryStrategy)
      message += ` Retry strategy: ${suggestedRetryStrategy}`;

    return {
      status: "failed",
      message,
      taskProgress: this._formatTaskProgressTable(requestId),
    };
  }

  public async updateTask(
    params: z.infer<typeof UpdateTaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, ...updates } = params;
    const request = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(request, taskId);

    // Convert status update to use our status method if needed
    if (updates.status) {
      this.taskRepository.updateTaskStatus(taskId, updates.status);
      delete updates.status;
    }

    // Update other fields
    const changedCount = this.taskRepository.updateTask(taskId, updates);

    if (changedCount === 0) {
      return {
        status: "no_changes",
        message: "No changes were made to the task.",
      };
    }

    return {
      status: "updated",
      message: `Task '${taskId}' updated successfully.`,
    };
  }

  public async deleteTask(
    params: z.infer<typeof DeleteTaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId } = params;
    const request = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(request, taskId);

    // Collect all tasks to delete (task + descendants)
    const allTasksToDelete = this._collectTaskWithDescendants(task);
    const taskIds = allTasksToDelete.map((t) => t.id);

    // Remove from parent's subtaskIds if this task has a parent
    if (task.parentId) {
      this.taskRepository.removeSubtask(task.parentId, taskId);
    }

    // Delete all tasks
    let deletedCount = 0;
    for (const id of taskIds) {
      deletedCount += this.taskRepository.deleteTask(id);
    }

    return {
      status: "deleted",
      message: `Task '${taskId}' and ${deletedCount - 1} descendant(s) deleted.`,
    };
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

    const request = this._getRequestEntryOrThrow(requestId);
    const parentTask = this._getTaskOrThrow(request, parentTaskId);

    const subtaskId = this.taskRepository.getNextTaskId();
    const now = new Date().toISOString();

    const subtask: Task = {
      id: subtaskId,
      title: subtaskTitle,
      description: subtaskDescription,
      status: TaskStatus.Pending,
      priority: priority || TaskPriority.Medium,
      type,
      dependsOn: dependsOn || [],
      parentId: parentTaskId,
      subtaskIds: [],
      artifactsGenerated: artifactsGenerated || [],
      environmentContext,
      createdAt: now,
      updatedAt: now,
    };

    // Create subtask and update parent
    this.taskRepository.createTask(subtask, requestId);
    this.taskRepository.addSubtask(parentTaskId, subtaskId);

    return {
      status: "subtask_added",
      subtaskId,
      message: `Subtask '${subtaskId}' added to parent '${parentTaskId}'.`,
    };
  }

  public async removeSubtask(
    params: z.infer<typeof RemoveSubtaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, subtaskId, parentTaskId } = params;

    const request = this._getRequestEntryOrThrow(requestId);
    const subtask = this._getTaskOrThrow(request, subtaskId);

    const actualParentId = parentTaskId || subtask.parentId;
    if (!actualParentId) {
      throw new InvalidOperationError(
        "Cannot remove subtask: no parent specified and task has no parent.",
      );
    }

    // Remove from parent and delete task tree
    this.taskRepository.removeSubtask(actualParentId, subtaskId);
    const allTasksToDelete = this._collectTaskWithDescendants(subtask);
    let deletedCount = 0;
    for (const task of allTasksToDelete) {
      deletedCount += this.taskRepository.deleteTask(task.id);
    }

    return {
      status: "subtask_removed",
      message: `Subtask '${subtaskId}' and ${deletedCount - 1} descendant(s) removed.`,
    };
  }

  public async archiveTaskTree(
    params: z.infer<typeof ArchiveTaskTreeSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId } = params;
    const request = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(request, taskId);

    if (!this._areAllDescendantsStatus(task, TaskStatus.Done)) {
      throw new InvalidOperationError(
        "Cannot archive: task tree is not fully completed.",
      );
    }

    const allTasksToArchive = this._collectTaskWithDescendants(task);
    const taskIds = allTasksToArchive.map((t) => t.id);

    const archivedCount = this.taskRepository.archiveTaskTree(
      taskIds,
      requestId,
      request.originalRequest,
    );

    // Check if request is now complete
    const remainingTasks = this.taskRepository.findTasksByRequestId(requestId);
    if (remainingTasks.length === 0) {
      this.taskRepository.updateRequestCompletion(requestId, true);
    }

    return {
      status: "archived",
      archivedCount,
      message: `Task tree '${taskId}' with ${archivedCount} task(s) archived successfully.`,
    };
  }

  public async logTaskCompletionSummary(
    params: z.infer<typeof LogTaskCompletionSummarySchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, summaryMarkdownContent, artifactsGenerated } =
      params;

    const request = this._getRequestEntryOrThrow(requestId);
    const task = this._getTaskOrThrow(request, taskId);

    const summaryFileName = `${taskId}_completion_summary.md`;
    const summaryFilePath = path.join(
      COMPLETED_TASK_SUMMARIES_DIR_PATH,
      summaryFileName,
    );

    await fs.writeFile(summaryFilePath, summaryMarkdownContent, "utf-8");

    // Update task with summary file path and artifacts
    const updates: Partial<Task> = { summaryFilePath };
    if (artifactsGenerated) {
      updates.artifactsGenerated = artifactsGenerated;
    }
    this.taskRepository.updateTask(taskId, updates);

    return {
      status: "summary_logged",
      summaryFilePath,
      message: `Completion summary for task '${taskId}' saved to ${summaryFilePath}.`,
    };
  }

  public async openTaskDetails(
    params: z.infer<typeof OpenTaskDetailsSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { taskId } = params;
    const task = this._getTaskFromAnyRequestOrThrow(taskId);

    return {
      status: "task_details",
      task,
    };
  }

  public async listRequests(
    params: z.infer<typeof ListRequestsSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const requests = this.taskRepository.findAllRequests();

    return {
      status: "requests_listed",
      requests: this._formatRequestsList(requests),
      count: requests.length,
    };
  }

  public async addTasksToRequest(
    params: z.infer<typeof AddTasksToRequestSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, tasks } = params;
    const request = this._getRequestEntryOrThrow(requestId);

    const now = new Date().toISOString();
    const createdTasks: Task[] = [];

    for (const taskDef of tasks) {
      const taskId = this.taskRepository.getNextTaskId();
      const task: Task = {
        id: taskId,
        title: taskDef.title,
        description: taskDef.description,
        status: TaskStatus.Pending,
        priority: taskDef.priority || TaskPriority.Medium,
        type: taskDef.type,
        dependsOn: taskDef.dependsOn || [],
        parentId: undefined,
        subtaskIds: [],
        artifactsGenerated: taskDef.artifactsGenerated || [],
        environmentContext: taskDef.environmentContext,
        createdAt: now,
        updatedAt: now,
      };

      this.taskRepository.createTask(task, requestId);
      createdTasks.push(task);
    }

    return {
      status: "tasks_added",
      tasksCreated: createdTasks.length,
      message: `${createdTasks.length} task(s) added to request '${requestId}'.`,
    };
  }

  public async addDependency(
    params: z.infer<typeof AddDependencySchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskId, dependsOnTaskId } = params;
    const request = this._getRequestEntryOrThrow(requestId);
    this._getTaskOrThrow(request, taskId);
    this._getTaskOrThrow(request, dependsOnTaskId);

    const updated = this.taskRepository.addDependency(taskId, dependsOnTaskId);
    if (updated === 0) {
      return {
        status: "dependency_exists",
        message: "Dependency already exists or task not found.",
      };
    }

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
    const request = this._getRequestEntryOrThrow(requestId);
    this._getTaskOrThrow(request, taskId);

    const updated = this.taskRepository.removeDependency(
      taskId,
      dependsOnTaskId,
    );
    if (updated === 0) {
      return {
        status: "dependency_not_found",
        message: "Dependency not found or task not found.",
      };
    }

    return {
      status: "dependency_removed",
      message: `Dependency from '${taskId}' to '${dependsOnTaskId}' removed.`,
    };
  }

  public async validateDependencies(
    params: z.infer<typeof ValidateDependenciesSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId } = params;
    const request = this._getRequestEntryOrThrow(requestId);
    const tasks = this.taskRepository.findTasksByRequestId(requestId);

    // Build task map for quick lookup
    const taskMap = new Map<string, Task>();
    tasks.forEach((task) => taskMap.set(task.id, task));

    // Check for cycles using DFS
    function detectCycle(
      taskId: string,
      visited: Set<string>,
      recStack: Set<string>,
    ): boolean {
      if (recStack.has(taskId)) return true;
      if (visited.has(taskId)) return false;

      visited.add(taskId);
      recStack.add(taskId);

      const task = taskMap.get(taskId);
      if (task?.dependsOn) {
        for (const depId of task.dependsOn) {
          if (detectCycle(depId, visited, recStack)) return true;
        }
      }

      recStack.delete(taskId);
      return false;
    }

    const visited = new Set<string>();
    const issues: string[] = [];

    for (const task of tasks) {
      if (detectCycle(task.id, visited, new Set())) {
        issues.push(
          `Circular dependency detected involving task '${task.id}'.`,
        );
      }

      // Check for missing dependencies
      if (task.dependsOn) {
        for (const depId of task.dependsOn) {
          if (!taskMap.has(depId)) {
            issues.push(
              `Task '${task.id}' depends on non-existent task '${depId}'.`,
            );
          }
        }
      }
    }

    return {
      status: issues.length === 0 ? "valid" : "invalid",
      issues,
      message:
        issues.length === 0
          ? "All dependencies are valid."
          : `Found ${issues.length} dependency issue(s).`,
    };
  }

  public async splitTask(
    params: z.infer<typeof SplitTaskSchema>,
  ): Promise<object> {
    this._assertInitialized();
    const { requestId, taskIdToSplit, newSubtaskDefinitions } = params;
    const request = this._getRequestEntryOrThrow(requestId);
    const taskToSplit = this._getTaskOrThrow(request, taskIdToSplit);

    if (taskToSplit.status === TaskStatus.Done) {
      throw new InvalidOperationError("Cannot split a completed task.");
    }

    const now = new Date().toISOString();
    const createdSubtasks: Task[] = [];

    // Create subtasks
    for (const subtaskDef of newSubtaskDefinitions) {
      const subtaskId = this.taskRepository.getNextTaskId();
      const subtask: Task = {
        id: subtaskId,
        title: subtaskDef.title,
        description: subtaskDef.description,
        status: TaskStatus.Pending,
        priority: subtaskDef.priority || taskToSplit.priority,
        type: subtaskDef.type || taskToSplit.type,
        dependsOn: subtaskDef.dependsOn || [],
        parentId: taskIdToSplit,
        subtaskIds: [],
        artifactsGenerated: subtaskDef.artifactsGenerated || [],
        environmentContext:
          subtaskDef.environmentContext || taskToSplit.environmentContext,
        createdAt: now,
        updatedAt: now,
      };

      this.taskRepository.createTask(subtask, requestId);
      this.taskRepository.addSubtask(taskIdToSplit, subtaskId);
      createdSubtasks.push(subtask);
    }

    return {
      status: "task_split",
      originalTaskId: taskIdToSplit,
      createdSubtasks: createdSubtasks.map((t) => ({
        id: t.id,
        title: t.title,
      })),
      message: `Task '${taskIdToSplit}' split into ${createdSubtasks.length} subtask(s).`,
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

    const request = this._getRequestEntryOrThrow(requestId);
    const primaryTask = this._getTaskOrThrow(request, primaryTaskId);

    // Validate all tasks to merge exist
    const tasksToMerge: Task[] = [];
    for (const taskId of taskIdsToMerge) {
      const task = this._getTaskOrThrow(request, taskId);
      tasksToMerge.push(task);
    }

    // Collect merged dependencies and artifacts
    const mergedDependsOn = new Set(primaryTask.dependsOn || []);
    const mergedArtifacts = new Set(primaryTask.artifactsGenerated || []);

    for (const task of tasksToMerge) {
      (task.dependsOn || []).forEach((dep) => mergedDependsOn.add(dep));
      (task.artifactsGenerated || []).forEach((art) =>
        mergedArtifacts.add(art),
      );
    }

    // Remove self-references from dependencies
    const allTaskIds = [primaryTaskId, ...taskIdsToMerge];
    allTaskIds.forEach((id) => mergedDependsOn.delete(id));

    // Create merged task
    const now = new Date().toISOString();
    const mergedTask: Task = {
      id: this.taskRepository.getNextTaskId(),
      title: newTitle || primaryTask.title,
      description: newDescription || primaryTask.description,
      status: TaskStatus.Pending,
      priority: newPriority || primaryTask.priority,
      type: newType || primaryTask.type,
      dependsOn: Array.from(mergedDependsOn),
      parentId: primaryTask.parentId,
      subtaskIds: [],
      artifactsGenerated: newArtifactsGenerated || Array.from(mergedArtifacts),
      environmentContext:
        newEnvironmentContext || primaryTask.environmentContext,
      createdAt: now,
      updatedAt: now,
    };

    // Use transaction to merge tasks
    this.taskRepository.mergeTasks(allTaskIds, mergedTask, requestId);

    // Update parent if primary task had one
    if (primaryTask.parentId) {
      this.taskRepository.removeSubtask(primaryTask.parentId, primaryTaskId);
      this.taskRepository.addSubtask(primaryTask.parentId, mergedTask.id);
    }

    return {
      status: "tasks_merged",
      mergedTaskId: mergedTask.id,
      originalTaskIds: allTaskIds,
      message: `Tasks [${allTaskIds.join(", ")}] merged into new task '${mergedTask.id}'.`,
    };
  }

  private async _handleParentCompletion(
    requestId: string,
    completedTask: Task,
  ): Promise<{
    messageAugmentation: string;
    treeCompletionStatus: string;
  }> {
    let messageAugmentation = "";
    let treeCompletionStatus = "none";

    if (!completedTask.parentId) {
      // Check for auto-archiving of root task
      const archiveMessage = await this._autoArchiveTaskTree(
        requestId,
        completedTask,
      );
      messageAugmentation += archiveMessage;
      if (archiveMessage) treeCompletionStatus = "archived";
      return { messageAugmentation, treeCompletionStatus };
    }

    const parent = this.taskRepository.findTaskById(completedTask.parentId);
    if (!parent) return { messageAugmentation, treeCompletionStatus };

    // Check if all siblings are done
    const allSiblingsDone = (parent.subtaskIds || []).every((siblingId) => {
      const sibling = this.taskRepository.findTaskById(siblingId);
      return sibling?.status === TaskStatus.Done;
    });

    if (allSiblingsDone) {
      // Mark parent as done
      this.taskRepository.updateTaskStatus(
        parent.id,
        TaskStatus.Done,
        "All subtasks completed.",
      );
      messageAugmentation += ` Parent task '${parent.id}' auto-completed.`;

      // Recursively check parent's parent
      const grandParentResult = await this._handleParentCompletion(
        requestId,
        parent,
      );
      messageAugmentation += grandParentResult.messageAugmentation;
      if (grandParentResult.treeCompletionStatus !== "none") {
        treeCompletionStatus = grandParentResult.treeCompletionStatus;
      }
    }

    return { messageAugmentation, treeCompletionStatus };
  }

  private _formatTaskProgressTable(requestId: string): string {
    const tasks = this.taskRepository.findTasksByRequestId(requestId);
    if (tasks.length === 0) return "No tasks found.";

    const lines = ["Task Progress:"];
    lines.push("ID | Title | Status | Priority | Type");
    lines.push("---|-------|--------|----------|-----");

    for (const task of tasks) {
      const title =
        task.title.length > 30
          ? task.title.substring(0, 27) + "..."
          : task.title;
      const status = task.status;
      const priority = task.priority;
      const type = task.type || "N/A";
      lines.push(`${task.id} | ${title} | ${status} | ${priority} | ${type}`);
    }

    return lines.join("\n");
  }

  private _formatRequestsList(requests: RequestEntry[]): string {
    if (requests.length === 0) return "No requests found.";

    const lines = ["Active Requests:"];
    lines.push("ID | Original Request | Tasks | Completed | Created");
    lines.push("---|------------------|-------|-----------|--------");

    for (const req of requests) {
      const originalRequest =
        req.originalRequest.length > 40
          ? req.originalRequest.substring(0, 37) + "..."
          : req.originalRequest;
      const taskCount = req.tasks.length;
      const completed = req.completed ? "Yes" : "No";
      const created = new Date(req.createdAt).toLocaleDateString();
      lines.push(
        `${req.requestId} | ${originalRequest} | ${taskCount} | ${completed} | ${created}`,
      );
    }

    return lines.join("\n");
  }
}
