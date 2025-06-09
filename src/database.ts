import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';

// Database configuration
const DB_DIR = path.join(os.homedir(), '.mcp_agent_task_hub');
const DB_PATH = path.join(DB_DIR, 'tasks.db');

let db: Database.Database;

/**
 * Creates the database schema with all necessary tables and indexes
 */
const createSchema = () => {
    db.exec(`
        -- Requests table to store high-level request information
        CREATE TABLE IF NOT EXISTS requests (
            requestId TEXT PRIMARY KEY,
            originalRequest TEXT NOT NULL,
            splitDetails TEXT,
            completed BOOLEAN NOT NULL DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        -- Tasks table to store individual task information
        CREATE TABLE IF NOT EXISTS tasks (
            taskId TEXT PRIMARY KEY,
            requestId TEXT NOT NULL,
            parentId TEXT,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL,
            priority TEXT NOT NULL,
            type TEXT,
            dependsOn TEXT, -- JSON array of task IDs
            subtaskIds TEXT, -- JSON array of subtask IDs
            failureReason TEXT,
            suggestedRetryStrategy TEXT,
            completedDetails TEXT,
            artifactsGenerated TEXT, -- JSON array
            environmentContext TEXT,
            summaryFilePath TEXT,
            costData TEXT, -- JSON object
            feedbackHistory TEXT, -- JSON object
            retryCount INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            FOREIGN KEY (requestId) REFERENCES requests(requestId) ON DELETE CASCADE,
            FOREIGN KEY (parentId) REFERENCES tasks(taskId) ON DELETE CASCADE
        );

        -- Archived tasks table for completed/archived task trees
        CREATE TABLE IF NOT EXISTS archived_tasks (
            taskId TEXT PRIMARY KEY,
            originalRequestId TEXT NOT NULL,
            originalRequestText TEXT NOT NULL,
            parentId TEXT,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL,
            priority TEXT NOT NULL,
            type TEXT,
            dependsOn TEXT, -- JSON array
            subtaskIds TEXT, -- JSON array
            failureReason TEXT,
            suggestedRetryStrategy TEXT,
            completedDetails TEXT,
            artifactsGenerated TEXT, -- JSON array
            environmentContext TEXT,
            summaryFilePath TEXT,
            costData TEXT, -- JSON object
            feedbackHistory TEXT, -- JSON object
            retryCount INTEGER DEFAULT 0,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            archivedAt TEXT NOT NULL
        );

        -- Performance indexes
        CREATE INDEX IF NOT EXISTS idx_tasks_requestId ON tasks(requestId);
        CREATE INDEX IF NOT EXISTS idx_tasks_parentId ON tasks(parentId);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
        CREATE INDEX IF NOT EXISTS idx_archived_tasks_originalRequestId ON archived_tasks(originalRequestId);
        CREATE INDEX IF NOT EXISTS idx_archived_tasks_archivedAt ON archived_tasks(archivedAt);

        -- Metadata table for storing counters and other system information
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updatedAt TEXT NOT NULL
        );

        -- Initialize metadata if not exists
        INSERT OR IGNORE INTO metadata (key, value, updatedAt) VALUES
            ('lastRequestId', '0', datetime('now')),
            ('lastTaskId', '0', datetime('now'));
    `);

    console.log('Database schema initialized successfully.');
};

/**
 * Gets or creates the SQLite database connection
 * @returns Database instance
 */
export const getDb = (): Database.Database => {
    if (!db) {
        try {
            // Ensure directory exists
            fs.mkdirSync(DB_DIR, { recursive: true });

            // Create database connection
            db = new Database(DB_PATH);

            // Set pragmas for better performance and reliability
            db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
            db.pragma('foreign_keys = ON'); // Enforce foreign key constraints
            db.pragma('synchronous = NORMAL'); // Good balance of safety and performance
            db.pragma('cache_size = 10000'); // Larger cache for better performance

            // Create schema
            createSchema();

            console.log(`Database initialized at: ${DB_PATH}`);
        } catch (error) {
            console.error('Failed to initialize database:', error);
            throw error;
        }
    }
    return db;
};

/**
 * Closes the database connection
 */
export const closeDb = (): void => {
    if (db) {
        db.close();
        console.log('Database connection closed.');
    }
};

/**
 * Gets the database file path for reference
 */
export const getDbPath = (): string => {
    return DB_PATH;
};

/**
 * Checks if the database file exists
 */
export const dbExists = (): boolean => {
    return fs.existsSync(DB_PATH);
};
