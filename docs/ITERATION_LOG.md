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
