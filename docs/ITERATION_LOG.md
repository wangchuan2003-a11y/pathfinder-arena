# Iteration log

## 2026-09-07 — v2.0.0 release candidate

Implemented weighted terrain (1/5/9 entered-cell costs), step traces with current/frontier and g/h/f, three explanatory scenarios, immutable undo/redo, local drafts, v1-compatible/v2 weighted links, JSON and PNG export, validated JSON import, map zoom, touch browsing/drawing modes, precise tap controls and mobile playback dock.

Evidence before publishing: 32 Node tests passed; weighted search verified against an independent oracle on 80 random maps in addition to the original unweighted cases. TypeScript checks cover app and browser tests. Manual browser verification covered startup, detour cost 36, node inspector, draft recovery, 200% map zoom without page overflow and quick single-step. A bounded review found and verified fixes for startup DOM wiring, stroke/undo ordering, stroke/play ordering, delayed import overwrites and cost units. 24 browser cases are ready for CI. Deployment has not yet been verified for this candidate.

CI actions upgraded from the deprecated runtime versions and pinned to commits resolved from official releases. No application backend or external API added.

## Next iteration candidates

Continue only after checking the latest CI/deployment and repository state. Prioritize demonstrated defects over feature count.

1. Verify storage-denied behavior and test persistent draft controls, including an explicit way to discard a local draft without losing export capability.
2. Inspect actual touch scrolling, precision at 300% zoom, keyboard focus visibility and live-region noise. Do not infer accessibility conformance from a screenshot.
3. Add a small bilingual interface only if the existing flows remain understandable and the translation is complete; Chinese should remain the default.
4. Improve onboarding using one observable experiment at a time, preserving the distinction between cost, step count and expanded nodes.
5. Profile actual editing/replay operations before optimizing the DOM. Keep algorithm results and replay timing distinct.

Do not introduce accounts, remote data collection, API credentials, or dependencies without a concrete need. Keep every published increment tested and reversible. Record only verifiable results here.

## 2026-09-07 — v2.0.0 verified, v2.0.1 keyboard follow-up

v2.0.0 commit 9ac70ca passed the complete GitHub Actions run: 32 Node tests, TypeScript app/browser checks, production build, and 24 desktop/mobile browser cases. Pages deployment succeeded. Evidence: https://github.com/wangchuan2003-a11y/pathfinder-arena/actions/runs/34044991527 .

The follow-up fixes numeric tool shortcuts, P and N when the grid itself has keyboard focus. A manual check confirmed selecting sand, applying it and stepping from a focused gridcell. The existing browser scenario now covers this full sequence without adding a duplicate test group. Its new CI and published-site verification are pending; check the newest run before marking this follow-up released.

## 2026-09-07 — v2.0.1 verified and published

Commit d86e02c passed the full pipeline, including 32 core tests and all 24 browser cases with the grid-focus keyboard regression. CI and Pages deployment: https://github.com/wangchuan2003-a11y/pathfinder-arena/actions/runs/34045226503 . The published website was opened successfully; the detour scenario rendered 105 weighted cells and the first A* step showed g=0, h=28, with no browser console errors. This closes the pending verification above.

The next run should work from v2.0.1, the current repository state, and the candidate list above. Do not repeat the completed v2 research or rebuild the existing features.

## 2026-09-07 — v2.1.0 candidate

Added source-preserving Chinese/English DOM localization, independently validated language/zoom/speed preferences, explicit recovery of the draft present when the page opened, and a clear-draft operation that leaves preferences/current map intact. Precise cell selection now survives edits/replays; manual single-step announcements contain both algorithms' current cell and g/h/f values.

Local evidence: 52 pure tests and app/browser TypeScript checks passed. English static leaf text and dynamic result/cell-label translations were inspected in the browser, including switching back to Chinese without losing the map/replay. CI now contains 34 desktop/mobile cases, including language state preservation and draft lifecycle. Await this candidate's CI and deployment before recording it as verified.

## 2026-09-07 — v2.1.0 verified

Commit dc72049 passed 52 pure tests, app/browser TypeScript checks, production build and all 34 desktop/mobile browser cases. Pages deployment succeeded: https://github.com/wangchuan2003-a11y/pathfinder-arena/actions/runs/34046773146 . This closes the v2.1.0 candidate checks above. The bilingual interaction and draft lifecycle were exercised by the new browser scenarios.
