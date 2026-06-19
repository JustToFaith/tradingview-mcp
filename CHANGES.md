# Changes

Local modifications to the upstream `tradesdontlie/tradingview-mcp` fork.

Most-recent first. Newest at top, oldest at bottom. One line per change; longer rationale goes in commit messages or PR descriptions.

## 2026-06-15
- Initial fork from upstream at commit `4795784`
- Added `repository`, `homepage`, `bugs` fields to `package.json` (npm spec; points at this fork)
- Added fork declaration to top of `README.md`
- Created this `CHANGES.md` to track local divergence

### Local bug fixes (not from upstream PRs)
Root causes documented in `trading-system` repo:
`research/momentum/research-inputs/tradingview-issues-handoff.md`.

- **Bug 1 — `tv data strategy|trades|equity` reads nothing / crashes**
  (`src/core/data.js`, `getStrategyResults` / `getTrades` / `getEquity`).
  Upstream filter was `metaInfo().is_price_study === false`, which matches most
  indicators, so the code grabbed a non-strategy study and then crashed reading
  its `_reportData` (`Cannot read properties of undefined`). Fixed filter to the
  correct TV flag `metaInfo().isTVScriptStrategy`; reads now use the private
  `_reportData` / `_performance` / `_ordersData` / `_tradesData` / `_equityData`
  props behind try/catch guards (the public getters are observables that throw on
  empty values). Commit `6c40f0f` + `22967ee`.
  Verification: **filter logic + crash-safety verified at runtime**. Confirmed
  via `chart.model().model().dataSources()` (the same path `data.js` uses) that a
  real `strategy()` study (TSMOM_12_1_test) is correctly matched by
  `isTVScriptStrategy` while indicators are excluded, and that `tv data strategy`
  returns `{success:true, metric_count:0}` instead of throwing on a null report.
  Full data-read e2e (non-null Net Profit / trades / equity) is **blocked by
  Bug 3**, not by this code: `s.reportData()` returns null because no strategy is
  activated on the backtest engine — the Strategy Tester panel itself reads
  "add a strategy to this chart". Bug 1's read path is sound; it simply cannot
  be exercised end-to-end over CDP until a strategy is running, which Bug 3
  prevents.
- **Bug 2 — `tv pine save` sends Ctrl+S on macOS** (`src/core/pine.js`).
  macOS TradingView only saves on Cmd+S; upstream hardcoded `modifiers: 2`
  (Ctrl), so save was a no-op on mac. Added `process.platform === 'darwin'`
  detection → `modifiers: 4` (Meta/Cmd). Commit `6c40f0f`.
  Verification: **verified at runtime** — `tv pine save` on an existing script
  returns `{success:true, action:"Cmd+S_dispatched"}` (was `Ctrl+S_dispatched`).
- **Bug 3 — cannot add a `strategy()` to the chart via CDP** (not fixed).
  TradingView blocks strategy (but not indicator) insertion over the CDP
  untrusted-input path: `tv indicator add "<Strategy>"` returns
  `{success:false, new_study_count:0}`. Confirmed live. This is a TV-side
  security restriction, not a code bug — left as-is, documented so callers know
  to add strategies manually in the Desktop UI.

- **Bug 4 — Chinese (zh-Hans) TradingView UI: several UI-automation buttons
  silently fail** (`src/core/ui.js`, `alerts.js`, `watchlist.js`, `pine.js`,
  `health.js`; new `src/core/locale.js`).
  Root cause: selectors hardcoded to English DOM (`aria-label="Create Alert"`,
  `aria-label="Add symbol"`, `text === 'Save'`, `/open anyway|don't save/i`,
  `data-name="alerts-button"` etc). On cn.tradingview.com (lang=`zh-Hans`):
  aria-labels are localized (`创建警报` / `添加商品代码`), some elements carry no
  `data-name` at all, and the data-name values that DO exist drifted (`base`
  instead of `base-watchlist-widget-button`, `alerts` instead of `alerts-button`).
  Fix — three layers, in priority order:
    1. **Prefer `data-name`** (language-independent TradingView IDs) when present.
    2. **Per-locale aria-label fallbacks** — `LOCALE_LABELS` / `LOCALE_BUTTONS`
       maps in `locale.js` carry both zh-Hans and en variants.
    3. **Click/find text matcher upgraded** to exact → startsWith → contains
       (case-insensitive), scoped to interactive elements first, so nested
       container divs don't get clicked instead of the real button.
  Also: dialog button regexes bilingual (`Save|Save Script|保存|保存脚本`,
  `open anyway|don't save|discard|仍然打开|不保存|放弃`).
  Verified live against cn.tradingview.com: `tv ui panel alerts/watchlist` open
  via aria-label `警报` + data-name `alerts`; `tv ui click -b aria-label -v 警报`
  hits; `tv ui click -b data-name -v alerts` hits. `locale.js` importable;
  bilingual regex unit checks pass (`Save` ✓, `保存` ✓, `保存脚本` ✓,
  `compile errors` ✓, `编译错误` ✓).

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
