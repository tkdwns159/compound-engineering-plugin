---
name: ce-worktree
description: Ensure work happens in an isolated git worktree without disturbing the current checkout. Use when starting work that should stay isolated, or when `ce-work` offers a worktree option at Step 4 (execution strategy). Detects existing isolation first, prefers the harness's native worktree tool, and falls back to plain git.
---

# Worktree Isolation

Ensure the current work happens in an isolated workspace, without disturbing the user's main checkout. Most coding harnesses now create a worktree by default at session start, so the common case is that **isolation already exists** — detect that first and do not create a redundant one.

Order of operations: **detect existing isolation -> prefer a native worktree tool -> fall back to plain git.** Never create a worktree the harness cannot see.

## Step 0: Detect existing isolation

Before creating anything, check whether the current directory is already a linked worktree. Compare the **resolved absolute** git dir against the **resolved absolute** common git dir — resolve each to an absolute path first and compare those, not the raw `git rev-parse` output. Git mixes absolute and relative forms depending on the current directory (from a subdirectory of a normal checkout, `--git-dir` comes back absolute while `--git-common-dir` may be relative), so a raw string compare yields a false "already isolated":

```bash
git rev-parse --absolute-git-dir                     # absolute git dir for this worktree
(cd "$(git rev-parse --git-common-dir)" && pwd -P)   # absolute shared (common) git dir
```

If the two absolute paths are **equal**, this is a normal checkout — continue to Step 1.

If they **differ**, you are in a linked worktree *or* a submodule. Distinguish them:

```bash
git rev-parse --show-superproject-working-tree
```

- **Non-empty** output -> you are in a submodule; treat it as a normal checkout and continue to Step 1.
- **Empty** output -> you are **already in an isolated worktree**. Report the worktree path (`git rev-parse --show-toplevel`) and current branch, and **work in place**. Do not create another worktree — a worktree-from-worktree lands in the wrong tree and is invisible to the harness that made the current one.

## Step 1: Prefer the harness's native worktree tool

If the harness provides a native worktree primitive — for example an `EnterWorktree` / `WorktreeCreate` tool, a `/worktree` command, or a `--worktree` flag — use it and stop. Native tools place, track, and clean up the worktree so the harness can manage it. A behind-the-back `git worktree add` creates phantom state the harness cannot see, navigate to, or clean up.

## Step 2: Git fallback

Only when there is no native tool **and** Step 0 found no existing isolation.

1. **Run from the repo root.** The `.worktrees/` and `.gitignore` paths below are repo-root-relative, but the skill runs from the user's current directory, which may be a subdirectory — so move to the root first: `cd "$(git rev-parse --show-toplevel)"`. Without this, `.worktrees/<branch>` and the `.gitignore` edit would land in the subdirectory (e.g. `src/.worktrees/...`, `src/.gitignore`) instead of at the repo root.
2. Choose a meaningful branch name from the work description (e.g. `feat/login`, `fix/email-validation`) — avoid opaque auto-generated names. Pick a base branch (default: origin's default branch, else `main`).
3. **Ensure `.worktrees/` is gitignored before creating anything**, so worktree contents are never committed: check `git check-ignore -q .worktrees/` — **with the trailing slash**, so an existing directory-only `.worktrees/` rule is honored even before the directory exists (`git check-ignore .worktrees` without the slash would miss it and dirty a correctly-configured repo). If it is not ignored, add a `.worktrees/` line to `.gitignore`.
4. Best-effort refresh the base branch without disturbing the current checkout: `git fetch origin <from-branch>`. This is **non-fatal** — if it errors (no `origin` remote, a differently-named remote, or a local-only branch), do not abort; continue to the next step and use the local ref.
5. Create the worktree from the remote base when available, else the local ref: `git worktree add -b <branch-name> .worktrees/<branch-name> origin/<from-branch>`. If `origin/<from-branch>` does not exist, use the local `<from-branch>` ref instead.
6. Switch into it: `cd .worktrees/<branch-name>`.

If `git worktree add` fails with a sandbox or permission error, the requested isolation could not be created. This needs a **blocking** user decision before touching the current checkout — do not silently continue there (the user chose isolation specifically to avoid it, especially when `ce-work` routed here for the inline+worktree path). Report the failure and ask via the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (via the `pi-ask-user` extension) — offering options such as "work in the current checkout" vs "stop and resolve the permission issue". If no blocking tool exists in the harness or the call errors, present the numbered options in chat and wait for the reply; never skip the confirmation. Only work in the current checkout on explicit confirmation, and do not retry alternative paths automatically.

## Other worktree operations

Use `git` directly — no wrapper is needed:

```bash
git worktree list                          # list worktrees
git worktree remove .worktrees/<branch>    # remove a worktree
cd .worktrees/<branch>                     # switch to a worktree
cd "$(git rev-parse --show-toplevel)"      # return to the current checkout root
```

## Merge-back and cleanup (after work finishes)

When the work in a **git-fallback worktree** (created in Step 2) is complete and the branch has been pushed / a PR opened, merge the worktree's branch back into its base branch locally and reclaim the worktree. This keeps the PR-based flow intact — the remote branch stays open for the PR — while folding the work into the local base branch and freeing the worktree's disk space.

**Skip this entirely for:**
- **Harness-native worktrees (Step 1)** — the harness owns their lifecycle; a behind-the-back merge/remove creates phantom state it cannot see.
- **Pre-existing isolation detected in Step 0** — you did not create it, so do not tear it down. Work in place and let the owner manage cleanup.

**Only run this for a `.worktrees/<branch>` worktree you created via the Step 2 git fallback, and only after the branch is pushed (and a PR opened, if the calling flow creates one).** Never run it mid-work or before the branch is pushed — deleting the local branch before the push loses the work.

Order of operations — **merge -> test -> remove worktree -> delete local branch** — with a hard rule: any failure aborts the merge-back but still reclaims the worktree; never force a merge or force-delete a branch to complete cleanup.

1. **Verify the work is shipped from the worktree.** From the worktree root, confirm the working tree is clean (`git status --porcelain`) and the branch is pushed (`git rev-parse --abbrev-ref --symbolic-full-name @{u}` resolves and `git status -sb` shows no unpushed commits). If there are uncommitted changes, commit or stash first. If the branch is not yet pushed, stop here and push (or let the calling flow's `ce-commit-push-pr` handle it) before continuing.

2. **Capture the worktree branch name and resolve the base branch.** Record the current branch name (`git branch --show-current`) before leaving the worktree. Re-derive the base branch with the same logic as Step 2 — origin's default branch, else `main`:
   ```bash
   base=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
   [ -z "$base" ] && base=$(git rev-parse --verify origin/main >/dev/null 2>&1 && echo main || echo master)
   ```

3. **Return to the main checkout and switch to the base branch.** The main checkout is the parent of the common git dir:
   ```bash
   common_git_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
   main_root=$(dirname "$common_git_dir")
   cd "$main_root"
   git switch "$base"
   ```
   If `git switch` fails because the main checkout has uncommitted changes or an in-progress operation, **abort the merge-back** (skip to step 6) — do not disturb the user's main checkout. The PR remains the integration path; the worktree can still be reclaimed.

4. **Merge the worktree branch with `--no-ff`** so the branch topology is preserved:
   ```bash
   git merge --no-ff "<worktree-branch>"
   ```
   **On conflict: `git merge --abort` immediately.** Do not hand-resolve — a silent side-pick discards one side's intent. Abort the merge-back and skip to step 6 (reclaim the worktree; leave the local branch for the PR). Report the conflict to the user so they can merge manually if they want the local base branch updated.

5. **Run the project test suite** on the merged tree. If tests fail, diagnose and fix in the base branch, or `git reset --hard HEAD~1` to drop the merge commit and skip the local merge-back (the PR still carries the work). Do not leave the base branch red.

6. **Reclaim the worktree** (run this in all cases — success or aborted merge-back):
   ```bash
   # Still in the main checkout root
   git worktree remove ".worktrees/<worktree-branch>"
   ```
   If removal refuses because the worktree has untracked/modified files, do **not** force (`--force`) without surfacing it — report the state and let the user decide. The worktree dir is gitignored, so leftover contents do not dirty the repo.

7. **Delete the local branch only if the merge-back succeeded.** The remote branch stays for the PR; this only drops the local ref:
   ```bash
   git branch -d "<worktree-branch>"     # -d refuses unmerged branches — the safety we want
   ```
   If the merge-back was aborted (steps 3-5 bailed out), **skip this** — do not use `-D`. Leave the local branch ref; it is harmless and the PR needs the remote branch regardless.

8. **Report.** State whether the local base branch was updated with the merge, the worktree was removed, and whether the local branch was deleted or left in place. Remind the user the PR (if opened) is still the canonical integration path on the remote branch.

## When to create a worktree

Create one (Step 1/2) only when you are **not** already isolated and you need a separate workspace:

- Reviewing a PR while keeping the current checkout free for other work
- Running multiple features in parallel without branch-switching overhead

Do not create a worktree for single-task work that can happen on a branch in the current checkout — and never when Step 0 shows you are already in one.

## Integration

`ce-work` offers this skill as an option at Step 4 (execution strategy). When the user selects the inline+worktree path in that flow, run Step 0 first: if the work is already isolated, proceed in place; otherwise create one (native tool preferred) with a meaningful branch name derived from the work description.

`ce-work` (Phase 4) and `lfg` (after the PR step) invoke the **Merge-back and cleanup** flow above once the branch is pushed / the PR is opened, so a git-fallback worktree is folded into the local base branch and reclaimed automatically at the end of the run. Harness-native and pre-existing worktrees are left untouched.

## Troubleshooting

**"Worktree already exists"**: the path is in use. Switch to it (`cd .worktrees/<branch>`) or remove it (`git worktree remove .worktrees/<branch>`) before recreating.

**"Cannot remove worktree: it is the current worktree"**: `cd` out of the worktree first, then `git worktree remove`.
