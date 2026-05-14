# Bug Squashing Week

This document tracks reported desktop bugs, root-cause findings, fix attempts, and community confirmation. Keep this updated before and after each release so we know what worked, what did not, and what still needs tester feedback.

## Tracker format

Each bug should record:

- **Report:** user-visible symptom and affected version/platform.
- **Status:** investigating, fix planned, fixed-awaiting-confirmation, confirmed fixed, not fixed.
- **Likely cause:** current best explanation with confidence.
- **Fix attempts:** code changes or release versions that attempted to address it.
- **Result:** local verification plus community feedback.
- **Next action:** what to try next if still not confirmed.

---

## Windows transparent pet block and lost interaction

- **GitHub issue:** https://github.com/alvinunreal/openpets/issues/18
- **Platform:** Windows
- **Reported version(s):** `2.0.5`; also reproduced by reporter when building from source.
- **Status:** first fix implemented locally; awaiting checks, release, and community confirmation.

### Bug A: gray block behind the pet

#### Report

The app opens normally on Windows, but the pet is surrounded by a gray rectangular block instead of a transparent background.

#### Current rendering path

- Pet windows are transparent frameless Electron `BrowserWindow`s.
- Main options are in `apps/desktop/src/pet-window.ts`:
  - `transparent: true`
  - `frame: false`
  - `backgroundColor: "#00000000"`
  - `hasShadow: false`
  - `show: false`
- Pet HTML/CSS sets transparent page background:
  - `html, body { ... background: transparent; ... }`
- The pet shell currently uses CSS `filter: drop-shadow(...)`.
- The speech/status bubble currently uses CSS `backdrop-filter: blur(...)`.

#### Likely cause

Windows/Electron transparent-window compositing is probably producing an opaque backing rectangle.

Most suspicious triggers:

1. CSS `filter: drop-shadow(...)` on `.pet-shell` inside a transparent layered window.
2. CSS `backdrop-filter: blur(...)` on `.bubble` inside a transparent layered window.
3. Showing the transparent window before the first clean renderer paint.

Confidence: **medium-high**.

Electron has documented transparent-window limitations, and related reports exist for Windows transparent windows showing black/gray/invalid backgrounds, especially around GPU/compositor behavior and filter/backdrop-filter effects.

Useful references:

- Electron custom window styles / transparent window limitations: https://www.electronjs.org/docs/latest/tutorial/custom-window-styles
- Electron `BrowserWindow` lifecycle / `ready-to-show`: https://www.electronjs.org/docs/latest/api/browser-window
- Backdrop/filter transparent-window issue pattern: https://github.com/electron/electron/issues/26029
- Windows transparent background reports: https://github.com/electron/electron/issues/40515
- Windows transparency regression examples: https://github.com/electron/electron/issues/48592

#### Planned fix attempts

Try these in order:

1. Gate/remove `backdrop-filter` on Windows.
2. Gate/remove or simplify `.pet-shell` `drop-shadow` on Windows.
3. Delay showing the pet until first successful load/render (`ready-to-show` or an explicit renderer-ready signal).
4. If still broken, test Windows-specific GPU/compositor mitigations. Do **not** start with global `app.disableHardwareAcceleration()` unless the safer CSS/lifecycle fixes fail, because it may vary by machine and can regress other rendering.

#### Verification plan

Ask Windows testers to confirm:

- Built-in pet has no gray/black rectangle.
- Installed/gallery pets have no gray/black rectangle.
- Pet bubbles do not create a gray/black rectangle when visible.
- Behavior after app restart is still correct.

#### Results log

| Date | Version/Build | Attempt | Local result | Community result | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-05-14 | unreleased | Gate Windows `.pet-shell` `drop-shadow` and `.bubble` `backdrop-filter` to `none` | Pending checks | Pending | First low-risk compositor mitigation; needs Windows tester confirmation. |

---

### Bug B: cannot move or right-click pet after changing pet

#### Report

On Windows, the pet can initially be moved and right-clicked. After changing to another pet, it cannot be moved or right-clicked anymore. Exiting and launching the app again restores interaction.

#### Current input path

- Default pet window is reused instead of recreated.
- Pet change calls `refreshDefaultPetContent()`.
- `refreshDefaultPetContent()` reloads the existing pet window content with `loadFile(...)`.
- Input handling uses Electron `setIgnoreMouseEvents(true, { forward: true })` on Windows/macOS so transparent background clicks pass through.
- The renderer preload sends hit-test and drag IPC based on `elementFromPoint(...).closest(".pet-shell, .bubble")`.
- Current passthrough setup only runs once after the first load:
  - `window.webContents.once("did-finish-load", () => setPassthrough(true));`

#### Likely cause

The `BrowserWindow` keeps OS-level mouse passthrough state across `loadFile(...)` reloads, but our code only re-arms/reset it once. After pet change, Windows can leave the window in ignored/pass-through mode or lose forwarded mouse events. Then mouse events do not reach the renderer, so drag and context-menu handling never start.

Confidence: **high**.

This matches Electron reports where `setIgnoreMouseEvents(true, { forward: true })` forwarding breaks after reload/refresh or becomes stuck.

Useful references:

- Electron custom interactions / click-through windows: https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions
- Electron `BrowserWindow#setIgnoreMouseEvents`: https://www.electronjs.org/docs/latest/api/browser-window
- Forwarding breaks after refresh pattern: https://github.com/electron/electron/issues/15376
- Modern click-through/reload stuck report: https://github.com/electron/electron/issues/49982
- Windows forwarding/hover instability: https://github.com/electron/electron/issues/30808

#### Planned fix attempts

Try these in order:

1. Make passthrough reload-safe:
   - Reset `setIgnoreMouseEvents(false)` before every pet content navigation/reload.
   - Clear any active drag state before navigation/reload.
   - Re-apply passthrough after every load, not only the first load.
2. Add an explicit renderer-ready IPC from `pet-preload.cjs` after mouse handlers are installed, then resync passthrough from main.
3. If Windows still fails, stop using full `loadFile(...)` as the pet-switch primitive:
   - update DOM/sprite data in-place, or
   - recreate the pet window on pet change while preserving position and visibility.

#### Verification plan

Ask Windows testers to confirm:

- Pet can be dragged immediately after launch.
- Pet right-click menu opens immediately after launch.
- Change from built-in pet to installed pet, then drag and right-click still work.
- Change from installed pet back to built-in pet, then drag and right-click still work.
- Repeat pet switching multiple times without restarting.
- Try while a bubble/status badge is visible.

#### Results log

| Date | Version/Build | Attempt | Local result | Community result | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-05-14 | unreleased | Reset passthrough before pet content reload, re-arm after every load, and add renderer-ready IPC | Pending checks | Pending | Targets Electron `setIgnoreMouseEvents(..., { forward: true })` reload/forwarding flake. |

---

## Implementation notes for upcoming fix

Recommended first patch scope:

1. Update pet window passthrough lifecycle in `apps/desktop/src/pet-window.ts`.
2. Update `apps/desktop/pet-preload.cjs` if adding renderer-ready IPC.
3. Gate Windows-specific visual effects in `createPetWindowCss(...)`.
4. Add or update contract checks in `apps/desktop/src/check-packaging-contract.ts` so future changes do not regress the Windows workaround.

Potential release note wording after implementation:

> Fixed Windows pet window transparency and interaction reliability when switching pets. This release removes fragile transparent-window visual effects on Windows and reinitializes click-through/drag handling after pet reloads. Please report whether gray pet backgrounds or lost drag/right-click behavior still occur on your Windows machine.
