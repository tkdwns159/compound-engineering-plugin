import { formatFrontmatter, parseFrontmatter } from "../utils/frontmatter"
import { type ClaudeManifest, type ClaudePlugin, filterSkillsByPlatform } from "../types/claude"
import type { DevinBundle, DevinManifest, DevinManifestAuthor, DevinSkillDir } from "../types/devin"
import type { ClaudeToOpenCodeOptions } from "./claude-to-opencode"

export type ClaudeToDevinOptions = ClaudeToOpenCodeOptions

/**
 * Convert a Claude Code plugin into a Devin CLI plugin bundle.
 *
 * Devin plugins are a `.devin-plugin/plugin.json` manifest plus a `skills/`
 * directory of ordinary SKILL.md files. The skill format is nearly identical
 * to Claude Code's, so skills pass through as whole directories. The only
 * translation needed is frontmatter: Claude-specific fields
 * (`disable-model-invocation`, capitalized `allowed-tools` entries) are
 * rewritten to their Devin equivalents (`triggers`, lowercase tool names).
 *
 * Devin plugins do not declare MCP servers or hooks in the manifest; those
 * are skipped here with a warning.
 */
export function convertClaudeToDevin(
  plugin: ClaudePlugin,
  _options: ClaudeToDevinOptions,
): DevinBundle {
  const platformSkills = filterSkillsByPlatform(plugin.skills, "devin")
  const skillDirs: DevinSkillDir[] = platformSkills.map((skill) => ({
    name: skill.name,
    sourceDir: skill.sourceDir,
  }))

  if (plugin.mcpServers && Object.keys(plugin.mcpServers).length > 0) {
    console.warn(
      "Warning: Devin plugins do not declare MCP servers in the manifest. MCP servers were skipped during conversion. Configure them in your Devin config separately.",
    )
  }

  if (plugin.hooks && Object.keys(plugin.hooks.hooks).length > 0) {
    console.warn("Warning: Devin plugins do not declare hooks in the manifest. Hooks were skipped during conversion.")
  }

  return {
    pluginName: plugin.manifest.name,
    manifest: convertManifest(plugin.manifest),
    skillDirs,
  }
}

function convertManifest(manifest: ClaudeManifest): DevinManifest {
  const result: DevinManifest = { name: manifest.name }
  if (manifest.version) result.version = manifest.version
  if (manifest.description) result.description = manifest.description
  if (manifest.author) {
    const author: DevinManifestAuthor = {}
    if (manifest.author.name) author.name = manifest.author.name
    if (manifest.author.email) author.email = manifest.author.email
    if (manifest.author.url) author.url = manifest.author.url
    result.author = author
  }
  if (manifest.keywords && manifest.keywords.length > 0) result.keywords = manifest.keywords
  return result
}

/**
 * Map a Claude Code `allowed-tools` entry to a Devin tool name, or return
 * `null` when the entry has no Devin equivalent and should be dropped.
 *
 * Devin's `allowed-tools` accepts bare tool names: `read`, `edit`, `grep`,
 * `glob`, `exec`, and `mcp__<server>__<tool>` entries. Claude Code uses
 * capitalized names (`Read`, `Write`, `Bash`, ...) and pattern forms
 * (`Bash(gh *)`). Patterns are not supported in Devin's `allowed-tools`
 * (they belong in `permissions`), so the pattern is stripped and the bare
 * tool name is emitted.
 */
export function mapAllowedTool(entry: string): string | null {
  const trimmed = entry.trim()
  if (!trimmed) return null

  // MCP tools pass through unchanged (mcp__server__tool).
  if (trimmed.startsWith("mcp__")) return trimmed

  // Strip Claude pattern form: "Bash(gh *)" -> "Bash"
  const patternMatch = trimmed.match(/^([A-Za-z]+)\(([^)]*)\)$/)
  const baseName = patternMatch ? patternMatch[1] : trimmed

  switch (baseName) {
    case "Read":
      return "read"
    case "Write":
    case "Edit":
    case "MultiEdit":
      return "edit"
    case "Glob":
      return "glob"
    case "Grep":
      return "grep"
    case "Bash":
      return "exec"
    // No Devin equivalent in the allowed-tools list.
    case "WebFetch":
    case "WebSearch":
    case "AskUserQuestion":
    case "Task":
    case "TodoWrite":
    case "NotebookEdit":
      return null
    default:
      // Already-lowercase Devin tool names pass through.
      if (/^(read|edit|grep|glob|exec)$/.test(baseName)) return baseName
      return null
  }
}

/**
 * Transform a SKILL.md file's content for Devin: rewrite Claude-specific
 * frontmatter fields to their Devin equivalents and leave the body untouched.
 *
 * - `disable-model-invocation: true` -> `triggers: [user]` (Devin's way of
 *   restricting a skill to explicit `/skill` invocation).
 * - `allowed-tools` entries are mapped to Devin lowercase tool names; entries
 *   with no Devin equivalent (e.g. `AskUserQuestion`, `WebFetch`) are dropped.
 * - `ce_platforms` (a Claude-only filtering field) is removed.
 *
 * The body is returned verbatim; Devin skills use the same prompt format.
 */
export function transformContentForDevin(content: string): string {
  const { data, body } = parseFrontmatter(content)
  if (Object.keys(data).length === 0) return content

  const next: Record<string, unknown> = {}

  // Carry over fields Devin understands as-is.
  for (const key of ["name", "description", "argument-hint", "model", "subagent", "agent"]) {
    if (data[key] !== undefined) next[key] = data[key]
  }

  // permissions: pass through if present (Devin uses the same permission syntax).
  if (data.permissions !== undefined) next.permissions = data.permissions

  // disable-model-invocation -> triggers: [user]
  const disableModelInvocation = data["disable-model-invocation"] === true
  if (disableModelInvocation) {
    next.triggers = ["user"]
  } else if (Array.isArray(data.triggers)) {
    next.triggers = data.triggers
  }

  // allowed-tools: map Claude tool names to Devin tool names.
  // Claude skills may declare allowed-tools as either a YAML block sequence
  // (`- Read`) or an inline comma-separated scalar (`Bash(gh *), Read`).
  // Normalize both forms before mapping.
  const rawAllowedTools = data["allowed-tools"]
  const allowedToolsEntries: string[] = []
  if (Array.isArray(rawAllowedTools)) {
    for (const entry of rawAllowedTools) {
      if (typeof entry === "string") allowedToolsEntries.push(entry)
    }
  } else if (typeof rawAllowedTools === "string") {
    for (const entry of rawAllowedTools.split(/,/)) {
      const trimmed = entry.trim()
      if (trimmed) allowedToolsEntries.push(trimmed)
    }
  }
  if (allowedToolsEntries.length > 0) {
    const mapped: string[] = []
    const seen = new Set<string>()
    for (const entry of allowedToolsEntries) {
      const devinTool = mapAllowedTool(entry)
      if (devinTool && !seen.has(devinTool)) {
        seen.add(devinTool)
        mapped.push(devinTool)
      }
    }
    if (mapped.length > 0) next["allowed-tools"] = mapped
  }

  return formatFrontmatter(next, body)
}
