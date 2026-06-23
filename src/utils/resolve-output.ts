import path from "path"
import type { TargetScope } from "../targets"
import { resolveOpenCodeGlobalRoot } from "./opencode-config"

export function resolveTargetOutputRoot(options: {
  targetName: string
  outputRoot: string
  codexHome: string
  piHome: string
  pluginName?: string
  hasExplicitOutput: boolean
  scope?: TargetScope
}): string {
  const { targetName, outputRoot, codexHome, piHome, hasExplicitOutput } = options
  if (targetName === "codex") return codexHome
  if (targetName === "pi") return piHome
  if (targetName === "gemini") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".gemini")
  }
  if (targetName === "kiro") {
    const base = hasExplicitOutput ? outputRoot : process.cwd()
    return path.join(base, ".kiro")
  }
  if (targetName === "devin") {
    // The Devin writer produces a self-contained plugin *source* bundle
    // (`.devin-plugin/plugin.json` + `skills/`) that the user installs with
    // `devin plugins install <path>`. With an explicit --output, honor it as
    // the plugin root. Without one, default to a build artifact directory so
    // the bundle does not collide with Devin's own `.devin/` project config.
    return hasExplicitOutput ? outputRoot : path.join(process.cwd(), ".devin-dist")
  }
  if (targetName === "opencode") {
    // Without an explicit --output, default to the OpenCode global-config root
    // (OPENCODE_CONFIG_DIR or ~/.config/opencode). With an explicit --output,
    // honor it as a workspace root and let the writer nest under .opencode/.
    if (!hasExplicitOutput) return resolveOpenCodeGlobalRoot()
    return outputRoot
  }
  return outputRoot
}

/**
 * Returns "global" when the OpenCode writer should use the flat global-config
 * layout (no `.opencode/` nesting). This is the case when the user did not
 * pass `--output` and did not pass an explicit `--scope`. Returns the
 * caller's requested scope otherwise so explicit `--scope workspace` still
 * wins.
 */
export function resolveOpenCodeWriteScope(
  hasExplicitOutput: boolean,
  requestedScope: TargetScope | undefined,
): TargetScope | undefined {
  if (requestedScope !== undefined) return requestedScope
  if (!hasExplicitOutput) return "global"
  return undefined
}
