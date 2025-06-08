# Automatic Task Archiving

## Overview

The MCP AgentTaskHub now automatically archives completed task trees to `completed_tasks.json` without requiring manual intervention. This eliminates the need for agents to explicitly call the `archive_task_tree` tool in most cases.

## How It Works

### Automatic Archiving Triggers

Task trees are automatically archived when:

1. **A task is marked as "done"** (`mark_task_done`)
2. **A task is marked as "failed"** (`mark_task_failed`) AND this causes a parent task to auto-complete
3. **All descendants in the task tree are "done"**

### What Gets Archived

When automatic archiving triggers:

- The **entire task tree** (root task + all descendants) is moved from active tasks to `completed_tasks.json`
- The task tree is removed from the active tasks file
- All task relationships (parent-child, dependencies) are preserved in the archive
- Existing summary files (if any) are linked to the archived tasks

### Key Behavior

- **Only complete task trees are archived** - individual subtasks are never archived by themselves
- **Partial completion doesn't trigger archiving** - all descendants must be in "done" status
- **Failed subtasks don't prevent archiving** - if a parent auto-completes due to all subtasks being terminal (done/failed), and the parent is "done", the tree will be archived

## Examples

### Example 1: Simple Task Tree
```
Parent Task (pending)
├── Subtask A (pending)
└── Subtask B (pending)
```

1. Mark Subtask A as done → No archiving (tree not complete)
2. Mark Subtask B as done → Parent auto-completes → **Entire tree archived automatically**

### Example 2: Nested Task Tree
```
Root Task (pending)
├── Setup (pending)
│   ├── Create files (pending)
│   └── Install deps (pending)
└── Implementation (pending)
```

1. Mark "Create files" as done → No archiving
2. Mark "Install deps" as done → "Setup" auto-completes → No archiving (root still has pending "Implementation")
3. Mark "Implementation" as done → Root auto-completes → **Entire tree archived automatically**

### Example 3: Mixed Success/Failure
```
Parent Task (pending)
├── Subtask A (pending)
└── Subtask B (pending)
```

1. Mark Subtask A as done → No archiving
2. Mark Subtask B as failed → Parent auto-completes as "done" → **Entire tree archived automatically**

## Response Changes

When automatic archiving occurs, the response from `mark_task_done` or `mark_task_failed` includes:

```json
{
  "status": "task_marked_done",
  "message": "Task 'task-1' marked done. Task tree automatically archived (3 tasks).",
  "task": { "id": "task-1", "title": "...", "status": "done" },
  "requestCompleted": false,
  "archivedInfo": {
    "taskTreeArchived": true,
    "rootTaskId": "task-1",
    "archivedTaskCount": 3,
    "message": "Task tree rooted at 'task-1' automatically archived to completed_tasks.json."
  }
}
```

## Manual Control Still Available

The `archive_task_tree` tool remains available for:

- **Explicit control** when you want to archive a specific completed tree
- **Batch operations** or custom workflows
- **Edge cases** where automatic archiving doesn't meet specific needs

## Backward Compatibility

- ✅ **Fully backward compatible** - existing workflows continue to work
- ✅ **No breaking changes** - all existing tools and APIs remain unchanged
- ✅ **Optional behavior** - manual archiving still works as before

## Benefits

1. **Reduced Cognitive Load**: Agents don't need to remember to archive completed tasks
2. **Cleaner Active Task Lists**: Completed work is automatically moved out of the way
3. **Consistent Behavior**: All completed task trees are consistently archived
4. **Improved Performance**: Smaller active task files mean faster operations
5. **Better Organization**: Completed work is automatically organized in the archive

## Configuration

No configuration is required. Automatic archiving is enabled by default and works alongside existing functionality.

## File Locations

- **Active Tasks**: `~/.AgentTaskHub/mcp_task_manager_data/tasks.json`
- **Completed Tasks Archive**: `~/.AgentTaskHub/mcp_task_manager_data/completed_tasks.json`
- **Task Summaries**: `~/.AgentTaskHub/mcp_task_manager_data/completed_task_summaries/`

## Migration Notes

For existing installations:

1. **No migration required** - the feature works immediately upon update
2. **Existing completed tasks** remain in their current location
3. **New completions** will be automatically archived going forward
