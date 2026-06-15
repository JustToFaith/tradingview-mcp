# Changes

Local modifications to the upstream `tradesdontlie/tradingview-mcp` fork.

Most-recent first. Newest at top, oldest at bottom. One line per change; longer rationale goes in commit messages or PR descriptions.

## 2026-06-15
- Initial fork from upstream at commit `4795784`
- Added `repository`, `homepage`, `bugs` fields to `package.json` (npm spec; points at this fork)
- Added fork declaration to top of `README.md`
- Created this `CHANGES.md` to track local divergence

### Adopted upstream PRs (batch + manual)
Batch cherry-pick (all 10 clean, no conflicts):
- #228 — fix "evaluate is not defined" in `scrollToDate` / `symbolInfo`
- #230 — fix drawing tools "getChartApi is not defined"
- #227 — fix `createStudy` indicator inputs being silently ignored
- #250 — make CDP port configurable via `CDP_PORT` env var
- #257 — `quote_get` refuses symbol mismatch instead of returning wrong tick
- #242 — fix outdated tool/test counts in docs
- #239 — sync `package-lock.json` with `tv` bin entry
- #235 — add S/R + Price Action Signals Pine indicator
- #252 — add crypto swing-trading `rules.example.json`
- #241 — add crypto swing-trading example config

Manual conflict resolution:
- #225 — `chart_set_right_offset` for future/projection space
  (core/chart.js conflict from prior #228 changes; inserted `setRightOffset` by hand
  after `setVisibleRange`, then patched the MCP tool registration in tools/chart.js
  and the unit test)

### Skipped upstream PRs (with reason)
- #234, #231 — both add `rules.json` for USA/Canada / crypto swing trading rules.
  Conflicts with #252/#241 which already added `rules.example.json` of the same
  intent. Keeping the example variant is sufficient; not adding both.
- #226 — `orchestrator/` research orchestration subsystem (15771 lines, 57 files,
  incl. binary PNGs). Out of scope for this fork (no orchestrator/strategy work in
  the fork's roadmap). Size + binary assets also make it unmaintainable if we
  cherry-pick.
- #238 — e2e test patches + IBKR MGC bot/dashboard (Python). IBKR integration
  is not used in this fork; e2e test file already touched by #242, so re-applying
  the patch would conflict for low value.
- #254, #251, #245, #243, #237, #233, #246, #256 — Windows MSIX/Store install
  path / Windows-only crash fixes. Not relevant (macOS-only fork).
- #244, #248, #249 — UI automation / `createStudy` / bottom-panel fixes. The
  problem spaces are real but not in this fork's daily workflow.
- #229, #253 — test script / test count updates. Lower priority; not adopted
  in this round.
- #255 — cross-symbol `quote_get` / `draw_list` / silent Pine compile errors.
  Functionally overlaps with #228 + #230 + #227 already adopted.
- #232 — `initclaude` PR with vague title; unclear value, skipped.
- #240 (and others not enumerated) — see `gh pr list --repo tradesdontlie/tradingview-mcp`
  for full upstream state.
