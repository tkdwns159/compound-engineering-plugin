import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { writeDevinBundle } from "../src/targets/devin"
import type { DevinBundle } from "../src/types/devin"
import { parseFrontmatter } from "../src/utils/frontmatter"

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function writeSkill(dir: string, name: string, content: string): Promise<string> {
  const skillDir = path.join(dir, name)
  await fs.mkdir(skillDir, { recursive: true })
  const skillPath = path.join(skillDir, "SKILL.md")
  await fs.writeFile(skillPath, content)
  return skillDir
}

describe("writeDevinBundle", () => {
  test("writes .devin-plugin/plugin.json and skills/ with transformed frontmatter", async () => {
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "devin-src-"))
    const skillDir = await writeSkill(
      sourceRoot,
      "ce-polish",
      "---\nname: ce-polish\ndescription: \"Manual only\"\ndisable-model-invocation: true\nallowed-tools:\n  - Read\n  - Bash(gh *)\n  - AskUserQuestion\n---\n\nBody.\n",
    )

    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "devin-out-"))
    const bundle: DevinBundle = {
      pluginName: "compound-engineering",
      manifest: {
        name: "compound-engineering",
        version: "1.0.0",
        description: "Test plugin",
      },
      skillDirs: [{ name: "ce-polish", sourceDir: skillDir }],
    }

    await writeDevinBundle(outputRoot, bundle)

    // Manifest written
    const manifestPath = path.join(outputRoot, ".devin-plugin", "plugin.json")
    expect(await exists(manifestPath)).toBe(true)
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"))
    expect(manifest.name).toBe("compound-engineering")
    expect(manifest.version).toBe("1.0.0")

    // Skill written with transformed frontmatter
    const skillPath = path.join(outputRoot, "skills", "ce-polish", "SKILL.md")
    expect(await exists(skillPath)).toBe(true)
    const parsed = parseFrontmatter(await fs.readFile(skillPath, "utf8"))
    expect(parsed.data["disable-model-invocation"]).toBeUndefined()
    expect(parsed.data.triggers).toEqual(["user"])
    expect(parsed.data["allowed-tools"]).toEqual(["read", "exec"])
    expect(parsed.body).toContain("Body.")
  })

  test("removes stale skill directories not in the current bundle", async () => {
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "devin-src-"))
    const skillDir = await writeSkill(sourceRoot, "keep", "---\nname: keep\ndescription: \"Keep\"\n---\n\nKeep.\n")

    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "devin-out-"))
    // Pre-populate a stale skill dir that should be swept on re-write.
    await fs.mkdir(path.join(outputRoot, "skills", "stale", "references"), { recursive: true })
    await fs.writeFile(path.join(outputRoot, "skills", "stale", "SKILL.md"), "stale\n")

    const bundle: DevinBundle = {
      pluginName: "compound-engineering",
      manifest: { name: "compound-engineering", version: "1.0.0" },
      skillDirs: [{ name: "keep", sourceDir: skillDir }],
    }

    await writeDevinBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "skills", "stale"))).toBe(false)
    expect(await exists(path.join(outputRoot, "skills", "keep", "SKILL.md"))).toBe(true)
  })

  test("copies skill sidecar directories (references/, scripts/)", async () => {
    const sourceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "devin-src-"))
    const skillDir = path.join(sourceRoot, "ce-debug")
    await fs.mkdir(path.join(skillDir, "references"), { recursive: true })
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "---\nname: ce-debug\ndescription: \"Debug\"\n---\n\nBody.\n")
    await fs.writeFile(path.join(skillDir, "references", "guide.md"), "# Guide\n")

    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "devin-out-"))
    const bundle: DevinBundle = {
      pluginName: "compound-engineering",
      manifest: { name: "compound-engineering", version: "1.0.0" },
      skillDirs: [{ name: "ce-debug", sourceDir: skillDir }],
    }

    await writeDevinBundle(outputRoot, bundle)

    expect(await exists(path.join(outputRoot, "skills", "ce-debug", "references", "guide.md"))).toBe(true)
  })
})
