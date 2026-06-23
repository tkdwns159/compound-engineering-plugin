import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_DIR = path.join(process.cwd(), "skills/ce-work")
const SKILL_BODY = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")

describe("ce-work SKILL.md", () => {
  // R2: Step 2 handles branch creation for the current-checkout path only and
  // does not offer a worktree option. The worktree decision moved to Step 4
  // (R1) so that in dispatch mode the orchestrator stays on the Step 2 branch
  // instead of cd-ing into a worktree that file operations cannot follow.
  test("Step 2 does not offer a worktree option", () => {
    expect(
      SKILL_BODY.includes("skill: ce-worktree"),
      "ce-work/SKILL.md Step 2 must not invoke `skill: ce-worktree` — the worktree decision moved to Step 4 (R1/R2).",
    ).toBe(false)
    expect(
      /Option B: Use a worktree/i.test(SKILL_BODY),
      "ce-work/SKILL.md must not contain 'Option B: Use a worktree' — Step 2 is branch-only now (R2).",
    ).toBe(false)
    expect(
      /Option C: Continue on the default branch/i.test(SKILL_BODY),
      "ce-work/SKILL.md must not retain 'Option C: Continue on the default branch' — the old Option C was renumbered to Option B when the worktree option was removed (R2).",
    ).toBe(false)
  })

  test("Step 2 still offers branch creation and continue-on-default", () => {
    expect(
      /Option A: Create a new branch/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 2 must still offer Option A (create new branch).",
    ).toBe(true)
    expect(
      /Option B: Continue on the default branch/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 2 must offer Option B (continue on default) — the old Option C was renumbered when the worktree option was removed.",
    ).toBe(true)
  })

  test("Step 2 notes that worktree isolation is decided in Step 4", () => {
    expect(
      /worktree isolation.*Step 4/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 2 must note that worktree isolation, if needed, is decided in Step 4 — not silently dropped when the Option B worktree block was removed.",
    ).toBe(true)
  })

  // R6: The skill detects whether the harness supports reliable CWD switching
  // before offering the inline+worktree path. Without this gate, the inline
  // +worktree path regresses to the original broken behavior (worktree created
  // but unused because file operations cannot follow the cd).
  test("Step 4 contains a CWD-switching capability-detection subsection", () => {
    expect(
      /Capability detection.*CWD switching/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must contain a capability-detection subsection naming CWD switching (R6).",
    ).toBe(true)
    expect(
      /reliable CWD switching/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must reference 'reliable CWD switching' so the agent distinguishes a propagating cd from a shell-only cd.",
    ).toBe(true)
    expect(
      /Unknown harnesses default to unreliable/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must default unknown harnesses to unreliable CWD switching so the fallback paths are offered (R6).",
    ).toBe(true)
  })

  // R3/R4/R7: Step 4 offers three mutually exclusive paths. The flat matrix
  // (KTD2) avoids a nested capability tree that is harder for the agent to
  // render across harnesses.
  test("Step 4 contains the three-path decision matrix", () => {
    expect(
      /Inline\+worktree/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must contain the 'Inline+worktree' path (R3).",
    ).toBe(true)
    expect(
      /Inline-on-current-branch/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must contain the 'Inline-on-current-branch' fallback path (R3/R7).",
    ).toBe(true)
    expect(
      /Dispatch-worker-into-worktree/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must contain the 'Dispatch-worker-into-worktree' path (R4).",
    ).toBe(true)
  })

  test("Step 4 gates inline+worktree on reliable CWD switching", () => {
    expect(
      /Inline\+worktree.*CWD switching is reliable/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must state that the inline+worktree path is chosen only when CWD switching is reliable (R3/R6).",
    ).toBe(true)
  })

  // R4: In dispatch mode, the orchestrator never enters a worktree. This is
  // the core fix — the orchestrator stays on the Step 2 branch while worker
  // subagents get their own per-agent worktree isolation.
  test("Step 4 states the orchestrator-stays-put rule for dispatch mode", () => {
    expect(
      /orchestrator never enters a worktree/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must state that the orchestrator never enters a worktree in dispatch mode (R4).",
    ).toBe(true)
  })

  // R5: The Step 2 branch serves as the integration branch for worker merges
  // in dispatch mode. Without this rule, the integration point is ambiguous.
  test("Step 4 names the Step 2 branch as the integration branch", () => {
    expect(
      /Step 2 branch is the integration branch/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must state that the Step 2 branch is the integration branch for worker merges in dispatch mode (R5).",
    ).toBe(true)
  })

  // Preserve existing dispatch mechanics — the restructure must not drop the
  // Parallel Safety Check, subagent isolation, or shared-directory fallback.
  test("Step 4 preserves the Parallel Safety Check", () => {
    expect(
      /Parallel Safety Check/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must still contain the Parallel Safety Check.",
    ).toBe(true)
  })

  test("Step 4 preserves subagent isolation instructions", () => {
    expect(
      /Subagent isolation/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must still contain the Subagent isolation section.",
    ).toBe(true)
  })

  test("Step 4 preserves shared-directory fallback constraints", () => {
    expect(
      /Shared-directory fallback constraints/i.test(SKILL_BODY),
      "ce-work/SKILL.md Step 4 must still contain the Shared-directory fallback constraints section.",
    ).toBe(true)
  })
})

describe("ce-work-beta SKILL.md mirrors ce-work Step 2/Step 4 structure", () => {
  // KTD4: ce-work-beta mirrors ce-work's Step 2 and Step 4 structure. The
  // mirroring is not enforced by pipeline-review-contract.test.ts (that test
  // guards review/commit delegation, residual gate sentinel, and testing
  // deliberation — not Step 2/Step 4 structure). This test guards the
  // structural mirror directly so the two skills cannot silently drift.
  const BETA_BODY = readFileSync(
    path.join(process.cwd(), "skills/ce-work-beta/SKILL.md"),
    "utf8",
  )

  test("Step 2 does not offer a worktree option", () => {
    expect(
      BETA_BODY.includes("skill: ce-worktree"),
      "ce-work-beta/SKILL.md Step 2 must not invoke `skill: ce-worktree` — mirrors ce-work (R1/R2).",
    ).toBe(false)
    expect(
      /Option B: Use a worktree/i.test(BETA_BODY),
      "ce-work-beta/SKILL.md must not contain 'Option B: Use a worktree' — mirrors ce-work (R2).",
    ).toBe(false)
  })

  test("Step 2 still offers branch creation and continue-on-default", () => {
    expect(
      /Option A: Create a new branch/i.test(BETA_BODY),
      "ce-work-beta/SKILL.md Step 2 must still offer Option A (create new branch).",
    ).toBe(true)
    expect(
      /Option B: Continue on the default branch/i.test(BETA_BODY),
      "ce-work-beta/SKILL.md Step 2 must offer Option B (continue on default).",
    ).toBe(true)
  })

  test("Step 4 contains the three-path decision matrix", () => {
    expect(
      /Inline\+worktree/i.test(BETA_BODY),
      "ce-work-beta/SKILL.md Step 4 must contain the 'Inline+worktree' path.",
    ).toBe(true)
    expect(
      /Inline-on-current-branch/i.test(BETA_BODY),
      "ce-work-beta/SKILL.md Step 4 must contain the 'Inline-on-current-branch' path.",
    ).toBe(true)
    expect(
      /Dispatch-worker-into-worktree/i.test(BETA_BODY),
      "ce-work-beta/SKILL.md Step 4 must contain the 'Dispatch-worker-into-worktree' path.",
    ).toBe(true)
  })

  test("Step 4 states the orchestrator-stays-put rule", () => {
    expect(
      /orchestrator never enters a worktree/i.test(BETA_BODY),
      "ce-work-beta/SKILL.md Step 4 must state the orchestrator-stays-put rule (R4).",
    ).toBe(true)
  })

  // ce-work-beta has additional Codex delegation content in Step 4 that
  // ce-work does not. The restructure must preserve it, not delete it.
  test("Step 4 preserves the Codex delegation routing gate", () => {
    expect(
      /Delegation routing gate/i.test(BETA_BODY),
      "ce-work-beta/SKILL.md Step 4 must still contain the Codex delegation routing gate — the restructure must not delete beta-specific content.",
    ).toBe(true)
  })
})
