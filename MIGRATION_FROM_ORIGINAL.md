# Migration Guide: From Original sub_TaskManager

This guide helps you migrate from the original [BennyDaBall930/sub_TaskManager](https://github.com/BennyDaBall930/sub_TaskManager) to the enhanced MCP AgentTaskHub.

## What's Changed

### Major Enhancements
- **Automatic Task Archiving**: Completed tasks now automatically move to archive
- **Hierarchical Task Structure**: Full parent-child relationships with subtasks
- **Advanced Dependencies**: Dependency validation with cycle detection
- **Rich Task Types**: Specialized task types for different agent roles
- **Artifact Logging**: Track generated files and outputs
- **Multi-Request Support**: Handle multiple concurrent projects
- **Enhanced Progress Tracking**: Visual tables and comprehensive status reports

### API Changes

#### Old API Structure
```json
{
  "action": "plan|execute|complete",
  "tasks": ["string array"],
  "taskId": "task-id",
  "getNext": boolean
}
```

#### New API Structure
```json
{
  "tool": "request_planning",
  "params": {
    "originalRequest": "description",
    "tasks": [
      {
        "title": "Task Title",
        "description": "Detailed description",
        "priority": "high|medium|low",
        "type": "code|debug|test|plan|refactor|documentation|research|generic"
      }
    ]
  }
}
```

## Migration Steps

### 1. Update Installation

**Old:**
```bash
# Clone original repo
git clone https://github.com/BennyDaBall930/sub_TaskManager.git
```

**New:**
```bash
# Install via npm
npm install -g @snapspecter/mcp-AgentTaskHub

# Or clone enhanced version
git clone https://github.com/your-username/mcp-AgentTaskHub.git
```

### 2. Update Configuration

**Old Configuration:**
```json
{
  "tools": {
    "taskmanager": {
      "command": "node",
      "args": ["path/to/sub_TaskManager/index.js"]
    }
  }
}
```

**New Configuration:**
```json
{
  "mcpServers": {
    "taskmanager": {
      "command": "npx",
      "args": ["-y", "@snapspecter/mcp-AgentTaskHub"]
    }
  }
}
```

### 3. Update Data Directory

**Old:** Tasks stored in working directory or temp files

**New:** Organized data structure
```bash
mkdir -p ~/dev/countradar/mcp_task_manager_data
```

Data files:
- `tasks.json` - Active tasks and requests
- `completed_tasks.json` - Archived completed work
- `completed_task_summaries/` - Generated summary files

### 4. Update Usage Patterns

#### Creating Tasks

**Old Approach:**
```json
{
  "action": "plan",
  "tasks": [
    "Setup project structure",
    "Implement authentication",
    "Build frontend"
  ]
}
```

**New Approach:**
```json
{
  "tool": "request_planning",
  "params": {
    "originalRequest": "Build web application with authentication",
    "tasks": [
      {
        "title": "Setup project structure",
        "description": "Initialize project with proper folder structure",
        "priority": "high",
        "type": "code"
      },
      {
        "title": "Implement authentication",
        "description": "Add user login and registration",
        "priority": "high",
        "type": "code"
      },
      {
        "title": "Build frontend",
        "description": "Create React components for UI",
        "priority": "medium",
        "type": "code"
      }
    ]
  }
}
```

#### Getting Next Task

**Old:**
```json
{
  "action": "execute",
  "getNext": true
}
```

**New:**
```json
{
  "tool": "get_next_task",
  "params": {
    "requestId": "req-1"
  }
}
```

#### Completing Tasks

**Old:**
```json
{
  "action": "complete",
  "taskId": "task-123"
}
```

**New:**
```json
{
  "tool": "mark_task_done",
  "params": {
    "requestId": "req-1",
    "taskId": "task-123",
    "completedDetails": "Successfully implemented authentication system",
    "artifactsGenerated": ["auth.js", "login.html", "user-model.js"]
  }
}
```

## New Capabilities

### 1. Hierarchical Tasks
```json
{
  "tool": "add_subtask",
  "params": {
    "requestId": "req-1",
    "parentTaskId": "task-1",
    "subtaskTitle": "Create database schema",
    "subtaskDescription": "Design user and session tables"
  }
}
```

### 2. Task Dependencies
```json
{
  "tool": "add_dependency",
  "params": {
    "requestId": "req-1",
    "taskId": "task-2",
    "dependsOnTaskId": "task-1"
  }
}
```

### 3. Task Summary Generation
```json
{
  "tool": "log_task_completion_summary",
  "params": {
    "requestId": "req-1",
    "taskId": "task-1",
    "summaryMarkdownContent": "# Authentication Implementation\n\nCompleted user authentication system with JWT tokens..."
  }
}
```

### 4. Automatic Archiving
- No manual intervention needed
- Completed task trees automatically move to archive
- Preserves all relationships and metadata

## Benefits of Migration

### Enhanced Productivity
- **Automatic cleanup**: Completed work moves out of active view
- **Better organization**: Hierarchical structure for complex projects
- **Intelligent scheduling**: Priority and dependency-based task ordering

### Improved Tracking
- **Rich metadata**: Track types, priorities, artifacts, and context
- **Visual progress**: Comprehensive status tables and reports
- **Audit trail**: Complete history of work with summaries

### Agent Specialization
- **Task types**: Route specific work to specialized agents
- **Context preservation**: Maintain environment and artifact information
- **Skill-based assignment**: Match tasks to agent capabilities

## Troubleshooting Migration

### Common Issues

1. **Data Directory Not Found**
   ```bash
   mkdir -p ~/dev/countradar/mcp_task_manager_data
   ```

2. **Old Tool Names**
   - Update from `action` parameter to `tool` names
   - Use specific tools like `request_planning` instead of generic actions

3. **Configuration Format**
   - Use `mcpServers` instead of `tools` in Claude Desktop config
   - Update command and args for new package

4. **Task Structure**
   - Convert string arrays to object arrays with title/description
   - Add priority and type fields for better organization

### Getting Help

- Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues
- Review [EXAMPLE_WORKFLOW.md](./EXAMPLE_WORKFLOW.md) for usage patterns
- See [AUTOMATIC_ARCHIVING.md](./AUTOMATIC_ARCHIVING.md) for archiving details

## Backward Compatibility

While the API has evolved significantly, the core concepts remain:
- Task planning and execution workflow
- Queue-based task management
- Completion tracking and feedback

The new system provides much more power and flexibility while maintaining the simplicity of the original design.

## Next Steps

1. **Install** the new package
2. **Update** your Claude Desktop configuration
3. **Test** with a simple request to ensure everything works
4. **Explore** new features like hierarchical tasks and dependencies
5. **Enjoy** the enhanced productivity and automatic management features!

The migration effort is minimal, but the benefits are substantial. Welcome to the enhanced MCP AgentTaskHub experience!