/**
 * Chapter 3 - Configuration Loader
 *
 * Loads, validates, and manages the OpenClaw configuration.
 * Config is stored as YAML in ~/.myclaw/myclaw.yaml
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { config as loadDotenv } from "dotenv";
import {
  OpenClawConfigSchema,
  createDefaultConfig,
  type OpenClawConfig,
} from "./schema.js";

// State directory: ~/.myclaw/
const STATE_DIR =
  process.env.MYCLAW_STATE_DIR || path.join(os.homedir(), ".myclaw");
const CONFIG_PATH =
  process.env.MYCLAW_CONFIG_PATH || path.join(STATE_DIR, "myclaw.yaml");

export function getStateDir(): string {
  return STATE_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Ensure the state directory exists
 */
export function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

/**
 * Load and validate the configuration file.
 * Returns default config if file doesn't exist.
 */
export function loadConfig(): OpenClawConfig {
  // Load .env file if present
  loadDotenv();

  if (!fs.existsSync(CONFIG_PATH)) {
    return createDefaultConfig();
  }

  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const parsed = parseYaml(raw);

  const result = OpenClawConfigSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Configuration validation errors:");
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Invalid configuration. Please fix the errors above.");
  }

  return result.data;
}

/**
 * Write the configuration to disk
 */
export function writeConfig(config: OpenClawConfig): void {
  ensureStateDir();
  const yaml = stringifyYaml(config, { indent: 2 });
  fs.writeFileSync(CONFIG_PATH, yaml, "utf-8");
}

/**
 * Resolve an API key from config - supports direct value or env var
 */
export function resolveSecret(
  value?: string,
  envVar?: string
): string | undefined {
  if (value) return value;
  if (envVar) return process.env[envVar];
  return undefined;
}

/**
 * Get a snapshot of the current config (immutable copy)
 */
export function loadConfigSnapshot(): Readonly<OpenClawConfig> {
  return Object.freeze(loadConfig());
}
