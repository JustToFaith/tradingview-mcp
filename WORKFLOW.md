# Maintenance Workflow

Two ongoing workflows for this fork. Both are **manual** — no automation, no webhooks, no scheduled syncs. Run them when you decide to.

## 1. Sync upstream updates

When upstream `tradesdontlie/tradingview-mcp` has new merged commits you want.

```bash
cd ~/Project/tradesdontlie-tradingview-mcp   # the dev checkout
git checkout main
git fetch upstream
git log upstream/main ^main                   # see what upstream has that you don't
```

For each interesting commit:
```bash
git cherry-pick <sha>
npm test                                     # verify nothing broke
git push origin main
cd ~/tools/tradesdontlie-tradingview-mcp    # sync runtime
git fetch origin && git reset --hard origin/main
```

If cherry-pick conflicts, resolve manually or skip. Record what you took in `CHANGES.md`.

## 2. Adopt stuck upstream PRs

When upstream has open PRs the author hasn't merged (the author is slow to merge — there are usually 20+ open at any time).

```bash
gh pr list --repo tradesdontlie/tradingview-mcp --state open
```

For each PR, evaluate against three criteria:

| Criterion | Question |
|-----------|----------|
| Real problem? | Is the bug reproducible, not theoretical? |
| Sound solution? | Scoped to the bug, no side effects? |
| Relevant here? | Works on macOS, matches how I use it? |

**Adopt** (cherry-pick the PR's diff into this fork):

```bash
gh pr diff <num> --repo tradesdontlie/tradingview-mcp > /tmp/pr-<num>.patch
git apply /tmp/pr-<num>.patch
# or: git am if it's a series with commit messages
npm test
git commit -m "fix: adopt upstream PR #<num> — <title>"
git push origin main
```

If a PR is from a contributor's fork, you may need `gh pr checkout <num>` to get the actual commits, then cherry-pick the local branch.

**Skip** PRs that:
- Are Windows-only (this fork runs on macOS)
- Add features/examples that aren't a bug fix
- Have questionable solutions (judgment call)

Record every adopted PR in `CHANGES.md`:
```
- Adopted upstream PR #228 (fix "evaluate is not defined" in scroll/symbolInfo)
```

## Decision quick-reference

| PR kind | Action |
|---------|--------|
| Real bug, sound fix, macOS-relevant | Adopt |
| Real bug, sound fix, Windows-only | Skip (not relevant here) |
| Real bug, but I have a better solution | Write a new commit, skip the PR |
| New feature / example config | Skip (out of scope) |
| Test infra / docs cleanup | Adopt only if it benefits our test runs |

## Reference: typical upstream state

- Author commits roughly monthly
- 20+ open PRs at any time
- Many Windows-compatibility PRs (skipped here)
- Bug fixes for `evaluate is not defined`, CDP injection, etc. are usually safe to adopt
