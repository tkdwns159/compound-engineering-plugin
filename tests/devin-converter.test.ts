import { describe, expect, test } from "bun:test"
import path from "path"
import { convertClaudeToDevin, mapAllowedTool, transformContentForDevin } from "../src/converters/claude-to-devin"
import { parseFrontmatter } from "../src/utils/frontmatter"
import { loadClaudePlugin } from "../src/parsers/claude"
import type { ClaudePlugin } from "../src/types/claude"

const fixturePluginPath = path.join(import.meta.dir, "fixtures", "sample-plugin")

const inlinePlugin: ClaudePlugin = {
  root: "/tmp/plugin",
  manifest: {
    name: "fixture",
    version: "1.2.3",
    description: "Fixture plugin",
    author: { name: "Every", email: "every@example.com", url: "https://every.to" },
    keywords: ["ai", "review"],
  },
  agents: [],
  commands: [],
  skills: [
    {
      name: "skill-one",
      description: "Sample skill",
      sourceDir: "/tmp/plugin/skills/skill-one",
      skillPath: "/tmp/plugin/skills/skill-one/SKILL.md",
    },
    {
      name: "claude-only-skill",
      description: "Claude only",
      ce_platforms: ["claude"],
      sourceDir: "/tmp/plugin/skills/claude-only-skill",
      skillPath: "/tmp/plugin/skills/claude-only-skill/SKILL.md",
    },
  ],
  hooks: undefined,
  mcpServers: { local: { command: "echo", args: ["hi"] } },
}

describe("convertClaudeToDevin", () => {
  test("builds a manifest from the Claude manifest", () => {
    const bundle = convertClaudeToDevin(inlinePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })
    expect(bundle.pluginName).toBe("fixture")
    expect(bundle.manifest.name).toBe("fixture")
    expect(bundle.manifest.version).toBe("1.2.3")
    expect(bundle.manifest.description).toBe("Fixture plugin")
    expect(bundle.manifest.author).toEqual({ name: "Every", email: "every@example.com", url: "https://every.to" })
    expect(bundle.manifest.keywords).toEqual(["ai", "review"])
  })

  test("filters skills by platform (devin)", () => {
    const bundle = convertClaudeToDevin(inlinePlugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })
    const names = bundle.skillDirs.map((s) => s.name)
    expect(names).toContain("skill-one")
    // claude-only-skill is gated to claude only, so it must be excluded for devin
    expect(names).not.toContain("claude-only-skill")
  })

  test("warns and skips MCP servers (Devin plugins do not declare MCP)", () => {
    const originalWarn = console.warn
    const warnings: string[] = []
    console.warn = (msg: string) => warnings.push(msg)
    try {
      convertClaudeToDevin(inlinePlugin, {
        agentMode: "subagent",
        inferTemperature: false,
        permissions: "none",
      })
    } finally {
      console.warn = originalWarn
    }
    expect(warnings.some((w) => w.includes("MCP servers"))).toBe(true)
  })

  test("converts the real sample-plugin fixture", async () => {
    const plugin = await loadClaudePlugin(fixturePluginPath)
    const bundle = convertClaudeToDevin(plugin, {
      agentMode: "subagent",
      inferTemperature: false,
      permissions: "none",
    })
    expect(bundle.manifest.name).toBe("compound-engineering")
    // claude-only-skill fixture is gated to claude only
    expect(bundle.skillDirs.map((s) => s.name)).not.toContain("claude-only-skill")
  })
})

describe("mapAllowedTool", () => {
  test("maps Claude tool names to Devin lowercase tool names", () => {
    expect(mapAllowedTool("Read")).toBe("read")
    expect(mapAllowedTool("Write")).toBe("edit")
    expect(mapAllowedTool("Edit")).toBe("edit")
    expect(mapAllowedTool("Glob")).toBe("glob")
    expect(mapAllowedTool("Grep")).toBe("grep")
    expect(mapAllowedTool("Bash")).toBe("exec")
  })

  test("strips Claude pattern forms to the bare tool name", () => {
    expect(mapAllowedTool("Bash(gh *)")).toBe("exec")
    expect(mapAllowedTool("Bash(git diff)")).toBe("exec")
  })

  test("passes mcp__ tools through unchanged", () => {
    expect(mapAllowedTool("mcp__github__create_issue")).toBe("mcp__github__create_issue")
  })

  test("drops tools with no Devin equivalent", () => {
    expect(mapAllowedTool("AskUserQuestion")).toBeNull()
    expect(mapAllowedTool("WebFetch")).toBeNull()
    expect(mapAllowedTool("WebSearch")).toBeNull()
    expect(mapAllowedTool("Task")).toBeNull()
  })

  test("passes already-lowercase Devin tool names through", () => {
    expect(mapAllowedTool("read")).toBe("read")
    expect(mapAllowedTool("exec")).toBe("exec")
  })
})

describe("transformContentForDevin", () => {
  test("converts disable-model-invocation to triggers: [user]", () => {
    const input = "---\nname: ce-polish\ndescription: \"Manual only\"\ndisable-model-invocation: true\n---\n\nBody.\n"
    const out = transformContentForDevin(input)
    const parsed = parseFrontmatter(out)
    expect(parsed.data["disable-model-invocation"]).toBeUndefined()
    expect(parsed.data.triggers).toEqual(["user"])
    expect(parsed.data.name).toBe("ce-polish")
    expect(parsed.body).toContain("Body.")
  })

  test("maps allowed-tools entries and drops unsupported ones", () => {
    const input =
      "---\n" +
      "name: ce-product-pulse\n" +
      "description: \"Pulse\"\n" +
      "allowed-tools:\n" +
      "  - Read\n" +
      "  - Write\n" +
      "  - Glob\n" +
      "  - Grep\n" +
      "  - Bash\n" +
      "  - Bash(gh *)\n" +
      "  - AskUserQuestion\n" +
      "  - WebFetch\n" +
      "  - mcp__github__list_issues\n" +
      "---\n\nBody.\n"
    const out = transformContentForDevin(input)
    const parsed = parseFrontmatter(out)
    expect(parsed.data["allowed-tools"]).toEqual([
      "read",
      "edit",
      "glob",
      "grep",
      "exec",
      "mcp__github__list_issues",
    ])
  })

  test("removes ce_platforms", () => {
    const input = "---\nname: x\ndescription: \"X\"\nce_platforms: [claude]\n---\n\nBody.\n"
    const out = transformContentForDevin(input)
    const parsed = parseFrontmatter(out)
    expect(parsed.data["ce_platforms"]).toBeUndefined()
  })

  test("handles inline comma-separated allowed-tools (YAML scalar form)", () => {
    const input =
      "---\n" +
      "name: ce-resolve-pr-feedback\n" +
      "description: \"Resolve PR feedback\"\n" +
      'argument-hint: "[PR number]"\n' +
      "allowed-tools: Bash(gh *), Bash(git *), Read\n" +
      "---\n\nBody.\n"
    const out = transformContentForDevin(input)
    const parsed = parseFrontmatter(out)
    expect(parsed.data["allowed-tools"]).toEqual(["exec", "read"])
  })

  test("leaves content without frontmatter untouched", () => {
    const input = "No frontmatter here.\n"
    expect(transformContentForDevin(input)).toBe(input)
  })

  test("preserves name, description, argument-hint", () => {
    const input =
      "---\n" +
      "name: ce-debug\n" +
      "description: \"Debug\"\n" +
      'argument-hint: "[issue ref]"\n' +
      "---\n\nBody.\n"
    const out = transformContentForDevin(input)
    const parsed = parseFrontmatter(out)
    expect(parsed.data.name).toBe("ce-debug")
    expect(parsed.data.description).toBe("Debug")
    expect(parsed.data["argument-hint"]).toBe("[issue ref]")
  })
})
