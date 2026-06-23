---
date: 2026-06-24
topic: worktree-orchestrator-stays-put
---

# Worktree Isolation: Orchestrator Stays Put

## Summary

Restructure worktree isolation so the orchestrator only enters a worktree for inline work, and only when the harness supports reliable CWD switching. For subagent dispatch, workers get worktrees while the orchestrator stays in its original directory and branch throughout. The worktree decision moves from environment setup to the execution-strategy step.

## Problem Frame

`ce-worktree` Step 2 instructs the orchestrator to `cd` into the worktree it creates, but in harnesses where the agent's working directory for file operations is managed separately from shell `cd`, the orchestrator creates the worktree and then continues working in the original checkout. The worktree sits unused while the work happens on a branch in the main checkout, defeating the isolation the user asked for.

The worktree decision also fires in `ce-work` Phase 1 Step 2 (environment setup), before the execution strategy is chosen in Step 4. In dispatch mode, the Step 2 worktree is created but unused — subagents get their own per-agent worktrees via the harness primitive, and the orchestrator never needed its own. `ce-worktree` is invoked by `ce-work` at Step 2 today; this change moves that invocation to Step 4, so `ce-worktree` Step 2's cd instruction is reached only when inline+worktree is chosen — not during environment setup.

## Key Decisions

- **Worktree decision moves to the execution-strategy step.** Step 2 handles branch creation for the current-checkout path only. The workspace-isolation decision is made alongside the execution strategy that needs it.
- **Hybrid capability detection for inline+worktree.** The inline+worktree path is offered only when the harness supports reliable CWD switching (native worktree tool or a harness-level directory primitive). Where it doesn't, the user is offered inline-on-current-branch, or dispatch-worker-into-worktree where a subagent primitive is available.
- **Capability reduction for unsupported harnesses is a deliberate trade-off.** For harnesses lacking reliable CWD switching, this change removes the worktree option rather than making the existing broken path functional. Offering a broken worktree path is worse than honestly offering the paths that work.
- **Orchestrator never enters a worktree in dispatch mode.** Workers operate inside their own worktrees; the orchestrator remains in its original directory and branch, serving as the integration point for worker merges.

## Requirements

**Workspace isolation**

- R1. The worktree decision is made in the execution-strategy step, not the environment-setup step.
- R2. Step 2 (environment setup) handles branch creation for the current-checkout path only and does not offer a worktree option.
- R3. In inline mode, the orchestrator may enter a worktree only when the harness supports reliable CWD switching; otherwise the inline-on-current-branch path is offered.
- R4. In dispatch mode, the orchestrator does not enter a worktree. Worker subagents receive their own worktree isolation.
- R5. The orchestrator's Step 2 branch serves as the integration branch for worker merges in dispatch mode.

**Capability detection**

- R6. The skill detects whether the harness supports reliable CWD switching — via a native worktree tool or a harness-level directory primitive that propagates to file operations — before offering the inline+worktree path. If reliable detection cannot be implemented for a given harness, that harness falls back to the dispatch or inline paths. The detection mechanism is a Planning-phase risk that could simplify the design if it proves infeasible.
- R7. When CWD switching is unsupported, the dispatch-worker-into-worktree path is offered as the isolation alternative, subject to subagent primitive availability.

## Scope Boundaries

**Outside this scope**

- Merge-back branch-switching behavior. The main checkout still switches to the base branch during merge-back, unchanged from today.
- Harness-native worktree lifecycle (Step 1). The harness owns creation, navigation, and cleanup; this change does not alter that path.
- Pre-existing isolation detection (Step 0). Work-in-place behavior when already isolated is unchanged.

## Dependencies / Assumptions

- Harness capability detection is itself harness-specific and may need maintenance as targets evolve.
- The dispatch-worker-into-worktree fallback assumes a subagent primitive is available. Harnesses without one cannot use worktree isolation and fall back to inline-on-current-branch.
- If reliable CWD-switching detection proves infeasible for one or more target harnesses, the inline+worktree path is unavailable for those harnesses and users receive the dispatch or inline-on-current-branch fallback. This degrades the isolation value proposition on affected harnesses.

## Outstanding Questions

**Deferred to Planning**

- How should the restructured Step 4 decision matrix render across the multiple target harnesses this plugin ships to (Claude Code, Codex, Devin CLI, Cursor, OpenCode)?
- How to detect a harness-level `cd`/`chdir` primitive that propagates to file operations, distinct from a shell-only `cd` that does not.

## Deferred / Open Questions

### From 2026-06-24 review

- **Dispatch-mode fix and inline+worktree capability detection are bundled but separable; sequencing would deliver value sooner and de-risk the release** — Requirements (P2, product-lens, confidence 75)

  The dispatch-mode changes (R1, R2, R4, R5 — move the worktree decision to Step 4, orchestrator stays put in dispatch) are low-risk and directly fix the stated problem of unused worktrees in dispatch mode. The inline+worktree capability detection (R3, R6, R7) is the complex, risky portion that depends on the unsolved detection problem. Bundling them ties the safe, high-value fix to the risky detection work. If detection proves difficult across harnesses, the dispatch fix is delayed too. Sequencing the dispatch fix first would deliver the core isolation improvement immediately while de-risking the inline detection work.

- **Worst-case fallback chain produces zero behavioral change — complexity may be disproportionate** — Requirements (R3, R7) + Dependencies / Assumptions (P2, adversarial, confidence 75)

  The fallback chain has two independent gates: reliable CWD switching (R3/R6) and subagent primitive availability (R7). When neither is present, the result is inline-on-current-branch — which is exactly today's behavior where "the worktree sits unused while the work happens on a branch in the main checkout." The document lists five target harnesses but never states which have which capabilities. If a meaningful subset lacks both, this restructuring adds a capability-detection layer, a new decision matrix, and a restructured Step 4 — all to arrive at the same outcome for those harnesses. The complexity budget is proportional only if enough harnesses actually have at least one of the two capabilities.
