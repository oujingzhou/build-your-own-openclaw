#!/usr/bin/env node

/**
 * MyClaw Bootstrap Entry
 *
 * This is the executable entry point for the myclaw CLI.
 * It performs version checks and then delegates to the main entry.
 */

const MIN_NODE_VERSION = 20;

const major = parseInt(process.versions.node.split(".")[0], 10);
if (major < MIN_NODE_VERSION) {
  console.error(
    `MyClaw requires Node.js v${MIN_NODE_VERSION}+. Current: ${process.versions.node}`
  );
  console.error("Please upgrade Node.js: https://nodejs.org/");
  process.exit(1);
}

// Suppress experimental warnings for cleaner output
process.env.NODE_NO_WARNINGS = "1";

// Delegate to the compiled entry point or use tsx for dev
try {
  await import("./dist/entry.js");
} catch {
  // Fallback: try tsx for development
  try {
    await import("./src/entry.ts");
  } catch (e) {
    console.error("Failed to start MyClaw. Run 'npm run build' first or use 'npm run dev'.");
    console.error(e);
    process.exit(1);
  }
}
