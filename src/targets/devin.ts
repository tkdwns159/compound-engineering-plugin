import fs from "fs/promises"
import path from "path"
import { copySkillDir, ensureDir, sanitizePathName, writeJson } from "../utils/files"
import { transformContentForDevin } from "../converters/claude-to-devin"
import type { DevinBundle } from "../types/devin"

/**
 * Write a Devin plugin bundle to `outputRoot`.
 *
 * The output is a self-contained plugin source directory:
 *
 *   <outputRoot>/
 *   ├── .devin-plugin/
 *   │   └── plugin.json
 *   └── skills/
 *       └── <skill>/
 *           └── SKILL.md
 *
 * Install it with `devin plugins install <outputRoot>`.
 *
 * Because the output is a dedicated plugin directory (not a shared config
 * tree), stale skill directories from a previous build are removed before
 * writing so re-runs stay idempotent.
 */
export async function writeDevinBundle(outputRoot: string, bundle: DevinBundle): Promise<void> {
  const pluginDir = path.basename(outputRoot) === ".devin-plugin" ? path.dirname(outputRoot) : outputRoot
  const manifestDir = path.join(pluginDir, ".devin-plugin")
  const skillsDir = path.join(pluginDir, "skills")

  await ensureDir(manifestDir)
  await ensureDir(skillsDir)

  await writeJson(path.join(manifestDir, "plugin.json"), bundle.manifest)

  const currentSkills = new Set(bundle.skillDirs.map((skill) => sanitizePathName(skill.name)))
  await removeStaleSkillDirs(skillsDir, currentSkills)

  for (const skill of bundle.skillDirs) {
    const skillName = sanitizePathName(skill.name)
    const targetDir = path.join(skillsDir, skillName)
    await copySkillDir(skill.sourceDir, targetDir, transformContentForDevin)
  }
}

async function removeStaleSkillDirs(skillsDir: string, currentSkills: Set<string>): Promise<void> {
  let entries: import("fs").Dirent[]
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return
    throw err
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (currentSkills.has(entry.name)) continue
    await fs.rm(path.join(skillsDir, entry.name), { recursive: true, force: true })
  }
}
