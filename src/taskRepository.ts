import { getDb } from './database.js';
import {
  Task,
  TaskRow,
  RequestEntry,
  RequestRow,
  ArchivedTaskRow,
  MetadataRow,
  TaskStatus,
  TaskPriority,
  TaskType,
  NotFoundError,
  InvalidOperationError
} from './interfaces.js';
import type Database from 'better-sqlite3';

export class TaskRepository {
  private db: Database.Database;

  constructor() {
    this.db = getDb();
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Converts a database row to a Task object
   */
  private rowToTask(row: TaskRow): Task {
    return {
      id: row.taskId,
      title: row.title,
      description: row.description || '',
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
      type: row.type as TaskType || undefined,
      dependsOn: row.dependsOn ? JSON.parse(row.dependsOn) : [],
      parentId: row.parentId || undefined,
      subtaskIds: row.subtaskIds ? JSON.parse(row.subtaskIds) : [],
      failureReason: row.failureReason || undefined,
      suggestedRetryStrategy: row.suggestedRetryStrategy || undefined,
      completedDetails: row.completedDetails || undefined,
      artifactsGenerated: row.artifactsGenerated ? JSON.parse(row.artifactsGenerated) : [],
      environmentContext: row.environmentContext || undefined,
      summaryFilePath: row.summaryFilePath || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Converts a Task object to database row format
   */
  private taskToRow(task: Task, requestId: string): Omit<TaskRow, 'costData' | 'feedbackHistory' | 'retryCount'> {
    return {
      taskId: task.id,
      requestId,
      parentId: task.parentId || null,
      title: task.title,
      description: task.description || null,
      status: task.status,
      priority: task.priority,
      type: task.type || null,
      dependsOn: task.dependsOn && task.dependsOn.length > 0 ? JSON.stringify(task.dependsOn) : null,
      subtaskIds: task.subtaskIds && task.subtaskIds.length > 0 ? JSON.stringify(task.subtaskIds) : null,
      failureReason: task.failureReason || null,
      suggestedRetryStrategy: task.suggestedRetryStrategy || null,
      completedDetails: task.completedDetails || null,
      artifactsGenerated: task.artifactsGenerated && task.artifactsGenerated.length > 0 ? JSON.stringify(task.artifactsGenerated) : null,
      environmentContext: task.environmentContext || null,
      summaryFilePath: task.summaryFilePath || null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  /**
   * Converts a database row to a RequestEntry object
   */
  private rowToRequest(row: RequestRow, tasks: Task[]): RequestEntry {
    return {
      requestId: row.requestId,
      originalRequest: row.originalRequest,
      splitDetails: row.splitDetails || '',
      tasks,
      completed: Boolean(row.completed),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // ==================== METADATA METHODS ====================

  /**
   * Gets metadata value by key
   */
  public getMetadata(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  /**
   * Sets metadata value by key
   */
  public setMetadata(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO metadata (key, value, updatedAt)
      VALUES (?, ?, datetime('now'))
    `);
    stmt.run(key, value);
  }

  /**
   * Gets the next request ID and increments the counter
   */
  public getNextRequestId(): string {
    const currentId = parseInt(this.getMetadata('lastRequestId') || '0', 10);
    const nextId = currentId + 1;
    this.setMetadata('lastRequestId', nextId.toString());
    return `req-${nextId}`;
  }

  /**
   * Gets the next task ID and increments the counter
   */
  public getNextTaskId(): string {
    const currentId = parseInt(this.getMetadata('lastTaskId') || '0', 10);
    const nextId = currentId + 1;
    this.setMetadata('lastTaskId', nextId.toString());
    return `task-${nextId}`;
  }

  // ==================== REQUEST METHODS ====================

  /**
   * Creates a new request
   */
  public createRequest(originalRequest: string, splitDetails: string = ''): string {
    const requestId = this.getNextRequestId();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO requests (requestId, originalRequest, splitDetails, completed, createdAt, updatedAt)
      VALUES (?, ?, ?, 0, ?, ?)
    `);

    stmt.run(requestId, originalRequest, splitDetails, now, now);
    return requestId;
  }

  /**
   * Finds request by ID
   */
  public findRequestById(requestId: string): RequestEntry | null {
    const requestStmt = this.db.prepare('SELECT * FROM requests WHERE requestId = ?');
    const requestRow = requestStmt.get(requestId) as RequestRow | undefined;

    if (!requestRow) return null;

    const tasks = this.findTasksByRequestId(requestId);
    return this.rowToRequest(requestRow, tasks);
  }

  /**
   * Gets all requests
   */
  public findAllRequests(): RequestEntry[] {
    const requestStmt = this.db.prepare('SELECT * FROM requests ORDER BY createdAt DESC');
    const requestRows = requestStmt.all() as RequestRow[];

    return requestRows.map(row => {
      const tasks = this.findTasksByRequestId(row.requestId);
      return this.rowToRequest(row, tasks);
    });
  }

  /**
   * Updates request completion status
   */
  public updateRequestCompletion(requestId: string, completed: boolean): number {
    const stmt = this.db.prepare(`
      UPDATE requests
      SET completed = ?, updatedAt = datetime('now')
      WHERE requestId = ?
    `);
    const result = stmt.run(completed ? 1 : 0, requestId);
    return result.changes;
  }

  /**
   * Deletes a request and all its tasks
   */
  public deleteRequest(requestId: string): number {
    const stmt = this.db.prepare('DELETE FROM requests WHERE requestId = ?');
    const result = stmt.run(requestId);
    return result.changes;
  }

  // ==================== TASK METHODS ====================

  /**
   * Creates a new task
   */
  public createTask(task: Task, requestId: string): void {
    const taskRow = this.taskToRow(task, requestId);

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        taskId, requestId, parentId, title, description, status, priority, type,
        dependsOn, subtaskIds, failureReason, suggestedRetryStrategy, completedDetails,
        artifactsGenerated, environmentContext, summaryFilePath, costData,
        feedbackHistory, retryCount, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', 0, ?, ?)
    `);

    stmt.run(
      taskRow.taskId, taskRow.requestId, taskRow.parentId, taskRow.title, taskRow.description,
      taskRow.status, taskRow.priority, taskRow.type, taskRow.dependsOn, taskRow.subtaskIds,
      taskRow.failureReason, taskRow.suggestedRetryStrategy, taskRow.completedDetails,
      taskRow.artifactsGenerated, taskRow.environmentContext, taskRow.summaryFilePath,
      taskRow.createdAt, taskRow.updatedAt
    );
  }

  /**
   * Finds task by ID
   */
  public findTaskById(taskId: string): Task | null {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE taskId = ?');
    const row = stmt.get(taskId) as TaskRow | undefined;
    return row ? this.rowToTask(row) : null;
  }

  /**
   * Finds all tasks for a request
   */
  public findTasksByRequestId(requestId: string): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE requestId = ? ORDER BY createdAt ASC');
    const rows = stmt.all(requestId) as TaskRow[];
    return rows.map(row => this.rowToTask(row));
  }

  /**
   * Finds tasks by parent ID
   */
  public findTasksByParentId(parentId: string): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE parentId = ? ORDER BY createdAt ASC');
    const rows = stmt.all(parentId) as TaskRow[];
    return rows.map(row => this.rowToTask(row));
  }

  /**
   * Finds tasks by status
   */
  public findTasksByStatus(status: TaskStatus): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY createdAt ASC');
    const rows = stmt.all(status) as TaskRow[];
    return rows.map(row => this.rowToTask(row));
  }

  /**
   * Updates task status
   */
  public updateTaskStatus(taskId: string, status: TaskStatus, completedDetails?: string): number {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?, completedDetails = ?, updatedAt = datetime('now')
      WHERE taskId = ?
    `);
    const result = stmt.run(status, completedDetails || null, taskId);
    return result.changes;
  }

  /**
   * Updates task failure information
   */
  public updateTaskFailure(taskId: string, failureReason: string, suggestedRetryStrategy?: string): number {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = 'failed', failureReason = ?, suggestedRetryStrategy = ?,
          retryCount = retryCount + 1, updatedAt = datetime('now')
      WHERE taskId = ?
    `);
    const result = stmt.run(failureReason, suggestedRetryStrategy || null, taskId);
    return result.changes;
  }

  /**
   * Updates task details
   */
  public updateTask(taskId: string, updates: Partial<Task>): number {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.priority !== undefined) {
      fields.push('priority = ?');
      values.push(updates.priority);
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.dependsOn !== undefined) {
      fields.push('dependsOn = ?');
      values.push(updates.dependsOn.length > 0 ? JSON.stringify(updates.dependsOn) : null);
    }
    if (updates.subtaskIds !== undefined) {
      fields.push('subtaskIds = ?');
      values.push(updates.subtaskIds.length > 0 ? JSON.stringify(updates.subtaskIds) : null);
    }
    if (updates.environmentContext !== undefined) {
      fields.push('environmentContext = ?');
      values.push(updates.environmentContext);
    }

    if (fields.length === 0) return 0;

    fields.push('updatedAt = datetime(\'now\')');
    values.push(taskId);

    const stmt = this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE taskId = ?`);
    const result = stmt.run(...values);
    return result.changes;
  }

  /**
   * Deletes a task
   */
  public deleteTask(taskId: string): number {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE taskId = ?');
    const result = stmt.run(taskId);
    return result.changes;
  }

  /**
   * Deletes all tasks for a request
   */
  public deleteTasksByRequestId(requestId: string): number {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE requestId = ?');
    const result = stmt.run(requestId);
    return result.changes;
  }

  // ==================== DEPENDENCY METHODS ====================

  /**
   * Adds a dependency to a task
   */
  public addDependency(taskId: string, dependencyId: string): number {
    const task = this.findTaskById(taskId);
    if (!task) return 0;

    const dependsOn = task.dependsOn || [];
    if (!dependsOn.includes(dependencyId)) {
      dependsOn.push(dependencyId);
      const stmt = this.db.prepare(`
        UPDATE tasks
        SET dependsOn = ?, updatedAt = datetime('now')
        WHERE taskId = ?
      `);
      const result = stmt.run(JSON.stringify(dependsOn), taskId);
      return result.changes;
    }
    return 0;
  }

  /**
   * Removes a dependency from a task
   */
  public removeDependency(taskId: string, dependencyId: string): number {
    const task = this.findTaskById(taskId);
    if (!task) return 0;

    const dependsOn = task.dependsOn || [];
    const index = dependsOn.indexOf(dependencyId);
    if (index > -1) {
      dependsOn.splice(index, 1);
      const stmt = this.db.prepare(`
        UPDATE tasks
        SET dependsOn = ?, updatedAt = datetime('now')
        WHERE taskId = ?
      `);
      const result = stmt.run(dependsOn.length > 0 ? JSON.stringify(dependsOn) : null, taskId);
      return result.changes;
    }
    return 0;
  }

  // ==================== SUBTASK METHODS ====================

  /**
   * Adds a subtask to a parent task
   */
  public addSubtask(parentId: string, subtaskId: string): number {
    const parent = this.findTaskById(parentId);
    if (!parent) return 0;

    const subtaskIds = parent.subtaskIds || [];
    if (!subtaskIds.includes(subtaskId)) {
      subtaskIds.push(subtaskId);
      const stmt = this.db.prepare(`
        UPDATE tasks
        SET subtaskIds = ?, updatedAt = datetime('now')
        WHERE taskId = ?
      `);
      const result = stmt.run(JSON.stringify(subtaskIds), parentId);
      return result.changes;
    }
    return 0;
  }

  /**
   * Removes a subtask from a parent task
   */
  public removeSubtask(parentId: string, subtaskId: string): number {
    const parent = this.findTaskById(parentId);
    if (!parent) return 0;

    const subtaskIds = parent.subtaskIds || [];
    const index = subtaskIds.indexOf(subtaskId);
    if (index > -1) {
      subtaskIds.splice(index, 1);
      const stmt = this.db.prepare(`
        UPDATE tasks
        SET subtaskIds = ?, updatedAt = datetime('now')
        WHERE taskId = ?
      `);
      const result = stmt.run(subtaskIds.length > 0 ? JSON.stringify(subtaskIds) : null, parentId);
      return result.changes;
    }
    return 0;
  }

  // ==================== ARCHIVAL METHODS ====================

  /**
   * Archives a task tree (moves tasks to archived_tasks table)
   */
  public archiveTaskTree(taskIds: string[], originalRequestId: string, originalRequestText: string): number {
    const transaction = this.db.transaction(() => {
      const now = new Date().toISOString();
      let archivedCount = 0;

      for (const taskId of taskIds) {
        const task = this.findTaskById(taskId);
        if (task) {
          // Insert into archived_tasks
          const archiveStmt = this.db.prepare(`
            INSERT INTO archived_tasks (
              taskId, originalRequestId, originalRequestText, parentId, title, description,
              status, priority, type, dependsOn, subtaskIds, failureReason, suggestedRetryStrategy,
              completedDetails, artifactsGenerated, environmentContext, summaryFilePath,
              costData, feedbackHistory, retryCount, createdAt, updatedAt, archivedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', 0, ?, ?, ?)
          `);

          archiveStmt.run(
            task.id, originalRequestId, originalRequestText, task.parentId, task.title, task.description,
            task.status, task.priority, task.type,
            task.dependsOn && task.dependsOn.length > 0 ? JSON.stringify(task.dependsOn) : null,
            task.subtaskIds && task.subtaskIds.length > 0 ? JSON.stringify(task.subtaskIds) : null,
            task.failureReason, task.suggestedRetryStrategy, task.completedDetails,
            task.artifactsGenerated && task.artifactsGenerated.length > 0 ? JSON.stringify(task.artifactsGenerated) : null,
            task.environmentContext, task.summaryFilePath,
            task.createdAt, task.updatedAt, now
          );

          // Delete from active tasks
          this.deleteTask(taskId);
          archivedCount++;
        }
      }

      return archivedCount;
    });

    return transaction();
  }

  /**
   * Gets archived tasks by original request ID
   */
  public findArchivedTasksByRequestId(originalRequestId: string): Task[] {
    const stmt = this.db.prepare('SELECT * FROM archived_tasks WHERE originalRequestId = ? ORDER BY createdAt ASC');
    const rows = stmt.all(originalRequestId) as ArchivedTaskRow[];

    return rows.map(row => ({
      id: row.taskId,
      title: row.title,
      description: row.description || '',
      status: row.status as TaskStatus,
      priority: row.priority as TaskPriority,
      type: row.type as TaskType || undefined,
      dependsOn: row.dependsOn ? JSON.parse(row.dependsOn) : [],
      parentId: row.parentId || undefined,
      subtaskIds: row.subtaskIds ? JSON.parse(row.subtaskIds) : [],
      failureReason: row.failureReason || undefined,
      suggestedRetryStrategy: row.suggestedRetryStrategy || undefined,
      completedDetails: row.completedDetails || undefined,
      artifactsGenerated: row.artifactsGenerated ? JSON.parse(row.artifactsGenerated) : [],
      environmentContext: row.environmentContext || undefined,
      summaryFilePath: row.summaryFilePath || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  // ==================== TRANSACTIONAL METHODS ====================

  /**
   * Merges multiple tasks into one (transactional)
   */
  public mergeTasks(taskIds: string[], mergedTask: Task, requestId: string): void {
    const transaction = this.db.transaction(() => {
      // Delete old tasks
      for (const taskId of taskIds) {
        this.deleteTask(taskId);
      }

      // Create new merged task
      this.createTask(mergedTask, requestId);
    });

    transaction();
  }

  /**
   * Executes multiple operations in a transaction
   */
  public transaction<T>(operations: () => T): T {
    const transaction = this.db.transaction(operations);
    return transaction();
  }
}
