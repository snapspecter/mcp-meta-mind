# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2024-12-19

### 🚀 Major: SQLite Database Migration

**BREAKING CHANGE**: Migrated from JSON file storage to SQLite database backend for improved performance, reliability, and scalability.

#### ✨ Added
- **SQLite Database Backend**: Complete migration from JSON files to SQLite database
- **Repository Pattern**: Clean separation of database operations from business logic
- **Automatic Migration**: Seamless upgrade from v0.2.x with automatic data migration
- **Migration Tools**: Standalone migration scripts and CLI tools
- **Backup Safety**: Automatic backup of original JSON files during migration
- **Enhanced Performance**: Significantly faster task queries and operations
- **ACID Transactions**: Data integrity guaranteed with proper transaction management
- **Better Concurrency**: WAL mode SQLite for improved concurrent access
- **Database Indexes**: Optimized query performance with proper indexing

#### 🔄 Changed
- **Data Storage**: All data now stored in `~/.mcp_agent_task_hub/tasks.db`
- **Internal Architecture**: Complete refactor using Repository Pattern
- **Memory Usage**: Reduced memory footprint by eliminating in-memory JSON storage
- **Error Handling**: Improved error handling with database constraints

#### 🛡️ Security & Reliability
- **Foreign Key Constraints**: Referential integrity enforced at database level
- **Schema Validation**: Database schema ensures data consistency
- **Automatic Rollback**: Failed operations don't corrupt data
- **Backup Strategy**: Comprehensive backup during migration process

#### 📚 Documentation
- **SQLite Migration Guide**: Comprehensive migration documentation
- **Implementation Summary**: Detailed technical implementation overview
- **Updated README**: Migration information and new features

#### 🔧 Technical Details
- Uses `better-sqlite3` for high-performance SQLite operations
- Modular codebase with separate concerns (database, repository, server)
- Type-safe database operations with comprehensive TypeScript interfaces
- Comprehensive test suite for migration and functionality validation

#### 🎯 Migration
- **Automatic**: First startup detects and migrates existing JSON data
- **Manual Options**: `npm run migrate` or `mcp-agenttaskhub-migrate` CLI
- **Backup**: Original files backed up to `~/.mcp_agent_task_hub/backup/`
- **Zero Downtime**: Seamless upgrade process with data preservation

#### ⚠️ Important Notes
- First run after upgrade will perform automatic migration
- Original JSON files are safely backed up before migration
- All existing functionality preserved with improved performance
- See [SQLITE_MIGRATION.md](SQLITE_MIGRATION.md) for detailed migration guide

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2024-01-15

### Added
- **Automatic Task Tree Archiving**: Completed task trees are now automatically moved to `completed_tasks.json` without requiring manual intervention
  - Tasks are auto-archived when all descendants in a task tree are marked as "done"
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

## [0.2.0] - 2024-01-10

### Added
- Initial release of MCP AgentTaskHub
- Task planning and management system
- Hierarchical task support with parent-child relationships
- Task dependencies and validation
- Manual task archiving via `archive_task_tree` tool
- Completion summary logging
- Progress tracking and status reporting
- Multiple request handling

### Core Tools
- `request_planning` - Create new requests with tasks
- `get_next_task` - Get next actionable task
- `mark_task_done` - Mark tasks as completed
- `mark_task_failed` - Mark tasks as failed
- `update_task` - Update task properties
- `add_subtask` - Add child tasks
- `archive_task_tree` - Manually archive completed trees
- `list_requests` - View all active requests
- Task dependency management tools

### Infrastructure
- TypeScript implementation with full type safety
- Zod schema validation for all inputs
- Persistent JSON file storage
- MCP protocol compliance
- Error handling and validation