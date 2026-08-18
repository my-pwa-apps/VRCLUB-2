# Documentation

The **[README](../README.md)** is the entry point and the only guide guaranteed to
match the code. Everything here is supplementary.

## Current

- [Performance baseline](PERFORMANCE_BASELINE.md) — measured frame budgets.

## Archived

These describe an earlier architecture and are kept for historical context only.
Do not treat them as a specification; where they disagree with the code, the code
wins. Several predate the graphics-tier system, the ShowDirector cue engine and the
extraction of the LED patterns into `js/ledPatterns.js`.

- [Design decision: hyperrealism vs. performance](DESIGN_DECISION_HYPERREALISM_VS_PERFORMANCE.md)
  — the reasoning still holds, but the specific numbers (e.g. mirror-ball spot counts)
  were superseded by `qualityTiers` in `js/club/01-core.js`.
- [LED wall](LED_WALL.md) — predates `js/ledPatterns.js`.
- [Lighting troubleshooting](LIGHTING_TROUBLESHOOTING.md) — predates the ShowDirector.
- [VJ controls guide](VJ_CONTROLS_GUIDE.md) — describes 9 in-world buttons at old
  coordinates; the desk now has 12 and `CLUB_POSITIONS` is the source of truth.

Deleted in the 2026-08-18 review because they duplicated the README and were already
self-declared archival: `OPTIMIZATION_PHASE_COMPLETE.md`,
`OPTIMIZATION_IMPLEMENTATION.md`, `PROJECT_SUMMARY.md`, `QUICK_REFERENCE.md`,
`LIGHTING_LED_UPDATES.md`, `EXPERIENCE_GUIDE.md`, `HYPERREALISTIC_FEATURES.md`.
Git history preserves them.

- [VJ controls](VJ_CONTROLS_GUIDE.md)

The root [README](../README.md) is the source of truth for setup, architecture, commands, deployment, and testing. Files labeled **Archived** are point-in-time implementation records retained for historical context; they may describe old commands, line numbers, or behavior.
