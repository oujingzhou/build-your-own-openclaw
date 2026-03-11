/**
 * Chapter 8 - Skills Workspace
 *
 * Manages skill loading and prompt generation using pi-coding-agent.
 * Skills are loaded from SKILL.md files and can be invoked two ways:
 * 1. User manually types /skill-name (user-invocable skills)
 * 2. Model automatically uses skills listed in the system prompt
 *
 * This module replaces the old loader.ts and registry.ts with
 * pi-coding-agent's loadSkillsFromDir and formatSkillsForPrompt.
 */

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  loadSkillsFromDir,
  formatSkillsForPrompt,
  type Skill,
} from "@mariozechner/pi-coding-agent";

/**
 * Extended skill entry with MyClaw-specific frontmatter fields.
 * pi-coding-agent's Skill type has: name, description, filePath, baseDir, source, disableModelInvocation
 * We add userInvocable and emoji from our own frontmatter parsing.
 */
export interface SkillEntry {
  skill: Skill;
  userInvocable: boolean;
  emoji?: string;
}

/**
 * Load skills from multiple directories using pi-coding-agent's loader.
 * Earlier directories have higher priority (first match wins on name conflicts).
 */
export function loadWorkspaceSkills(dirs: string[]): SkillEntry[] {
  const seen = new Map<string, SkillEntry>();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    const result = loadSkillsFromDir({ dir, source: path.basename(dir) });
    const skills = result.skills ?? result;
    const skillArray = Array.isArray(skills) ? skills : [];

    for (const skill of skillArray) {
      if (seen.has(skill.name)) continue;

      // Parse our extended frontmatter fields
      const extra = parseExtraFrontmatter(skill.filePath);

      seen.set(skill.name, {
        skill,
        userInvocable: extra.userInvocable,
        emoji: extra.emoji,
      });
    }
  }

  return Array.from(seen.values());
}

/**
 * Build the system prompt section listing available skills.
 * Uses pi-coding-agent's formatSkillsForPrompt for the XML format,
 * which the model can use to discover and invoke skills.
 */
export function buildSkillsPrompt(entries: SkillEntry[]): string {
  const skills = entries
    .filter((e) => !e.skill.disableModelInvocation)
    .map((e) => e.skill);

  if (skills.length === 0) return "";

  return formatSkillsForPrompt(skills);
}

/**
 * List skills that can be invoked via /name slash commands.
 */
export function listUserInvocable(entries: SkillEntry[]): SkillEntry[] {
  return entries.filter((e) => e.userInvocable);
}

/**
 * Look up a skill by name from the entries list.
 */
export function findSkill(entries: SkillEntry[], name: string): SkillEntry | undefined {
  return entries.find((e) => e.skill.name === name);
}

/**
 * Resolve a /skill-name command from user input.
 * Returns the matched skill entry and the remaining argument text, or null.
 */
export function resolveSkillCommand(
  text: string,
  entries: SkillEntry[],
): { entry: SkillEntry; args: string } | null {
  if (!text.startsWith("/")) return null;

  const match = text.match(/^\/(\S+)\s*([\s\S]*)$/);
  if (!match) return null;

  const [, skillName, rest] = match;
  const entry = findSkill(entries, skillName);
  if (!entry || !entry.userInvocable) return null;

  return { entry, args: rest.trim() };
}

/**
 * Read the skill's SKILL.md file and return the prompt body.
 */
export function getSkillPrompt(skill: Skill): string {
  try {
    const content = fs.readFileSync(skill.filePath, "utf-8");
    const bodyMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
    return bodyMatch ? bodyMatch[1].trim() : content.trim();
  } catch {
    return "";
  }
}

/**
 * Parse extra MyClaw-specific frontmatter fields (user-invocable, emoji)
 * that pi-coding-agent doesn't handle.
 */
function parseExtraFrontmatter(filePath: string): {
  userInvocable: boolean;
  emoji?: string;
} {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return { userInvocable: false };

    const fm = parseYaml(fmMatch[1]) as Record<string, unknown>;
    return {
      userInvocable: fm["user-invocable"] === true,
      emoji: typeof fm.emoji === "string" ? fm.emoji : undefined,
    };
  } catch {
    return { userInvocable: false };
  }
}
