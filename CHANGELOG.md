# Changelog

All notable changes to this project will be documented in this file.

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