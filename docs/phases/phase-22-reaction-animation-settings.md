# Phase 22 — Reaction Animation Settings

## Goal

Give users a clear settings screen for choosing which pet animation plays for each OpenPets reaction.

Today the mapping is effectively product-defined in code: a reaction such as `thinking`, `working`, or `success` maps to one universal spritesheet animation state. That default should remain, but users should be able to override the mapping without editing files or guessing what each animation looks like.

The core user experience is a simple settings table with a live default-pet preview so users can understand: **when this reaction happens, my pet will play this animation**.

## Non-goals

- No bubble on/off settings in this phase.
- No status badge on/off settings in this phase.
- No per-agent/per-integration mapping yet.
- No custom animation editor, frame timing editor, or sprite crop editor.
- No new reaction values unless a separate phase expands the public reaction protocol.
- No arbitrary spritesheet format support; this phase uses the existing universal animation states.

## User-visible outcome

Add a settings section, likely named **Reaction animations**, where the user sees a table like:

| Reaction | Plays animation | Inline preview |
| --- | --- | --- |
| Idle | Idle | Animated default pet thumbnail |
| Thinking | Review | Animated default pet thumbnail |
| Working | Running | Animated default pet thumbnail |
| Editing | Running | Animated default pet thumbnail |
| Running | Running | Animated default pet thumbnail |
| Testing | Waiting | Animated default pet thumbnail |
| Waiting | Waiting | Animated default pet thumbnail |
| Waving | Waving | Animated default pet thumbnail |
| Success | Jumping | Animated default pet thumbnail |
| Error | Failed | Animated default pet thumbnail |
| Celebrating | Jumping | Animated default pet thumbnail |

Each row should make the relationship readable in plain language:

- **Reaction**: the event OpenPets receives from an agent or MCP tool.
- **Plays animation**: the spritesheet state the pet will use.
- **Inline preview**: shows the selected animation in that row using the configured default pet's assets, without affecting the live desktop pet.

## Mapping choices

Expose only the universal animation states that make sense as user-selectable targets.

Persisted/runtime values are lowercase canonical ids. Capitalized names are UI labels only.

```ts
type UserSelectableAnimationState =
  | "idle"
  | "review"
  | "running"
  | "waiting"
  | "waving"
  | "jumping"
  | "failed";
```

| Animation id | UI label | Meaning |
| --- | --- | --- |
| `idle` | Idle | Neutral/no special movement. |
| `review` | Review | Thinking, reading, reviewing. |
| `running` | Running | Active work, editing, executing. |
| `waiting` | Waiting | Waiting, blocked, testing, permission pending. |
| `waving` | Waving | Attention, greeting, notification. |
| `jumping` | Jumping | Success, celebration. |
| `failed` | Failed | Error or failure. |

Do not expose drag-only directional states as mapping targets:

- `running-left`
- `running-right`

Those remain controlled by drag/move behavior, not reactions.

## Default mapping

The default mapping should match the existing product behavior:

| Reaction | Default animation id | UI label |
| --- | --- | --- |
| `idle` | `idle` | Idle |
| `thinking` | `review` | Review |
| `working` | `running` | Running |
| `editing` | `running` | Running |
| `running` | `running` | Running |
| `testing` | `waiting` | Waiting |
| `waiting` | `waiting` | Waiting |
| `waving` | `waving` | Waving |
| `success` | `jumping` | Jumping |
| `error` | `failed` | Failed |
| `celebrating` | `jumping` | Jumping |

The baseline “no active reaction” state always remains canonical `idle`. A user override for the explicit `idle` reaction only affects an actual `idle` reaction event; it must not make the pet continuously play a non-idle animation when nothing is happening.

## Settings UI design

### Layout

- Place this under Settings rather than first-run onboarding.
- Use a compact card titled **Reaction animations**.
- Include one short helper sentence: “Choose which animation your pet plays for each agent reaction.”
- Keep the table scannable; avoid technical spritesheet language in the main UI.
- Use sentence-style labels (`Thinking`, `Review`) instead of raw protocol ids unless an advanced/debug view is added later.

### Table behavior

Each row should include:

1. reaction label,
2. short description of when it happens,
3. animation dropdown/select,
4. small inline animated preview.

Example rows:

| Reaction | When it happens | Animation |
| --- | --- | --- |
| Thinking | Agent is reasoning or reviewing. | Review |
| Working | Agent is actively changing files. | Running |
| Testing | Agent is running checks. | Waiting |
| Success | Task completed successfully. | Jumping |
| Error | Something failed. | Failed |

### Inline preview behavior

- Show a small inline preview in every reaction row using the current default pet.
- If no custom default pet is installed, use the built-in default pet.
- Changing a row's dropdown should update that row's inline preview immediately.
- Previews should not send an IPC reaction, acquire a lease, or affect live desktop pet state.
- Previews should be local to the settings window so users can experiment safely.

### Reset behavior

- Add **Reset to defaults** for the whole table.
- Match the current Settings behavior and auto-save changes after validation.
- Show a subtle per-row **Default** or **Changed** indicator if it fits cleanly.
- If practical, add per-row reset only after the base table is easy to understand.

## Data model

Store only user overrides, not a full copy of the defaults.

Suggested shape inside persisted desktop preferences:

```ts
type ReactionAnimationOverrides = Partial<Record<OpenPetsReaction, UserSelectableAnimationState>>;

type Preferences = {
  reactionAnimationOverrides?: ReactionAnimationOverrides;
};
```

At runtime:

1. start with the built-in default reaction-to-animation mapping,
2. apply valid user overrides,
3. ignore invalid/unknown saved values and fall back to defaults,
4. never allow `running-left` or `running-right` as saved reaction mappings,
5. remove entries equal to defaults so preferences store only true overrides.

This keeps future default changes possible without freezing every user's config to an old full mapping.

Read/write rules:

- On read, drop unknown reaction keys and unknown animation ids.
- On write, reject unknown reaction keys, unknown animation ids, and drag-only states.
- On write, delete any row whose selected value equals the default.
- **Reset to defaults** deletes `preferences.reactionAnimationOverrides` entirely.
- Empty override objects should be normalized away.

## Technical approach

1. **Centralize mapping metadata.**
   - Move the current private reaction mapping and universal sprite metadata out of `pet-window.ts` into a shared desktop module, for example `apps/desktop/src/reaction-animation-mapping.ts`.
   - That module should export:
     - public reaction metadata: id, UI label, short description, default animation id,
     - selectable animation metadata: id, UI label, description,
     - the runtime resolver that applies validated overrides,
     - validation helpers for settings IPC and persisted preferences.
   - Runtime pet rendering and Settings UI should consume this shared metadata so the table, preview, and live pet behavior cannot drift.

2. **Add persisted settings overrides.**
   - Extend desktop app state with reaction animation overrides.
   - Validate on read and write.
   - Persist only changed rows.
   - Extend the existing Settings patch validator or add a dedicated settings-only IPC for these overrides. Either path must validate before persisting.

3. **Update runtime reaction mapping.**
   - Runtime animation resolution becomes `reaction -> configured animation -> default animation -> idle fallback`.
   - Drag still overrides reaction animation while the pet is being dragged.
   - The configured mapping applies globally to default pets and explicit/agent pets because both render through the shared pet window path.
   - One-shot versus looping behavior follows the selected animation state. For example, if `thinking` maps to `jumping`, it uses jumping's finite-loop behavior; if `success` maps to `running`, it loops for the transient lifetime.

4. **Build the settings table.**
   - Display one row per public reaction.
   - Use a constrained dropdown for valid animation targets.
   - Keep hit areas at least 40px high for touch/trackpad comfort.
   - Use exact transition properties; avoid `transition: all`.

5. **Add preview renderer.**
   - Reuse the existing pet rendering/CSS constants if possible so preview and desktop pet do not drift.
   - Preview should run in the settings window, not in the live transparent pet window.
   - The settings preview must obtain a safe spritesheet URL from the main process for the current default pet.
   - Built-in preview assets may use a data URL or another narrow trusted route.
   - Installed default pets should use a scoped internal protocol or equivalent safe main-process route, not arbitrary renderer file access.
   - Update the Settings CSP for the chosen image source. Do not loosen CSP beyond what the preview needs.

6. **Add reset/default affordances.**
   - Whole-table reset first.
   - Optional per-row reset later if the UI stays clean.

## Acceptance criteria

- Settings includes a **Reaction animations** table.
- Every public OpenPets reaction appears exactly once.
- Each reaction can be mapped to one allowed non-drag animation target.
- Each row's current/default pet inline preview shows the selected animation clearly.
- Inline previews do not trigger live pet reactions, leases, speech bubbles, or status badges.
- Reset to defaults restores the built-in mapping.
- Invalid saved mappings fall back safely to defaults.
- Settings IPC rejects unknown reactions, unknown animation states, and drag-only states.
- Configured mapping applies to default pets and explicit/agent pets.
- An explicit `idle` reaction override does not change the baseline no-reaction idle state.
- One-shot/loop duration follows the selected animation state.
- Drag animations remain unaffected and still override active reaction animation while dragging.
- Reduced-motion behavior is respected in preview and live pet rendering.
- `docs/mapping.md` is updated after implementation to mention user overrides and the new reaction-animation mapping source of truth.
- Tests or contract checks cover:
  - every public reaction has table metadata,
  - every default mapping is valid,
  - metadata is exhaustive over selectable animation ids,
  - saved overrides cannot use drag-only states,
  - runtime mapping falls back safely for invalid saved values.

## Implementation todo plan

1. Extract reaction/animation metadata from `pet-window.ts` into `apps/desktop/src/reaction-animation-mapping.ts`.
2. Add validation helpers for selectable animation ids, public reaction ids, persisted overrides, and Settings IPC payloads.
3. Extend persisted desktop preferences with `reactionAnimationOverrides`, storing only values that differ from defaults.
4. Wire runtime pet rendering to resolve reaction animation through the validated user overrides for both default and explicit/agent pets.
5. Add or extend Settings IPC so the renderer can read metadata, read current overrides, update one mapping, and reset mappings safely.
6. Add a safe main-process preview asset route for the current default pet and update the Settings CSP narrowly for that route.
7. Build the Settings **Reaction animations** table with dropdowns, default/changed indicators, reset-to-defaults, and at least 40px row controls.
8. Add per-row default-pet inline previews in Settings that reuse shared sprite constants and never touch live pet windows, leases, bubbles, or status badges.
9. Add contract/tests for metadata exhaustiveness, default validity, override normalization, Settings IPC rejection, runtime fallback, and drag-only exclusion.
10. Update `docs/mapping.md` to document that defaults can be overridden in Settings.
11. Manually verify built-in default pet preview, installed default pet preview, reduced motion, default pet reactions, explicit/agent pet reactions, reset behavior, and invalid saved config fallback.

## Manual verification guide

After implementation:

1. Open Settings and find **Reaction animations**.
2. Confirm every public reaction appears once and labels are understandable without protocol knowledge.
3. Change `thinking` to `jumping`; confirm that row's inline preview jumps and the row shows **Changed**.
4. Trigger a live `thinking` reaction on the default pet; confirm it uses jumping's finite-loop behavior.
5. Configure or trigger an explicit/agent pet; confirm the same mapping applies globally.
6. Change `success` to `running`; confirm it loops for the transient lifetime.
7. Change `idle` to `waving`; trigger an explicit `idle` reaction and confirm only that transient event uses the override, then confirm the no-active-reaction baseline returns to canonical idle.
8. Confirm dragging still uses left/right running animations and returns to the active reaction animation afterward.
9. Reset to defaults; confirm overrides are removed and behavior matches the default mapping table.
10. Repeat inline preview checks with an installed default pet and with the built-in fallback pet.
11. Enable reduced motion and confirm preview/live behavior respects it.
12. Inject or simulate invalid saved mappings; confirm they are dropped and defaults are used.

## Risks and tradeoffs

- Too much control can make the UI feel technical. Keep labels plain and use preview to explain meaning visually.
- Preview and live pet rendering can drift if they duplicate CSS/state constants. Prefer shared metadata/constants.
- Preview asset loading can accidentally broaden renderer file access. Keep asset access mediated by the main process and CSP-scoped.
- If users map many reactions to the same animation, pet feedback becomes less informative. This is acceptable because it is an explicit user preference.
- Per-pet mappings may be desirable later, but global mapping is easier to explain and safer for the first version.

## Future extensions

- Per-pet reaction animation mappings.
- Import/export reaction profiles.
- Presets such as **Expressive**, **Subtle**, and **Quiet**.
- Bubble/status display preferences per reaction.
- Pet package metadata that suggests preferred default mappings for custom pets.

## Oracle plan review

Reviewed by Oracle before implementation.

Verdict: conditionally approved. Product scope is right: global reaction-to-animation overrides, default-pet preview, no bubble/status-badge settings.

First review feedback disposition:

- Fixed canonical id ambiguity by making persisted/runtime values lowercase and labels UI-only.
- Made metadata source-of-truth concrete with a proposed shared desktop module.
- Added persistence location, normalization, reset, and write semantics.
- Required Settings IPC validation for unknown reactions, unknown animation ids, and drag-only states.
- Added safe preview asset loading and CSP requirements.
- Clarified global runtime scope across default and explicit/agent pets.
- Clarified explicit `idle` reaction semantics versus baseline no-reaction idle.
- Specified one-shot/loop behavior follows the selected animation state.
- Chose auto-save to match current Settings behavior.
- Added implementation todos and manual verification steps.

Second review verdict: approved for implementation, no blockers.

Second review feedback disposition:

- Added `idle` and `running` to the first user-visible example table so it includes every public reaction.
- Clarified that preview is isolated inside Settings and does not affect the live desktop pet.
- Required `docs/mapping.md` to reference the new mapping source of truth after implementation.
- Added manual verification for explicit `idle` override semantics.
