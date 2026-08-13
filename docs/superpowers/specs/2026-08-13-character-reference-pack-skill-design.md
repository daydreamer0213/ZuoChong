# Character Reference Pack Skill Design

## Goal

Create a project-local Codex Skill that turns a named commercial character into a small, traceable reference pack for OpenPets artwork. The first target is Hoshimi Miyabi from Zenless Zone Zero. The workflow must help a beginner collect useful references without treating downloaded images as redistributable project assets.

## Scope

The first version will:

- prefer official, already-public character pages, announcements, videos, and user-captured screenshots;
- record each source URL, publisher, access date, material type, and permitted project use;
- keep downloaded reference images in a Git-ignored directory on `D:`;
- produce a committed `sources.yaml` and `character-brief.md`;
- classify sources as `official-reference`, `licensed-reference`, `unknown`, or `prohibited`;
- stop before downloading leaked, ripped, paywalled, or unclear third-party material.

It will not scrape fan-art platforms, train a LoRA, decide legal ownership automatically, or publish reference images.

## Location and Outputs

The Skill will live at:

```text
.agents/skills/collecting-character-references/
```

Each character pack will use:

```text
art/reference-packs/<character-id>/
├── sources.yaml
├── character-brief.md
├── private/
└── contact-sheet.webp
```

`private/` and `contact-sheet.webp` are local-only. The two text files are reviewable and may be committed.

## Workflow

1. Confirm the character, franchise, intended output, region, and whether the result is personal, open-source, or commercial.
2. Locate primary official sources before considering secondary sources.
3. Create or update source records without silently downloading.
4. Download only after the source is classified and the user has requested collection.
5. Extract visual facts into the character brief: silhouette, palette, hair, face, clothing, accessories, weapon, expressions, movement, and features that must not drift.
6. Report unresolved rights questions separately from visual observations.
7. Hand the brief and selected local references to `imagegen`; use `hatch-pet` only after the base design is approved.

## Safety and Repository Rules

Open source applies to OpenPets code, not automatically to third-party character material. Official images remain references unless an explicit redistribution license says otherwise. Fan art requires creator permission. Game-extracted models, unreleased material, and unknown reposts are prohibited.

The Skill must never place large caches or downloaded media on `C:`. It must not modify or stage unrelated files, including the existing project-local `.npmrc`.

## Minimal Implementation

Version one is documentation-first: a concise `SKILL.md`, two templates, and Git-ignore rules. It adds no downloader dependency. A later version may wrap `gallery-dl` only after repeated manual use demonstrates the need.

## Verification

- Validate Skill frontmatter and project discovery.
- Run source-classification scenarios for an official page, a licensed fan work, an unattributed repost, and a leaked/ripped asset.
- Confirm generated pack paths remain on `D:`.
- Confirm `private/` and contact sheets are ignored while `sources.yaml` and `character-brief.md` remain trackable.
- Confirm the Skill distinguishes “usable as reference” from “safe to redistribute.”
