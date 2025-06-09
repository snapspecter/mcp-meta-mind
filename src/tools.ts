import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
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

export const REQUEST_PLANNING_TOOL: Tool = {
  name: "request_planning",
  description: "Register a new user request and plan its tasks.",
  inputSchema: zodToJsonSchema(RequestPlanningSchema) as any,
};

export const GET_NEXT_TASK_TOOL: Tool = {
  name: "get_next_task",
  description: "Get the next actionable task for a request.",
  inputSchema: zodToJsonSchema(GetNextTaskSchema) as any,
};

export const MARK_TASK_DONE_TOOL: Tool = {
  name: "mark_task_done",
  description: "Mark a task as done. Can include artifacts generated.",
  inputSchema: zodToJsonSchema(MarkTaskDoneSchema) as any,
};

export const MARK_TASK_FAILED_TOOL: Tool = {
  name: "mark_task_failed",
  description: "Mark a task as failed. Can include a suggested retry strategy.",
  inputSchema: zodToJsonSchema(MarkTaskFailedSchema) as any,
};

export const OPEN_TASK_DETAILS_TOOL: Tool = {
  name: "open_task_details",
  description: "Get details of a specific task.",
  inputSchema: zodToJsonSchema(OpenTaskDetailsSchema) as any,
};

export const LIST_REQUESTS_TOOL: Tool = {
  name: "list_requests",
  description: "List all active requests.",
  inputSchema: zodToJsonSchema(ListRequestsSchema) as any,
};

export const ADD_TASKS_TO_REQUEST_TOOL: Tool = {
  name: "add_tasks_to_request",
  description: "Add new tasks to an existing request.",
  inputSchema: zodToJsonSchema(AddTasksToRequestSchema) as any,
};

export const UPDATE_TASK_TOOL: Tool = {
  name: "update_task",
  description:
    "Update an existing task's details (title, desc, priority, type, status, artifacts, envContext).",
  inputSchema: zodToJsonSchema(UpdateTaskSchema) as any,
};

export const ADD_DEPENDENCY_TOOL: Tool = {
  name: "add_dependency",
  description: "Add a dependency between two tasks.",
  inputSchema: zodToJsonSchema(AddDependencySchema) as any,
};

export const REMOVE_DEPENDENCY_TOOL: Tool = {
  name: "remove_dependency",
  description: "Remove a dependency between two tasks.",
  inputSchema: zodToJsonSchema(RemoveDependencySchema) as any,
};

export const VALIDATE_DEPENDENCIES_TOOL: Tool = {
  name: "validate_dependencies",
  description: "Validate task dependencies within a request.",
  inputSchema: zodToJsonSchema(ValidateDependenciesSchema) as any,
};

export const DELETE_TASK_TOOL: Tool = {
  name: "delete_task",
  description:
    "Permanently delete a task and its descendants from active tasks.",
  inputSchema: zodToJsonSchema(DeleteTaskSchema) as any,
};

export const ADD_SUBTASK_TOOL: Tool = {
  name: "add_subtask",
  description: "Add a subtask to a parent task.",
  inputSchema: zodToJsonSchema(AddSubtaskSchema) as any,
};

export const REMOVE_SUBTASK_TOOL: Tool = {
  name: "remove_subtask",
  description:
    "Permanently delete a subtask and its descendants from active tasks.",
  inputSchema: zodToJsonSchema(RemoveSubtaskSchema) as any,
};

export const ARCHIVE_TASK_TREE_TOOL: Tool = {
  name: "archive_task_tree",
  description:
    "Archives a fully completed task tree (root task and all descendants must be 'done') to completed_tasks.json.",
  inputSchema: zodToJsonSchema(ArchiveTaskTreeSchema) as any,
};

export const LOG_TASK_COMPLETION_SUMMARY_TOOL: Tool = {
  name: "log_task_completion_summary",
  description:
    "Logs a completion summary for a task with relevant details and achievements.",
  inputSchema: zodToJsonSchema(LogTaskCompletionSummarySchema) as any,
};

export const SPLIT_TASK_TOOL: Tool = {
  name: "split_task",
  description:
    "Splits a task into multiple new subtasks. The original task becomes a container.",
  inputSchema: zodToJsonSchema(SplitTaskSchema) as any,
};

export const MERGE_TASKS_TOOL: Tool = {
  name: "merge_tasks",
  description:
    "Merges multiple tasks into a primary task, consolidating details and dependencies.",
  inputSchema: zodToJsonSchema(MergeTasksSchema) as any,
};

// Export all tools as an array for easy registration
export const ALL_TOOLS: Tool[] = [
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
];
