#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { TaskManagerServer } from "./src/taskManagerServer.js";
import { ALL_TOOLS } from "./src/tools.js";
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
} from "./src/schemas.js";

// Create MCP server
const server = new Server(
  {
    name: "mcp-meta-mind",
    version: "0.4.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Create task manager instance
const taskManagerServer = new TaskManagerServer();

// Set up tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: ALL_TOOLS,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "request_planning": {
        const params = RequestPlanningSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.requestPlanning(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "get_next_task": {
        const params = GetNextTaskSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.getNextTask(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "mark_task_done": {
        const params = MarkTaskDoneSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.markTaskDone(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "mark_task_failed": {
        const params = MarkTaskFailedSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.markTaskFailed(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "open_task_details": {
        const params = OpenTaskDetailsSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.openTaskDetails(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "list_requests": {
        const params = ListRequestsSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.listRequests(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "add_tasks_to_request": {
        const params = AddTasksToRequestSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.addTasksToRequest(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "update_task": {
        const params = UpdateTaskSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.updateTask(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "add_dependency": {
        const params = AddDependencySchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.addDependency(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "remove_dependency": {
        const params = RemoveDependencySchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.removeDependency(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "validate_dependencies": {
        const params = ValidateDependenciesSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.validateDependencies(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "delete_task": {
        const params = DeleteTaskSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.deleteTask(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "add_subtask": {
        const params = AddSubtaskSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.addSubtask(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "remove_subtask": {
        const params = RemoveSubtaskSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.removeSubtask(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "archive_task_tree": {
        const params = ArchiveTaskTreeSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.archiveTaskTree(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "log_task_completion_summary": {
        const params = LogTaskCompletionSummarySchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.logTaskCompletionSummary(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "split_task": {
        const params = SplitTaskSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.splitTask(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      case "merge_tasks": {
        const params = MergeTasksSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await taskManagerServer.mergeTasks(params),
                null,
                2,
              ),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Error executing tool ${name}: ${error.message}`,
      );
    }
    throw error;
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await taskManagerServer.init();
  await server.connect(transport);
  console.error("Meta Mind MCP Server running with SQLite backend");
}

runServer().catch((error) => {
  console.error("Fatal error in server:", error);
  process.exit(1);
});
