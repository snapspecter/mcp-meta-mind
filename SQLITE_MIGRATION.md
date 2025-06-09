# SQLite Migration Guide

## Overview

Starting from version 0.3.0, mcp-AgentTaskHub has migrated from a JSON file-based storage system to a more robust SQLite database backend. This change provides better performance, data integrity, and concurrent access capabilities.

## What Changed

### Before (JSON Files)
- Tasks stored in `~/.mcp_agent_task_hub/active_tasks.json`
- Completed tasks in `~/.mcp_agent_task_hub/completed_tasks.json`
- File-based operations with potential race conditions
- Limited query capabilities

### After (SQLite Database)
- All data stored in `~/.mcp_agent_task_hub/tasks.db`
- Proper relational database structure
- ACID transactions for data integrity
- Better performance and concurrent access
- Automatic schema management

## Database Schema

The new SQLite database includes the following tables:

### `requests`
- `requestId` (PRIMARY KEY)
- `originalRequest`
- `splitDetails`
- `completed`
- `createdAt`
- `updatedAt`

### `tasks`
- `taskId` (PRIMARY KEY)
- `requestId` (FOREIGN KEY)
- `parentId` (FOREIGN KEY, nullable)
- `title`
- `description`
- `status`
- `priority`
- `type`
- `dependsOn` (JSON array)
- `subtaskIds` (JSON array)
- And other task-related fields...

### `archived_tasks`
- Similar structure to `tasks` but for archived/completed tasks
- Additional `archivedAt` timestamp

### `metadata`
- System metadata like ID counters

## Automatic Migration

When you start mcp-AgentTaskHub v0.3.0+ for the first time, it will automatically detect old JSON files and migrate them to the SQLite database.

### What Happens During Migration

1. **Detection**: System checks for existing `active_tasks.json` and `completed_tasks.json`
2. **Backup**: Original files are backed up to `~/.mcp_agent_task_hub/backup/`
3. **Migration**: Data is transferred to the new SQLite database
4. **Validation**: Migration results are reported

### Migration Output Example

```
🔄 Old JSON files detected. Performing automatic migration to SQLite...
Starting migration from JSON files to SQLite...
Migration completed with 0 errors.
Migrated: 3 requests, 12 active tasks, 8 archived tasks
✅ Migration completed successfully!
📊 Migrated: 3 requests, 12 active tasks, 8 archived tasks
💾 Original files backed up to ~/.mcp_agent_task_hub/backup/
```

## Manual Migration

If you need to run the migration manually or want more control over the process:

### Using npm script:
```bash
npm run migrate
```

### Using the binary (if installed globally):
```bash
mcp-agenttaskhub-migrate
```

### Manual cleanup (optional):
```bash
npm run migrate -- --cleanup
```

The `--cleanup` flag will remove the original JSON files after successful migration. Without this flag, files are only backed up.

## Migration Status

You can check if migration is needed by looking for these files:
- `~/.mcp_agent_task_hub/active_tasks.json` (old format)
- `~/.mcp_agent_task_hub/tasks.db` (new format)

If both exist, the system will prefer the SQLite database and may prompt for migration.

## Rollback (Not Recommended)

If you need to rollback to the old JSON format:

1. Stop the mcp-AgentTaskHub server
2. Remove or rename `tasks.db`
3. Restore JSON files from the backup directory
4. Downgrade to a pre-0.3.0 version

**Warning**: This will lose any data created after the migration.

## Benefits of SQLite Backend

### Performance
- Faster queries and data retrieval
- Efficient indexing for large datasets
- Better memory usage

### Reliability
- ACID transactions prevent data corruption
- Automatic backup and recovery
- Better handling of concurrent access

### Features
- Complex queries and relationships
- Better dependency validation
- Improved archival system

### Maintenance
- Automatic schema management
- Built-in data integrity checks
- Easier debugging and inspection

## Database Location

The SQLite database is stored at:
```
~/.mcp_agent_task_hub/tasks.db
```

You can inspect this database using any SQLite browser or command-line tools:

```bash
sqlite3 ~/.mcp_agent_task_hub/tasks.db
```

## Troubleshooting

### Migration Fails
1. Check file permissions in `~/.mcp_agent_task_hub/`
2. Ensure sufficient disk space
3. Verify JSON files are not corrupted
4. Check the error messages in the migration output

### Performance Issues
1. The database file may grow large over time
2. Consider periodic cleanup of archived tasks
3. SQLite handles this automatically with WAL mode

### Data Integrity
1. SQLite provides built-in integrity checks
2. Foreign key constraints ensure data consistency
3. Automatic backups are maintained

## Advanced Usage

### Database Inspection
```bash
# List all tables
sqlite3 ~/.mcp_agent_task_hub/tasks.db ".tables"

# View schema
sqlite3 ~/.mcp_agent_task_hub/tasks.db ".schema"

# Query data
sqlite3 ~/.mcp_agent_task_hub/tasks.db "SELECT * FROM requests LIMIT 5;"
```

### Manual Backup
```bash
# Create backup
cp ~/.mcp_agent_task_hub/tasks.db ~/.mcp_agent_task_hub/tasks.db.backup

# Restore backup
cp ~/.mcp_agent_task_hub/tasks.db.backup ~/.mcp_agent_task_hub/tasks.db
```

## Support

If you encounter issues during migration:

1. Check the console output for specific error messages
2. Verify your JSON files are valid and not corrupted
3. Ensure you have write permissions to the data directory
4. Create an issue on GitHub with migration logs

The migration process is designed to be safe and reversible, with automatic backups to prevent data loss.