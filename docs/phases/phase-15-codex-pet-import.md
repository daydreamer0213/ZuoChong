# Phase 15 — Codex Pet Import

## Goal

Let users import locally generated Codex pets from `~/.codex/pets/` directly in Pet Manager.

## Implemented

- Added a **Codex** tab next to All and Installed in Pet Manager.
- Added main-process discovery for `~/.codex/pets/<pet-id>/pet.json` and `spritesheet.webp`.
- Codex pets are shown with local `data:image/webp` previews so the Pet Manager CSP does not need broader local-file image access.
- Local previews are only inlined when the raw spritesheet bytes are small enough and the Codex tab remains under a total raw preview-byte cap; oversized valid pets can still be imported but show an empty preview.
- Added Import action for Codex-only pets.
- If a pet exists in both the catalog and Codex, the Pet Manager uses Codex metadata/preview and Import uses the local Codex copy.
- Import copies only validated `pet.json` metadata and `spritesheet.webp` into OpenPets user data under the normal installed-pets directory.
- Imported Codex pets are recorded in app state with `source.kind = "codex"`.
- Missing `~/.codex/pets/` is treated as an empty Codex tab, not an error.
- Discovery scans at most 100 sorted Codex pet directories per render.

## Safety Rules

- Pet id must be safe and match the folder name.
- `spritesheetPath` must be exactly `spritesheet.webp`.
- `pet.json` and `spritesheet.webp` have size limits.
- The Codex root, source path, and pet files must stay inside `~/.codex/pets/`; root, pet directories, and files cannot be symlinks.
- Destination path must stay inside OpenPets pets storage.
- Import writes fresh regular files into OpenPets storage rather than copying links.
- Existing installed pets cannot be imported again.
- Import shares the same per-pet operation lock as catalog install/remove/default changes.

## Automated Checks

- `tests/codex-pets.test.ts` covers Codex metadata validation and preview-size gating.
- Desktop test script includes the Codex check.

## Manual Verification

1. Ensure local pets exist under `~/.codex/pets/<id>/pet.json` and `spritesheet.webp`.
2. Open Pet Manager.
3. Confirm the Codex tab appears.
4. Confirm Codex pets show previews and descriptions.
5. Import a Codex pet.
6. Confirm it moves to Installed and can be set as default.
7. Confirm removing it deletes the OpenPets copy, not the original Codex folder.
