# Changelog

All notable changes to this project will be documented in this file.

## [0.4.0] - 2025-06-18

### 🧹 Cleanup & Documentation

**ENHANCEMENT**: Major cleanup release with improved documentation and streamlined codebase.

#### 📚 Documentation Improvements
- **Technical README**: Completely rewritten as technical documentation instead of marketing content
- **Feature Documentation**: Comprehensive listing of all 18 available tools
- **Connection Examples**: All possible MCP client connection configurations provided
- **Architecture Overview**: Detailed technical implementation summary
- **Problem-Solution Mapping**: Clear explanation of problems solved by Meta Mind

#### 🚀 Upcoming Features Preview
- **Advanced Reasoning Engine**: Multi-modal reasoning with Sequential Thinking, Chain of Thought (CoT), and Chain of Density (CoD)
- **Reasoning Transparency**: Complete audit trail of AI decision-making processes
- **Web Management Interface**: Browser-based task management and reasoning visualization
- **Artifact Gallery**: Visual browsing of all generated content and outputs

#### 🧹 Codebase Cleanup
- **Removed Migration Code**: Eliminated all migration-related code and files
- **Removed Obsolete Files**: Cleaned up unused configuration and setup files
- **Streamlined Package**: Reduced published package size and complexity
- **Self-Contained Setup**: Fully automatic initialization with zero manual configuration

#### 🔧 Technical Improvements
- **Simplified Architecture**: Cleaner codebase with removed legacy components
- **Better Organization**: Improved project structure and file organization
- **Enhanced Reliability**: More robust initialization and error handling

## [0.3.0] - 2025-06-17

### 🚀 Major: SQLite Database Backend

**ENHANCEMENT**: Implemented SQLite database backend for improved performance, reliability, and scalability.

#### 🗄️ Database & Storage
- **SQLite Database Backend**: Robust database storage with automatic initialization
- **Repository Pattern**: Clean separation of database operations from business logic
- **Schema Management**: Automatic database initialization and schema creation
- **Enhanced Performance**: Significantly faster task queries and operations
- **Data Integrity**: Improved data consistency and relationship management
- **ACID Transactions**: Data integrity guaranteed with proper transaction management
- **Better Concurrency**: WAL mode SQLite for improved concurrent access
- **Database Indexes**: Optimized query performance with proper indexing

#### 🔄 Architecture Improvements
- **Data Storage**: All data now stored in `~/.meta_mind/tasks.db`
- **Internal Architecture**: Complete refactor using Repository Pattern
- **Memory Usage**: Reduced memory footprint with efficient database operations
- **Error Handling**: Improved error handling with database constraints

#### 🛡️ Security & Reliability
- **Foreign Key Constraints**: Referential integrity enforced at database level
- **Schema Validation**: Database schema ensures data consistency
- **Automatic Rollback**: Failed operations don't corrupt data
- **Data Persistence**: Reliable data storage across sessions

#### 🔧 Technical Details
- Uses `better-sqlite3` for high-performance SQLite operations
- Modular codebase with separate concerns (database, repository, server)
- Type-safe database operations with comprehensive TypeScript interfaces
- Comprehensive test coverage for all database operations

#### 📚 Documentation
- **Implementation Summary**: Detailed technical implementation overview
- **Updated README**: Enhanced technical documentation and setup instructions
- **Example Workflows**: Real-world usage examples and patterns

## [0.2.0] - 2025-06-10

### Added
- **Automatic Task Tree Archiving**: Completed task trees are automatically archived when all descendants are marked as "done"
  - Triggered by `mark_task_done` and `mark_task_failed` operations
  - Preserves all task relationships, metadata, and artifacts
  - Only complete task trees are archived (never individual subtasks)
- New `_autoArchiveTaskTree()` helper method for internal automatic archiving
- Enhanced response objects include `archivedInfo` when automatic archiving occurs
- Comprehensive documentation in `AUTOMATIC_ARCHIVING.md`
- Example workflow documentation in `EXAMPLE_WORKFLOW.md`

### Changed
- `mark_task_done` and `mark_task_failed` responses now include archiving information when applicable
- Package description updated to reflect automatic archiving capability
- README updated with key features section highlighting automatic archiving

### Technical Details
- Auto-archiving preserves backward compatibility - manual `archive_task_tree` tool still works
- No configuration required - feature is enabled by default
- Task trees are only archived when the root task and ALL descendants are "done"
- Failed subtasks don't prevent archiving if parent task completes

## [0.1.0] - 2025-06-10

### Added
- Initial release of Meta Mind MCP Server
- Task planning and management system
- Hierarchical task support with parent-child relationships
- Task dependencies and validation
- Manual task archiving via `archive_task_tree` tool
- Completion summary logging
- Progress tracking and status reporting
- Multiple request handling

#### Core Tools (18 total)
- `request_planning` - Create new requests with task breakdowns
- `get_next_task` - Intelligent next task selection
- `mark_task_done` - Mark tasks as completed with artifact logging
- `mark_task_failed` - Mark tasks as failed with retry strategies
- `update_task` - Update task properties and metadata
- `add_subtask` / `remove_subtask` - Manage hierarchical structures
- `add_dependency` / `remove_dependency` - Manage task relationships
- `validate_dependencies` - Ensure dependency graph validity
- `archive_task_tree` - Manually archive completed trees
- `log_task_completion_summary` - Generate detailed summaries
- `list_requests` - View all active requests
- `open_task_details` - Deep dive into task information
- `delete_task` - Remove tasks and descendants
- `split_task` - Break down complex tasks
- `merge_tasks` - Combine related tasks

#### Infrastructure
- TypeScript implementation with full type safety
- Zod schema validation for all inputs
- MCP protocol compliance with v0.5.0 SDK
- Comprehensive error handling and validation
- Task type specialization for agent routing
- Priority-based task scheduling

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
