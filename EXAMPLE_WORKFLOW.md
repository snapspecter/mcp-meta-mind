# Example Workflow: Automatic Task Archiving

This example demonstrates how the automatic archiving feature works when building a simple web application.

## Scenario: Building a Todo App

Let's walk through a complete workflow that shows automatic task archiving in action.

### Step 1: Initial Request Planning

**Agent Action:**
```json
{
  "tool": "request_planning",
  "params": {
    "originalRequest": "Build a simple todo app with React and Node.js",
    "tasks": [
      {
        "title": "Setup project structure",
        "description": "Initialize the project with necessary folders and configuration files",
        "priority": "high",
        "type": "code"
      },
      {
        "title": "Build backend API",
        "description": "Create REST API for todo operations",
        "priority": "high",
        "type": "code"
      },
      {
        "title": "Build frontend UI",
        "description": "Create React components for todo interface",
        "priority": "medium",
        "type": "code"
      }
    ]
  }
}
```

**Response:**
```json
{
  "status": "planned",
  "requestId": "req-1",
  "totalTasks": 3,
  "tasks": [
    {"id": "task-1", "title": "Setup project structure", "priority": "high", "type": "code"},
    {"id": "task-2", "title": "Build backend API", "priority": "high", "type": "code"},
    {"id": "task-3", "title": "Build frontend UI", "priority": "medium", "type": "code"}
  ]
}
```

### Step 2: Break Down Setup Task

**Agent Action:**
```json
{
  "tool": "add_subtask",
  "params": {
    "requestId": "req-1",
    "parentTaskId": "task-1",
    "subtaskTitle": "Initialize package.json",
    "subtaskDescription": "Create package.json with dependencies"
  }
}
```

**Agent Action:**
```json
{
  "tool": "add_subtask", 
  "params": {
    "requestId": "req-1",
    "parentTaskId": "task-1",
    "subtaskTitle": "Setup folder structure",
    "subtaskDescription": "Create src/, public/, and server/ directories"
  }
}
```

### Step 3: Complete Subtasks

**Agent Action:**
```json
{
  "tool": "mark_task_done",
  "params": {
    "requestId": "req-1",
    "taskId": "task-4",
    "completedDetails": "Created package.json with React, Express, and dev dependencies",
    "artifactsGenerated": ["package.json"]
  }
}
```

**Response:**
```json
{
  "status": "task_marked_done",
  "message": "Task 'task-4' marked done.",
  "task": {"id": "task-4", "title": "Initialize package.json", "status": "done"},
  "requestCompleted": false
}
```

**Note:** No archiving yet - parent task still has incomplete subtasks.

**Agent Action:**
```json
{
  "tool": "mark_task_done",
  "params": {
    "requestId": "req-1", 
    "taskId": "task-5",
    "completedDetails": "Created project directory structure",
    "artifactsGenerated": ["src/", "public/", "server/"]
  }
}
```

### Step 4: Complete Parent Task (Triggers Auto-Archive!)

**Agent Action:**
```json
{
  "tool": "mark_task_done",
  "params": {
    "requestId": "req-1",
    "taskId": "task-1",
    "completedDetails": "Project structure setup completed successfully",
    "artifactsGenerated": ["package.json", "src/", "public/", "server/", "README.md"]
  }
}
```

**Response:**
```json
{
  "status": "task_marked_done",
  "message": "Task 'task-1' marked done. Task tree automatically archived (3 tasks).",
  "task": {"id": "task-1", "title": "Setup project structure", "status": "done"},
  "requestCompleted": false,
  "archivedInfo": {
    "taskTreeArchived": true,
    "rootTaskId": "task-1",
    "archivedTaskCount": 3,
    "message": "Task tree rooted at 'task-1' automatically archived to completed_tasks.json."
  }
}
```

**🎉 Automatic Archiving Occurred!**

The entire task tree (task-1 + its 2 subtasks) was automatically moved to `completed_tasks.json`.

### Step 5: Continue with Remaining Tasks

**Agent Action:**
```json
{
  "tool": "get_next_task",
  "params": {"requestId": "req-1"}
}
```

**Response:**
```json
{
  "status": "next_task",
  "task": {
    "id": "task-2",
    "title": "Build backend API",
    "priority": "high",
    "type": "code",
    "status": "active"
  }
}
```

### Step 6: What's in the Files

**Active Tasks (tasks.json):**
```json
{
  "requests": [{
    "requestId": "req-1",
    "originalRequest": "Build a simple todo app with React and Node.js",
    "tasks": [
      {
        "id": "task-2",
        "title": "Build backend API",
        "status": "active"
      },
      {
        "id": "task-3", 
        "title": "Build frontend UI",
        "status": "pending"
      }
    ],
    "completed": false
  }]
}
```

**Completed Tasks Archive (completed_tasks.json):**
```json
{
  "archivedTaskBundles": [{
    "originalRequestId": "req-1",
    "originalRequestText": "Build a simple todo app with React and Node.js",
    "archivedRootTask": {
      "id": "task-1",
      "title": "Setup project structure",
      "status": "done",
      "completedDetails": "Project structure setup completed successfully",
      "artifactsGenerated": ["package.json", "src/", "public/", "server/", "README.md"]
    },
    "archivedSubtasks": [
      {
        "id": "task-4",
        "title": "Initialize package.json", 
        "status": "done",
        "parentId": "task-1"
      },
      {
        "id": "task-5",
        "title": "Setup folder structure",
        "status": "done", 
        "parentId": "task-1"
      }
    ],
    "archivedAt": "2024-01-15T10:30:00.000Z"
  }]
}
```

## Key Benefits Demonstrated

1. **Automatic Cleanup**: Completed work is automatically moved out of active tasks
2. **No Manual Intervention**: Agent doesn't need to remember to call `archive_task_tree`
3. **Complete Preservation**: All task details, relationships, and artifacts are preserved
4. **Cleaner Workflow**: Active task list stays focused on remaining work
5. **Audit Trail**: Completed work is properly archived with timestamps

## Comparison: Before vs After

### Before (Manual Archiving)
```
1. Mark subtask A done → No action needed
2. Mark subtask B done → No action needed  
3. Mark parent done → Agent sees suggestion to archive
4. Agent calls archive_task_tree → Tasks moved to archive
```

### After (Automatic Archiving)
```
1. Mark subtask A done → No action needed
2. Mark subtask B done → No action needed
3. Mark parent done → ✨ AUTOMATICALLY ARCHIVED ✨
```

## Edge Cases Handled

- **Partial Completion**: Only individual subtasks done → No premature archiving
- **Mixed Success/Failure**: Some subtasks fail but parent completes → Still archives
- **Nested Hierarchies**: Deep task trees → Only archives when root is complete
- **Dependencies**: Tasks with dependencies → Respects completion order

The automatic archiving feature makes task management seamless while preserving all the power and flexibility of the original system.