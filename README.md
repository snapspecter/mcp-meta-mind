# Meta Mind MCP Server

A sophisticated Model Context Protocol (MCP) server that implements intelligent task management and workflow orchestration with hierarchical task structures, automatic archiving, and comprehensive progress tracking.

## What is Meta Mind MCP Server?

Meta Mind MCP Server is a technical implementation of the Model Context Protocol that provides advanced task management capabilities for AI agents. It serves as a centralized task orchestration system that can be integrated with various MCP clients including Claude Desktop, KiloCode, RooCode, and other compatible systems.

## What It Does

The server provides a comprehensive suite of tools for:

- **Task Planning & Organization**: Creates and manages hierarchical task structures with complex dependencies
- **Workflow Orchestration**: Coordinates task execution across multiple concurrent projects
- **Progress Tracking**: Monitors task completion, generates analytics, and provides real-time status updates  
- **Artifact Management**: Logs and tracks generated files, code, documentation, and other outputs
- **Automatic Archiving**: Intelligently archives completed task trees to maintain clean active workspaces
- **Summary Generation**: Creates detailed markdown summaries of completed work with reasoning and artifacts

## Problems It Solves

### 1. **Task Complexity Management**
Traditional task management systems fail when dealing with complex, interdependent tasks that AI agents need to execute. Meta Mind provides:
- Hierarchical task breakdown with unlimited nesting levels
- Dependency validation with cycle detection
- Intelligent task ordering based on dependencies and priorities

### 2. **Multi-Project Coordination**
AI agents often work on multiple projects simultaneously. Meta Mind addresses this by:
- Isolated task queues for different projects/requests
- Cross-project resource and dependency management
- Intelligent context switching between active projects

### 3. **Progress Visibility**
Without proper tracking, it's difficult to understand what AI agents have accomplished. Meta Mind provides:
- Real-time progress dashboards with hierarchical task views
- Completion analytics and performance metrics
- Detailed artifact logging with full traceability

### 4. **Knowledge Retention**
AI agents often lose context between sessions. Meta Mind maintains:
- Persistent task state across sessions
- Comprehensive artifact and output logging
- Task completion summaries with reasoning documentation

## Core Features

### Task Management
- **18 comprehensive tools** for complete task lifecycle management
- **Hierarchical task structures** with parent-child relationships
- **Smart dependency management** with validation and cycle detection
- **Priority-based scheduling** (High, Medium, Low, Critical)
- **Task type specialization** for agent routing (Code, Debug, Test, Plan, Refactor, Documentation, Research, Generic)

### Data Persistence
- **SQLite backend** for reliable data storage and performance
- **Automatic database initialization** with schema management
- **Artifact tracking** with file path logging and metadata
- **Task completion summaries** stored as markdown files

### Workflow Automation
- **Automatic task archiving** when complete task trees are finished
- **Intelligent next task selection** based on dependencies and priorities
- **Parent task auto-completion** when all children are done
- **Request lifecycle management** with automatic completion detection

### Analytics & Reporting
- **Progress tables** with hierarchical display
- **Request overview dashboards** showing project health
- **Completion metrics** with timeline tracking
- **Status reporting** for bottleneck identification

## Available Tools

| Tool | Purpose |
|------|---------|
| `request_planning` | Create new project requests with task breakdowns |
| `get_next_task` | Intelligent next task selection based on priorities and dependencies |
| `mark_task_done` | Complete tasks with artifact logging and automatic archiving |
| `mark_task_failed` | Handle task failures with retry strategies |
| `open_task_details` | Deep dive into specific task information |
| `list_requests` | Overview of all active projects and their status |
| `add_tasks_to_request` | Dynamically add tasks to existing projects |
| `update_task` | Modify task properties, priorities, and metadata |
| `add_dependency` / `remove_dependency` | Manage task relationships |
| `validate_dependencies` | Ensure dependency graphs are valid |
| `delete_task` | Remove tasks and their descendants |
| `add_subtask` / `remove_subtask` | Manage hierarchical task structures |
| `archive_task_tree` | Manual archiving of completed task trees |
| `log_task_completion_summary` | Generate detailed markdown summaries |
| `split_task` | Break down complex tasks into manageable subtasks |
| `merge_tasks` | Combine related tasks for better organization |

## Installation & Setup

### Prerequisites
- Node.js 18+
- Compatible MCP client (Claude Desktop, KiloCode, RooCode, etc.)

### Installation
```bash
npm install -g @snapspecter/mcp-meta-mind
```

### Data Directory Setup
```bash
mkdir -p ~/.meta_mind/mcp_task_manager_data
```

## Configuration

### MCP Client Connection Strings

#### Global Installation (Recommended)
```json
{
  "mcpServers": {
    "meta-mind": {
      "command": "npx",
      "args": ["-y", "@snapspecter/mcp-meta-mind"]
    }
  }
}
```

#### Direct Executable Path
```json
{
  "mcpServers": {
    "meta-mind": {
      "command": "/path/to/mcp-meta-mind/dist/index.js"
    }
  }
}
```

#### Development Setup (Local Build)
```json
{
  "mcpServers": {
    "meta-mind-dev": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/mcp-meta-mind"
    }
  }
}
```

#### Development Setup (TypeScript)
```json
{
  "mcpServers": {
    "meta-mind-dev": {
      "command": "tsx",
      "args": ["./index.ts"],
      "cwd": "/absolute/path/to/mcp-meta-mind"
    }
  }
}
```

## Technical Architecture

### Database Schema
- **SQLite backend** with automatic schema initialization
- **Tasks table** storing hierarchical task data with relationships
- **Requests table** managing project-level information
- **Artifacts table** tracking generated files and outputs

### File Structure
```
~/.meta_mind/
├── tasks.db                   # SQLite database
└── completed_task_summaries/  # Generated task summary files
```

### Task States
- `pending`: Ready to be worked on
- `active`: Currently being executed
- `done`: Successfully completed
- `failed`: Failed with retry options
- `requires-clarification`: Needs additional information

## Development

### Local Development Setup
```bash
# Clone repository
git clone https://github.com/snapspecter/mcp-meta-mind.git
cd mcp-meta-mind

# Install dependencies
npm install

# Build project
npm run build

# Start development server
npm run start
```

### Building for Production
```bash
npm run build
```

## Upcoming Features (Next Release)

### Advanced Reasoning Engine
The next major release will introduce sophisticated AI reasoning capabilities that enhance decision-making transparency and task execution quality.

#### Multi-Modal Reasoning
- **Sequential Thinking**: Step-by-step logical progression through complex problems
- **Chain of Thought (CoT)**: Detailed reasoning chains with intermediate steps and validation
- **Chain of Density (CoD)**: Iterative refinement of solutions with increasing detail and accuracy

#### Reasoning Transparency & Audit Trail
AI agents will have complete reasoning transparency with comprehensive logging systems that capture:
- **Decision Point Analysis**: Why specific approaches were chosen over alternatives
- **Problem Decomposition Logic**: How complex tasks were broken down into manageable components  
- **Dependency Resolution Reasoning**: The logic behind task ordering and dependency management
- **Priority Assessment Rationale**: Detailed explanations for task prioritization decisions
- **Failure Analysis**: Root cause analysis and learning from failed attempts

This reasoning audit trail enables:
- **Debugging AI Decision Making**: Understand exactly why an agent made specific choices
- **Performance Optimization**: Identify patterns in successful vs. unsuccessful reasoning approaches
- **Knowledge Transfer**: Reuse successful reasoning patterns across similar problems
- **Continuous Improvement**: Refine agent behavior based on reasoning outcome analysis

#### Web-Based Management Interface
A lightweight web server will provide comprehensive task management capabilities:

**Dashboard Features**:
- **Interactive Task Browser**: Navigate hierarchical task structures with expandable trees
- **Real-Time Progress Visualization**: Dynamic progress bars, completion charts, and timeline views
- **Task Editor**: Create, modify, and delete tasks with rich form interfaces
- **Dependency Graph Visualization**: Interactive network diagrams showing task relationships

**Reasoning Insights**:
- **Decision Timeline**: Step-by-step visualization of AI reasoning processes
- **Alternative Path Analysis**: View other approaches considered but not taken
- **Reasoning Quality Scores**: Metrics on reasoning depth, accuracy, and completeness
- **Pattern Recognition**: Identify common reasoning patterns and success factors

**Artifact Management**:
- **Generated Content Gallery**: Browse all files, code, and documentation created by AI agents
- **Artifact Relationships**: See how generated content relates to specific tasks and reasoning steps
- **Version Control Integration**: Track changes and evolution of generated artifacts
- **Export & Sharing**: Download artifacts and reasoning summaries for external use

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Contributing

Contributions are welcome! Please submit pull requests with appropriate tests and documentation.

---

**Meta Mind MCP Server** - Advanced task orchestration for intelligent AI agents.