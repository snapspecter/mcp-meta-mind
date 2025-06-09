#!/usr/bin/env node

/**
 * Standalone migration script for mcp-AgentTaskHub
 * Migrates from old JSON file format to new SQLite database format
 */

import { runMigration } from "./dist/src/migration.js";

console.log("🚀 mcp-AgentTaskHub Migration Tool");
console.log("===================================");
console.log();

runMigration().catch(error => {
  console.error("💥 Migration failed:", error);
  process.exit(1);
});
