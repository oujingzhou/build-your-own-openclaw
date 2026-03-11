/**
 * Chapter 5 - Built-in Tools (OpenClaw Coding Agent)
 *
 * Tools aligned with the OpenClaw coding agent tool set:
 * read, write, edit, exec, grep, find, ls
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AgentTool } from "./providers/types.js";

export function getBuiltinTools(): AgentTool[] {
  return [
    {
      name: "read",
      description:
        "Read file contents. Returns lines with line numbers. Supports offset and limit for partial reads.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Absolute or relative path to the file to read",
          },
          offset: {
            type: "number",
            description:
              "Line number to start reading from (1-based). Optional.",
          },
          limit: {
            type: "number",
            description: "Maximum number of lines to read. Optional.",
          },
        },
        required: ["file_path"],
      },
      execute: async (args) => {
        const filePath = args.file_path as string;
        const offset = (args.offset as number) || 1;
        const limit = args.limit as number | undefined;

        if (!fs.existsSync(filePath)) {
          return `Error: File '${filePath}' not found`;
        }

        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          return `Error: '${filePath}' is a directory, not a file`;
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const startIdx = Math.max(0, offset - 1);
        const endIdx = limit ? startIdx + limit : lines.length;
        const sliced = lines.slice(startIdx, endIdx);

        const numbered = sliced.map(
          (line, i) => `${String(startIdx + i + 1).padStart(6)}\t${line}`
        );
        return numbered.join("\n");
      },
    },
    {
      name: "write",
      description:
        "Create or overwrite a file with the given content. Parent directories are created automatically.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path to the file to write",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["file_path", "content"],
      },
      execute: async (args) => {
        const filePath = args.file_path as string;
        const content = args.content as string;

        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, content, "utf-8");
        return `File written: ${filePath}`;
      },
    },
    {
      name: "edit",
      description:
        "Make precise edits to a file by replacing an exact string with a new string. The old_string must match exactly one location in the file.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path to the file to edit",
          },
          old_string: {
            type: "string",
            description: "The exact string to find and replace",
          },
          new_string: {
            type: "string",
            description: "The replacement string",
          },
        },
        required: ["file_path", "old_string", "new_string"],
      },
      execute: async (args) => {
        const filePath = args.file_path as string;
        const oldStr = args.old_string as string;
        const newStr = args.new_string as string;

        if (!fs.existsSync(filePath)) {
          return `Error: File '${filePath}' not found`;
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const count = content.split(oldStr).length - 1;

        if (count === 0) {
          return `Error: old_string not found in '${filePath}'`;
        }
        if (count > 1) {
          return `Error: old_string found ${count} times in '${filePath}'. Must be unique.`;
        }

        const updated = content.replace(oldStr, newStr);
        fs.writeFileSync(filePath, updated, "utf-8");
        return `File edited: ${filePath}`;
      },
    },
    {
      name: "exec",
      description:
        "Execute a shell command and return its output. Use this for running build commands, git, npm, etc.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
          cwd: {
            type: "string",
            description: "Working directory (optional, defaults to current dir)",
          },
          timeout: {
            type: "number",
            description: "Timeout in milliseconds (default 30000)",
          },
        },
        required: ["command"],
      },
      execute: async (args) => {
        const command = args.command as string;
        const cwd = (args.cwd as string) || process.cwd();
        const timeout = (args.timeout as number) || 30_000;
        try {
          const output = execSync(command, {
            cwd,
            encoding: "utf-8",
            timeout,
            maxBuffer: 1024 * 1024,
            stdio: ["pipe", "pipe", "pipe"],
          });
          return output.trim() || "(command completed with no output)";
        } catch (err: unknown) {
          const error = err as {
            stderr?: string;
            message?: string;
            status?: number;
          };
          const stderr = error.stderr?.trim();
          return `Exit code ${error.status ?? 1}${stderr ? `\n${stderr}` : `\n${error.message}`}`;
        }
      },
    },
    {
      name: "grep",
      description:
        "Search file contents using a regex pattern. Returns matching lines with file paths and line numbers.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "Regex pattern to search for",
          },
          path: {
            type: "string",
            description:
              "File or directory to search in (defaults to current dir)",
          },
          include: {
            type: "string",
            description: 'Glob pattern to filter files (e.g. "*.ts")',
          },
        },
        required: ["pattern"],
      },
      execute: async (args) => {
        const pattern = args.pattern as string;
        const searchPath = (args.path as string) || ".";
        const include = args.include as string | undefined;

        let cmd = `grep -rn --color=never`;
        if (include) {
          cmd += ` --include='${include}'`;
        }
        cmd += ` '${pattern.replace(/'/g, "'\\''")}' '${searchPath}'`;

        try {
          const output = execSync(cmd, {
            encoding: "utf-8",
            timeout: 15_000,
            maxBuffer: 1024 * 1024,
            stdio: ["pipe", "pipe", "pipe"],
          });
          const lines = output.trim().split("\n");
          if (lines.length > 200) {
            return (
              lines.slice(0, 200).join("\n") +
              `\n... (${lines.length - 200} more matches)`
            );
          }
          return output.trim() || "No matches found.";
        } catch {
          return "No matches found.";
        }
      },
    },
    {
      name: "find",
      description:
        "Find files matching a glob pattern. Returns matching file paths.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: 'Glob pattern to match (e.g. "**/*.ts", "src/**/*.js")',
          },
          path: {
            type: "string",
            description: "Base directory to search in (defaults to current dir)",
          },
        },
        required: ["pattern"],
      },
      execute: async (args) => {
        const pattern = args.pattern as string;
        const basePath = (args.path as string) || ".";

        // Use find command with name pattern for simple globs, or full glob matching
        try {
          const cmd = `find '${basePath}' -path '*/node_modules' -prune -o -path '*/.git' -prune -o -type f -name '${pattern}' -print 2>/dev/null | head -200`;
          const output = execSync(cmd, {
            encoding: "utf-8",
            timeout: 15_000,
            maxBuffer: 1024 * 1024,
            stdio: ["pipe", "pipe", "pipe"],
          });
          return output.trim() || "No files found.";
        } catch {
          return "No files found.";
        }
      },
    },
    {
      name: "ls",
      description: "List directory contents with file types and sizes.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Directory path to list (defaults to current dir)",
          },
        },
      },
      execute: async (args) => {
        const dirPath = (args.path as string) || process.cwd();

        if (!fs.existsSync(dirPath)) {
          return `Error: Path '${dirPath}' does not exist`;
        }

        const stat = fs.statSync(dirPath);
        if (!stat.isDirectory()) {
          return `Error: '${dirPath}' is not a directory`;
        }

        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        const lines: string[] = [];

        for (const item of items) {
          if (item.name.startsWith(".")) continue;
          const fullPath = path.join(dirPath, item.name);
          if (item.isDirectory()) {
            lines.push(`d  ${item.name}/`);
          } else {
            const size = fs.statSync(fullPath).size;
            const sizeStr =
              size > 1024 * 1024
                ? `${(size / 1024 / 1024).toFixed(1)}M`
                : size > 1024
                  ? `${(size / 1024).toFixed(1)}K`
                  : `${size}B`;
            lines.push(`f  ${item.name}  (${sizeStr})`);
          }
        }

        return lines.join("\n") || "(empty directory)";
      },
    },
  ];
}
