# GitHub Reuse Survey

## Recommendation

Keep OpenPets' Electron runtime and reuse formats, diagnostics, and asset tooling
before adopting another renderer. The current CSS-sprite implementation is small
and tested; replacing it with Tauri, WPF, PixiJS, or a native puppet engine would
add migration cost without solving an observed bottleneck.

## Priority 0: Reuse Soon

| Project | What OpenPets should reuse | Integration approach |
| --- | --- | --- |
| [Clawd on Desk](https://github.com/rullerzhou-afk/clawd-on-desk) | Codex hook health checks, JSONL fallback ideas, theme import/validation, edge mini-mode and multi-display cases | Port isolated behavior and tests. Its code is AGPL-3.0, while artwork has separate restrictions; either adopt compatible project licensing before copying code or reimplement the documented behavior cleanly. |
| [CoPet](https://github.com/ChanceYu/CoPet) | Sound-pack manifest, richer pointer interactions, agent-adapter test cases, local backup conventions | Reuse MIT-licensed schemas and small utilities where they fit the existing package boundaries. Do not import the Tauri runtime. |
| [Petdex](https://github.com/crafter-station/petdex) | Stable pet manifest endpoint and common spritesheet formats | Add an optional catalog adapter in `@open-pets/install-pet`; preserve OpenPets' existing catalog contract. |
| [Aseprite CLI](https://github.com/aseprite/docs/blob/main/cli.md) | Deterministic spritesheet export, tags, layers, and metadata | Add an optional developer command that validates and converts source artwork. Keep Aseprite external rather than a runtime dependency. |

The first practical experiment should be a **Codex Hook Doctor** view in Control
Center. It can expose whether hooks are installed, reviewed, executable, and
currently producing reactions, building on `@open-pets/codex` rather than adding
another background service.

## Priority 1: Borrow Selectively

- [AgentPet](https://github.com/ntd4996/agentpet) offers a useful session model:
  project, agent state, elapsed time, and a universal wrapper. Reuse the model if
  OpenPets adds a multi-agent activity panel; defer token dashboards and hosted
  services.
- [rembg](https://github.com/danielgatis/rembg) can remove image backgrounds in
  an optional offline asset-preparation command. Its model cache is large, so it
  should live outside the app and under a configurable `D:` cache on Windows.
- [VPet](https://github.com/LorisYounger/VPet) is a strong reference for
  interaction/state taxonomies and mod boundaries. Its WPF runtime is not a fit,
  and animation assets have terms separate from the Apache-2.0 source license.
- [WindowPet](https://github.com/SeakMengs/WindowPet) is useful as a behavioral
  checklist for click-through, multi-pet, autostart, updates, and custom pets.

## Priority 2: Defer Until a Measured Need

- [PixiJS](https://github.com/pixijs/pixijs) should be considered only after a
  benchmark shows CSS sprites cannot support the target pet count or effects.
- [Inochi2D](https://github.com/Inochi2D/inochi2d) belongs in a future optional
  renderer plugin, not the desktop core, because it introduces a native runtime.
- [MiniCPM Desk Pet](https://github.com/OpenBMB/MiniCPM-Desk-Pet) demonstrates
  local-model narration and idle alerts. Add those later through the existing AI
  gateway/provider layer instead of bundling a multi-gigabyte model.
- [Lively Wallpaper](https://github.com/rocksdanister/lively) is relevant only
  if OpenPets adds a wallpaper mode. Its fullscreen, battery, and remote-desktop
  pause policies are worth copying as requirements, not as a dependency.

## Proposed Experiments

1. **Codex Hook Doctor (1-2 days):** surface install/review/runtime health and
   add regression fixtures based on Clawd on Desk's failure cases.
2. **Pet asset pipeline (2-3 days):** add Petdex import plus optional Aseprite
   conversion and structural validation.
3. **Sound packs (2-3 days):** define an event-to-audio manifest compatible
   with OpenPets reactions, using CoPet's format as the starting point.

Do not copy artwork merely because a repository's source code is open. Verify
code, asset, model, and submitted-user-content licenses independently before
shipping each imported artifact.
