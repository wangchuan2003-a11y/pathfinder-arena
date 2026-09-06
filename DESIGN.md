# Design

The surface is an interactive comparison arena. A pale page surrounds two dark, equally sized grids, with blue for A* and orange for Dijkstra. The same grid is edited on either side. Shared controls sit outside the paired boards so neither algorithm receives visual priority.

## System
Manrope and JetBrains Mono are self-hosted; CJK text uses the platform sans-serif. Page #f4f4f1, simulation surface #101723, blue #79a8ff, orange #ffb277. Walls and explored cells differ in tone; endpoints also use S/G text. The 35-column grid preserves square cells. Below 700px, the boards stack vertically. Keyboard focus uses an outline and each grid exposes a single Tab entry point.

## Evidence
Manual browser checks covered a complete default-maze run, map editing on both boards, undo, keyboard editing, sharing, and a 390px viewport width check. The screenshots are ordinary viewport captures at the arena scroll position, not evidence of every interaction or device. Algorithm correctness is checked independently against BFS. CI runs browser scenarios on desktop and mobile viewports. Expanded node counts are educational results, not wall-clock benchmarks.
