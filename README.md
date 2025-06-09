# MCP AgentTaskHub

A sophisticated Model Context Protocol server for advanced task management and workflow orchestration. Built for KiloCode, it will work with Claude Desktop, RooCode and other MCP clients, this system provides intelligent task planning, hierarchical organization, automatic archiving, task summary generation and comprehensive progress tracking.

## 📋 Important: SQLite Migration (v0.3.0+)

**Starting with version 0.3.0, mcp-AgentTaskHub has migrated from JSON files to a SQLite database backend for improved performance and reliability.**

- **Automatic Migration**: First run will automatically detect and migrate your existing JSON data
- **Backup Safety**: Original files are backed up to `~/.mcp_agent_task_hub/backup/`
- **Manual Migration**: Run `npm run migrate` if needed
- **See**: [SQLite Migration Guide](SQLITE_MIGRATION.md) for detailed information

If you're upgrading from a previous version, your data will be safely migrated on first startup.

## 🚀 Key Features

### ✨ **Intelligent Task Management**
- **Automatic Task Archiving**: Completed task trees are automatically moved to archive when all descendants are done
- **Hierarchical Task Structure**: Support for complex parent-child relationships and nested subtasks
- **Smart Task Dependencies**: Dependency validation with cycle detection and resolution ordering
- **Multi-Request Handling**: Manage multiple concurrent projects with isolated task queues

### 🎯 **Advanced Task Features**
- **Rich Task Types**: Specialized types (Code, Debug, Test, Plan, Refactor, Documentation, Research, Generic) for agent specialization
- **Refined Priority System**: High/Medium/Low priorities for intelligent task scheduling
- **Artifact Logging**: Track generated files, code, documentation, and other outputs
- **Environment Context**: Maintain context across related tasks
- **Task Summary Generation**: Automatic markdown summaries for completed work

### 📊 **Progress & Analytics**
- **Visual Progress Tables**: Real-time status tracking with hierarchical display
- **Request Overview**: Comprehensive dashboards for all active projects
- **Completion Analytics**: Detailed metrics on task completion and timelines
- **Status Reporting**: Clear visibility into project health and bottlenecks

### 🔄 **Workflow Automation**
- **Automatic State Management**: Tasks auto-transition based on dependencies and completion
- **Smart Parent-Child Logic**: Parent tasks auto-complete when all children are done
- **Intelligent Next Task Selection**: Priority-based and dependency-aware task queuing
- **Request Lifecycle Management**: Automatic request completion detection

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- KiloCode, RooCode, Claude Desktop, etc.

### Installation

```bash
npm install -g @snapspecter/mcp-AgentTaskHub
```

### Configuration

1. **Add server to your configuration**
-  **Add MCP Server Configuration**:
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

2. **Create Data Directory**:
```bash
mkdir -p ~/.AgentTaskHub/mcp_task_manager_data
```

f you encounter issues, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

## 🛠️ Core Tools & Capabilities

### Planning & Organization
- **`request_planning`**: Create new project requests with task breakdowns
- **`add_tasks_to_request`**: Dynamically add tasks to existing projects
- **`add_subtask`**: Create hierarchical task structures
- **`update_task`**: Modify task properties, priorities, and metadata

### Execution & Progress
- **`get_next_task`**: Intelligent next task selection based on priorities and dependencies
- **`mark_task_done`**: Complete tasks with artifact logging and automatic archiving
- **`mark_task_failed`**: Handle task failures with retry strategies
- **`list_requests`**: Overview of all active projects and their status

### Advanced Management
- **`add_dependency`** / **`remove_dependency`**: Manage task relationships
- **`validate_dependencies`**: Ensure dependency graphs are valid
- **`archive_task_tree`**: Manual archiving of completed task trees (also automatic)
- **`log_task_completion_summary`**: Generate detailed markdown summaries
- **`open_task_details`**: Deep dive into specific task information

## 📚 Documentation

- **[Automatic Archiving Guide](./AUTOMATIC_ARCHIVING.md)**: Complete guide to automatic task archiving
- **[Example Workflows](./EXAMPLE_WORKFLOW.md)**: Real-world usage examples and patterns
- **[Changelog](./CHANGELOG.md)**: Version history and feature updates
- **[Troubleshooting](./TROUBLESHOOTING.md)**: Common issues and solutions

## 🔮 Upcoming Features

We're continuously improving MCP AgentTaskHub with exciting new capabilities:

- **`split_task` Tool**: Intelligently break down complex tasks into manageable subtasks
- **`merge_tasks` Tool**: Combine related tasks for better organization and efficiency
- **Enhanced Agent Specialization**: Improved task routing based on agent capabilities
- **Advanced Analytics Dashboard**: Comprehensive project metrics and insights
- **Template System**: Pre-built task templates for common workflows
- **Integration APIs**: Connect with external project management tools

## 🏗️ Development Setup

### Local Development

```bash
# Clone the repository
git clone https://github.com/snapspecter/mcp-AgentTaskHub.git
cd mcp-AgentTaskHub

# Install dependencies
npm install

# Start development server
npm run start

# Build for production
npm run build
```

### Development Configuration

Create a development configuration in your client:

```json
{
  "mcpServers": {
    "taskmanager-dev": {
      "command": "tsx",
      "args": ["./index.ts"],
      "cwd": "/absolute/path/to/mcp-AgentTaskHub"
    }
  }
}
```

## 📁 Project Structure

```
~/dev/countradar/mcp_task_manager_data/
├── tasks.json                 # Active tasks and requests
├── completed_tasks.json       # Archived completed task trees
└── completed_task_summaries/  # Generated task summary files
```

## 🎯 Task Types & Priorities

### Task Types (Optimized for Agent Specialization)
- **Code**: Implementation, coding, development work
- **Debug**: Bug fixes, troubleshooting, issue resolution
- **Test**: Testing, validation, quality assurance
- **Plan**: Planning, architecture, design work
- **Refactor**: Code improvement, optimization, cleanup
- **Documentation**: Writing docs, comments, guides
- **Research**: Investigation, analysis, learning
- **Generic**: General tasks not fitting other categories

### Priority Levels
- **High**: Critical path items, blockers, urgent work
- **Medium**: Important but not urgent, standard workflow items
- **Low**: Nice-to-have, optimization, future enhancements

## 📊 Example Usage

### Creating a Complex Project
```json
{
  "tool": "request_planning",
  "params": {
    "originalRequest": "Build a full-stack e-commerce application",
    "tasks": [
      {
        "title": "Database Design",
        "description": "Design and implement the database schema",
        "priority": "high",
        "type": "plan"
      },
      {
        "title": "API Development",
        "description": "Build REST API endpoints",
        "priority": "high",
        "type": "code",
        "dependsOn": ["task-1"]
      },
      {
        "title": "Frontend Implementation",
        "description": "Create React frontend components",
        "priority": "medium",
        "type": "code"
      }
    ]
  }
}
```

### Task Completion with Artifacts
```json
{
  "tool": "mark_task_done",
  "params": {
    "requestId": "req-1",
    "taskId": "task-1",
    "completedDetails": "Database schema implemented with user authentication tables",
    "artifactsGenerated": [
      "schema.sql",
      "migration_001_users.sql",
      "database_diagram.png"
    ]
  }
}
```

## 🙏 Acknowledgments

This project was inspired by [BennyDaBall930/sub_TaskManager](https://github.com/BennyDaBall930/sub_TaskManager). It's been refactored and optimized, and I enhanced the original concept to create a comprehensive task management solution with advanced features like automatic archiving, hierarchical task structures, intelligent dependency management, task summary generationand agent specialization capabilities.

## 📝 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🤝 Contributing

We welcome contributions! Submit a pull request!

---

**MCP AgentTaskHub** - Empowering intelligent agents with sophisticated task management capabilities.
