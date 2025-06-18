# Troubleshooting Meta Mind MCP Server

This guide helps resolve common issues when using the Meta Mind MCP Server with Claude Desktop or other MCP clients.

## "Failed to start server" Error

If you encounter a "Failed to start server" error when trying to use the Meta Mind MCP Server, here are steps to resolve it:

### 1. Check Installation

First, ensure the package is properly installed:

```bash
npm install -g @snapspecter/mcp-meta-mind
```

### 2. Verify Configuration


The correct configuration should look like:

```json
{
  "tools": {
    "taskmanager": {
      "command": "npx",
      "args": ["-y", "@snapspecter/mcp-meta-mind"]
    }
  }
}
```

### 3. Check Permissions

Ensure the package is executable:

```bash
chmod +x $(which mcp-meta-mind)
```

### 4. Manual Execution Test

Try running the server manually to see any error messages:

```bash
npx @snapspecter/mcp-meta-mind
```

If this produces errors, please copy them for troubleshooting.

### 5. Data Directory Issues

The server stores task data in a directory. By default, this is:
`~/.meta_mind/mcp_task_manager_data`

You might need to create this directory:

```bash
mkdir -p ~/.meta_mind/mcp_task_manager_data
```

Alternatively, set a custom directory by setting the environment variable:

```bash
export TASK_MANAGER_DATA_DIR=~/my_custom_path
```

### 6. Local Development Setup

If you're developing locally:

1. Clone the repository
2. Install dependencies: `npm install`
3. Start the server directly: `npm run start`
4. Update config to point to your local version:

```json
{
  "tools": {
    "taskmanager": {
      "command": "tsx",
      "args": ["./index.ts"],
      "cwd": "/path/to/your/mcp-meta-mind"
    }
  }
}
```

## Other Issues

### Compatibility

- Ensure you're using Node.js 18 or later

### Server Already Running

If you get errors about the server already running, check for existing processes:

```bash
ps aux | grep meta-mind
```

And terminate any running instances:

```bash
kill <process_id>
```

## Getting Help

If you continue experiencing issues:

1. Check the GitHub repository issues: https://github.com/snapspecter/mcp-meta-mind/issues
2. Create a new issue with:
   - Your environment details (OS, Node.js version)
   - Steps to reproduce
   - Error messages
   - Configuration files (redact any sensitive information)
