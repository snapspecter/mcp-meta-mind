import { z } from "zod";
import { TaskStatus, TaskPriority, TaskType } from "./interfaces.js";

//
export const TaskPriorityEnum = z.enum([
  TaskPriority.High,
  TaskPriority.Medium,
  TaskPriority.Low,
  TaskPriority.Critical,
]);

export const TaskTypeEnum = z.enum([
  TaskType.Code,
  TaskType.Debug,
  TaskType.Test,
  TaskType.Plan,
  TaskType.Refactor,
  TaskType.Documentation,
  TaskType.Research,
  TaskType.Generic,
]);

export const SettableTaskStatusEnum = z.enum([
  TaskStatus.Pending,
  TaskStatus.Active,
  TaskStatus.Done,
  TaskStatus.Failed,
  TaskStatus.RequiresClarification,
]);

export const BaseTaskDefinitionSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  priority: TaskPriorityEnum.optional(),
  type: TaskTypeEnum.optional(),
  dependsOn: z.array(z.string()).optional(),
  artifactsGenerated: z.array(z.string()).optional(),
  environmentContext: z.string().optional(),
});

export const RequestPlanningSchema = z.object({
  originalRequest: z.string().min(1),
  splitDetails: z.string().optional(),
  tasks: z.array(BaseTaskDefinitionSchema).min(1),
});

export const GetNextTaskSchema = z.object({
  requestId: z.string(),
});

export const MarkTaskDoneSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  completedDetails: z.string().optional(),
  artifactsGenerated: z.array(z.string()).optional(),
});

export const MarkTaskFailedSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  reason: z.string().optional(),
  suggestedRetryStrategy: z.string().optional(),
});

export const OpenTaskDetailsSchema = z.object({
  taskId: z.string(),
});

export const ListRequestsSchema = z.object({});

export const AddTasksToRequestSchema = z.object({
  requestId: z.string(),
  tasks: z.array(BaseTaskDefinitionSchema).min(1),
});

export const UpdateTaskSchema = z.object({
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

export const AddDependencySchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  dependsOnTaskId: z.string(),
});

export const RemoveDependencySchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  dependsOnTaskId: z.string(),
});

export const ValidateDependenciesSchema = z.object({
  requestId: z.string(),
});

export const DeleteTaskSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
});

export const AddSubtaskSchema = z.object({
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

export const RemoveSubtaskSchema = z.object({
  requestId: z.string(),
  subtaskId: z.string(),
  parentTaskId: z.string().optional(),
});

export const ArchiveTaskTreeSchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
});

export const LogTaskCompletionSummarySchema = z.object({
  requestId: z.string(),
  taskId: z.string(),
  summaryMarkdownContent: z.string().min(1),
  artifactsGenerated: z.array(z.string()).optional(),
});

export const SplitTaskSchema = z.object({
  requestId: z.string(),
  taskIdToSplit: z.string(),
  newSubtaskDefinitions: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string(),
        priority: TaskPriorityEnum.optional(),
        type: TaskTypeEnum.optional(),
        dependsOn: z.array(z.string()).optional(),
        artifactsGenerated: z.array(z.string()).optional(),
        environmentContext: z.string().optional(),
      }),
    )
    .min(1),
});

export const MergeTasksSchema = z.object({
  requestId: z.string(),
  primaryTaskId: z.string(),
  taskIdsToMerge: z.array(z.string()).min(1),
  newTitle: z.string().min(1).optional(),
  newDescription: z.string().optional(),
  newPriority: TaskPriorityEnum.optional(),
  newType: TaskTypeEnum.optional(),
  newEnvironmentContext: z.string().optional(),
  newArtifactsGenerated: z.array(z.string()).optional(),
});
