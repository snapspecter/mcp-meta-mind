#!/usr/bin/env node

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const DEFAULT_DATA_DIR = path.join(
  os.homedir(),
  ".AutoTaskHub/mcp_task_manager_data",
);
const DATA_DIR = process.env.TASK_MANAGER_DATA_DIR || DEFAULT_DATA_DIR;
const ACTIVE_TASKS_FILE_NAME = "tasks.json";
const COMPLETED_TASKS_FILE_NAME = "completed_tasks.json";
const COMPLETED_TASK_SUMMARIES_DIR_NAME = "completed_task_summaries";

const ACTIVE_TASKS_FILE_PATH = path.join(DATA_DIR, ACTIVE_TASKS_FILE_NAME);
const COMPLETED_TASKS_FILE_PATH = path.join(
  DATA_DIR,
  COMPLETED_TASKS_FILE_NAME,
);
const COMPLETED_TASK_SUMMARIES_DIR_PATH = path.join(
  DATA_DIR,
  COMPLETED_TASK_SUMMARIES_DIR_NAME,
);

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`✅ Created directory: ${dirPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error creating directory ${dirPath}:`, error.message);
    return false;
  }
}

async function ensureFileExists(filePath, defaultContent) {
  try {
    try {
      await fs.access(filePath);
      console.log(`✅ File already exists: ${filePath}`);
    } catch (error) {
      // File doesn't exist, create it
      await fs.writeFile(filePath, JSON.stringify(defaultContent, null, 2));
      console.log(`✅ Created file: ${filePath}`);
    }
    return true;
  } catch (error) {
    console.error(`❌ Error ensuring file ${filePath}:`, error.message);
    return false;
  }
}

async function setupDataDirectory() {
  console.log(`Setting up AgentTaskHub data directory at: ${DATA_DIR}`);

  // Create main data directory
  const mainDirCreated = await ensureDirectoryExists(DATA_DIR);
  if (!mainDirCreated) {
    console.error("Failed to create main data directory. Exiting.");
    process.exit(1);
  }

  // Create completed task summaries directory
  await ensureDirectoryExists(COMPLETED_TASK_SUMMARIES_DIR_PATH);

  // Create tasks file with default content if it doesn't exist
  await ensureFileExists(ACTIVE_TASKS_FILE_PATH, {
    requestCounter: 0,
    taskCounter: 0,
    requests: {},
  });

  // Create completed tasks file with default content if it doesn't exist
  await ensureFileExists(COMPLETED_TASKS_FILE_PATH, {
    tasks: [],
  });

  console.log(
    "\n✅ Setup complete! AgentTaskHub data directory is ready to use.",
  );
  console.log("\nData directory path:");
  console.log(DATA_DIR);

  if (DATA_DIR === DEFAULT_DATA_DIR) {
    console.log(
      "\nTo use a custom data directory, set the TASK_MANAGER_DATA_DIR environment variable:",
    );
    console.log("export TASK_MANAGER_DATA_DIR=~/your/custom/path");
  }
}

setupDataDirectory().catch((error) => {
  console.error("Error during setup:", error);
  process.exit(1);
});
