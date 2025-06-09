import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { TaskRepository } from "./taskRepository.js";
import {
  Task,
  RequestEntry,
  TaskManagerFile,
  CompletedTasksFile,
  ArchivedTaskBundle,
  TaskStatus,
  TaskPriority,
  TaskType,
} from "./interfaces.js";

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".mcp_agent_task_hub");
const ACTIVE_TASKS_FILE_PATH = path.join(DEFAULT_DATA_DIR, "active_tasks.json");
const COMPLETED_TASKS_FILE_PATH = path.join(DEFAULT_DATA_DIR, "completed_tasks.json");
const BACKUP_DIR = path.join(DEFAULT_DATA_DIR, "backup");

export class MigrationUtility {
  private taskRepository: TaskRepository;

  constructor() {
    this.taskRepository = new TaskRepository();
  }

  /**
   * Check if migration is needed (old JSON files exist)
   */
  public async isMigrationNeeded(): Promise<boolean> {
    try {
      await fs.access(ACTIVE_TASKS_FILE_PATH);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Perform complete migration from JSON files to SQLite
   */
  public async performMigration(): Promise<{
    success: boolean;
    migratedRequests: number;
    migratedTasks: number;
    migratedArchivedTasks: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      migratedRequests: 0,
      migratedTasks: 0,
      migratedArchivedTasks: 0,
      errors: [] as string[],
    };

    try {
      console.log("Starting migration from JSON files to SQLite...");

      // Create backup directory
      await fs.mkdir(BACKUP_DIR, { recursive: true });

      // Step 1: Migrate active tasks
      const activeTasksResult = await this._migrateActiveTasks();
      result.migratedRequests = activeTasksResult.requestCount;
      result.migratedTasks = activeTasksResult.taskCount;
      result.errors.push(...activeTasksResult.errors);

      // Step 2: Migrate completed/archived tasks
      const completedTasksResult = await this._migrateCompletedTasks();
      result.migratedArchivedTasks = completedTasksResult.archivedTaskCount;
      result.errors.push(...completedTasksResult.errors);

      // Step 3: Backup original files
      await this._backupOriginalFiles();

      result.success = result.errors.length === 0;

      console.log(`Migration completed with ${result.errors.length} errors.`);
      console.log(`Migrated: ${result.migratedRequests} requests, ${result.migratedTasks} active tasks, ${result.migratedArchivedTasks} archived tasks`);

      return result;
    } catch (error) {
      result.errors.push(`Fatal migration error: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }
  }

  /**
   * Migrate active tasks from JSON file to SQLite
   */
  private async _migrateActiveTasks(): Promise<{
    requestCount: number;
    taskCount: number;
    errors: string[];
  }> {
    const result = {
      requestCount: 0,
      taskCount: 0,
      errors: [] as string[],
    };

    try {
      const fileContent = await fs.readFile(ACTIVE_TASKS_FILE_PATH, "utf-8");
      const data = JSON.parse(fileContent) as TaskManagerFile;

      // Update metadata counters if needed
      if (data.metadata) {
        this.taskRepository.setMetadata("lastRequestId", data.metadata.lastRequestId.toString());
        this.taskRepository.setMetadata("lastTaskId", data.metadata.lastTaskId.toString());
      }

      // Migrate each request and its tasks
      for (const request of data.requests) {
        try {
          // Create request in database using existing ID
          const stmt = this.taskRepository['db'].prepare(`
            INSERT INTO requests (requestId, originalRequest, splitDetails, completed, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?)
          `);

          stmt.run(
            request.requestId,
            request.originalRequest,
            request.splitDetails || "",
            request.completed ? 1 : 0,
            request.createdAt,
            request.updatedAt
          );

          result.requestCount++;

          // Migrate tasks for this request
          for (const task of request.tasks) {
            try {
              await this._migrateTask(task, request.requestId);
              result.taskCount++;
            } catch (error) {
              result.errors.push(
                `Error migrating task ${task.id}: ${error instanceof Error ? error.message : String(error)}`
              );
            }
          }
        } catch (error) {
          result.errors.push(
            `Error migrating request ${request.requestId}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        console.log("No active_tasks.json file found, skipping active tasks migration.");
      } else {
        result.errors.push(
          `Error reading active tasks file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }

  /**
   * Migrate completed/archived tasks from JSON file to SQLite
   */
  private async _migrateCompletedTasks(): Promise<{
    archivedTaskCount: number;
    errors: string[];
  }> {
    const result = {
      archivedTaskCount: 0,
      errors: [] as string[],
    };

    try {
      const fileContent = await fs.readFile(COMPLETED_TASKS_FILE_PATH, "utf-8");
      const data = JSON.parse(fileContent) as CompletedTasksFile;

      for (const bundle of data.archivedTaskBundles) {
        try {
          // Migrate root task
          await this._migrateArchivedTask(
            bundle.archivedRootTask,
            bundle.originalRequestId,
            bundle.originalRequestText,
            bundle.archivedAt
          );
          result.archivedTaskCount++;

          // Migrate subtasks
          for (const subtask of bundle.archivedSubtasks) {
            await this._migrateArchivedTask(
              subtask,
              bundle.originalRequestId,
              bundle.originalRequestText,
              bundle.archivedAt
            );
            result.archivedTaskCount++;
          }
        } catch (error) {
          result.errors.push(
            `Error migrating archived bundle for request ${bundle.originalRequestId}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        console.log("No completed_tasks.json file found, skipping archived tasks migration.");
      } else {
        result.errors.push(
          `Error reading completed tasks file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return result;
  }

  /**
   * Migrate a single task to the database
   */
  private async _migrateTask(task: Task, requestId: string): Promise<void> {
    const stmt = this.taskRepository['db'].prepare(`
      INSERT INTO tasks (
        taskId, requestId, parentId, title, description, status, priority, type,
        dependsOn, subtaskIds, failureReason, suggestedRetryStrategy, completedDetails,
        artifactsGenerated, environmentContext, summaryFilePath, costData,
        feedbackHistory, retryCount, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', 0, ?, ?)
    `);

    stmt.run(
      task.id,
      requestId,
      task.parentId || null,
      task.title,
      task.description || null,
      task.status,
      task.priority,
      task.type || null,
      task.dependsOn && task.dependsOn.length > 0 ? JSON.stringify(task.dependsOn) : null,
      task.subtaskIds && task.subtaskIds.length > 0 ? JSON.stringify(task.subtaskIds) : null,
      task.failureReason || null,
      task.suggestedRetryStrategy || null,
      task.completedDetails || null,
      task.artifactsGenerated && task.artifactsGenerated.length > 0 ? JSON.stringify(task.artifactsGenerated) : null,
      task.environmentContext || null,
      task.summaryFilePath || null,
      task.createdAt,
      task.updatedAt
    );
  }

  /**
   * Migrate a single archived task to the database
   */
  private async _migrateArchivedTask(
    task: Task,
    originalRequestId: string,
    originalRequestText: string,
    archivedAt: string
  ): Promise<void> {
    const stmt = this.taskRepository['db'].prepare(`
      INSERT INTO archived_tasks (
        taskId, originalRequestId, originalRequestText, parentId, title, description,
        status, priority, type, dependsOn, subtaskIds, failureReason, suggestedRetryStrategy,
        completedDetails, artifactsGenerated, environmentContext, summaryFilePath,
        costData, feedbackHistory, retryCount, createdAt, updatedAt, archivedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', 0, ?, ?, ?)
    `);

    stmt.run(
      task.id,
      originalRequestId,
      originalRequestText,
      task.parentId || null,
      task.title,
      task.description || null,
      task.status,
      task.priority,
      task.type || null,
      task.dependsOn && task.dependsOn.length > 0 ? JSON.stringify(task.dependsOn) : null,
      task.subtaskIds && task.subtaskIds.length > 0 ? JSON.stringify(task.subtaskIds) : null,
      task.failureReason || null,
      task.suggestedRetryStrategy || null,
      task.completedDetails || null,
      task.artifactsGenerated && task.artifactsGenerated.length > 0 ? JSON.stringify(task.artifactsGenerated) : null,
      task.environmentContext || null,
      task.summaryFilePath || null,
      task.createdAt,
      task.updatedAt,
      archivedAt
    );
  }

  /**
   * Backup original JSON files
   */
  private async _backupOriginalFiles(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    try {
      await fs.copyFile(
        ACTIVE_TASKS_FILE_PATH,
        path.join(BACKUP_DIR, `active_tasks_${timestamp}.json`)
      );
      console.log("Backed up active_tasks.json");
    } catch (error) {
      // File might not exist, that's okay
    }

    try {
      await fs.copyFile(
        COMPLETED_TASKS_FILE_PATH,
        path.join(BACKUP_DIR, `completed_tasks_${timestamp}.json`)
      );
      console.log("Backed up completed_tasks.json");
    } catch (error) {
      // File might not exist, that's okay
    }
  }

  /**
   * Clean up original JSON files after successful migration
   */
  public async cleanupOriginalFiles(): Promise<void> {
    try {
      await fs.unlink(ACTIVE_TASKS_FILE_PATH);
      console.log("Removed original active_tasks.json");
    } catch (error) {
      // File might not exist
    }

    try {
      await fs.unlink(COMPLETED_TASKS_FILE_PATH);
      console.log("Removed original completed_tasks.json");
    } catch (error) {
      // File might not exist
    }
  }

  /**
   * Get migration status
   */
  public async getMigrationStatus(): Promise<{
    hasOldFiles: boolean;
    hasSqliteDatabase: boolean;
    needsMigration: boolean;
  }> {
    const hasOldFiles = await this.isMigrationNeeded();
    const hasSqliteDatabase = this.taskRepository['db'] !== undefined;

    return {
      hasOldFiles,
      hasSqliteDatabase,
      needsMigration: hasOldFiles && hasSqliteDatabase,
    };
  }
}

/**
 * Standalone migration function that can be called from command line
 */
export async function runMigration(): Promise<void> {
  const migration = new MigrationUtility();

  const status = await migration.getMigrationStatus();

  if (!status.needsMigration) {
    if (!status.hasOldFiles) {
      console.log("No old JSON files found. Migration not needed.");
    } else {
      console.log("SQLite database not initialized. Cannot perform migration.");
    }
    return;
  }

  console.log("Old JSON files detected. Starting migration...");

  const result = await migration.performMigration();

  if (result.success) {
    console.log("✅ Migration completed successfully!");
    console.log(`📊 Migrated: ${result.migratedRequests} requests, ${result.migratedTasks} active tasks, ${result.migratedArchivedTasks} archived tasks`);

    const cleanup = process.argv.includes("--cleanup");
    if (cleanup) {
      await migration.cleanupOriginalFiles();
      console.log("🧹 Original files cleaned up.");
    } else {
      console.log("💾 Original files backed up. Use --cleanup flag to remove them.");
    }
  } else {
    console.error("❌ Migration failed with errors:");
    result.errors.forEach(error => console.error(`  • ${error}`));
    process.exit(1);
  }
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration().catch(error => {
    console.error("Fatal migration error:", error);
    process.exit(1);
  });
}
