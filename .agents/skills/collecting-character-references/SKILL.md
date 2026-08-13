---
name: collecting-character-references
description: Use when collecting, evaluating, organizing, or documenting visual references for a named character, especially for fan art, AI image generation, desktop pets, spritesheets, open-source projects, or sources with unclear redistribution rights.
license: MIT
---

# Collecting Character References

## Overview

Build a traceable reference pack before generating character art. Treat permission to study an image and permission to redistribute that image as separate decisions.

## Output Contract

Create each source by copying this record and filling it. Keep every key exactly as written. `classification` is exactly one of `official-reference`, `licensed-reference`, `unknown`, or `prohibited`.

```yaml
- id: ""
  title: ""
  url: ""
  publisher: ""
  accessed: ""
  material_type: ""
  classification: "unknown"
  allowed_use: "record-only"
  redistribute_original: false
  permission_evidence: ""
  notes: ""
```

Do not summarize the record as a different schema. Copy `assets/sources.yaml` unchanged when creating the pack.

## Workflow

1. Confirm the character, franchise, publication region, intended output, and whether use is personal, open-source, or commercial. If unspecified, use the safest assumption: internal reference for a non-commercial prototype.
2. Search in this order:
   - publisher-owned, already-public character pages, news, trailers, and posts;
   - publisher fan-creation or material-use rules for the applicable region;
   - creator-owned work with explicit written permission.
3. Record candidate sources in `sources.yaml` before downloading anything.
4. Set `classification` to exactly one value from this table. Do not translate or replace these values:

| Classification | Handling |
|---|---|
| `official-reference` | Use internally to observe the character. Set `redistribute_original: false` unless an explicit license says otherwise. |
| `licensed-reference` | Stay within the recorded permission scope and retain evidence. |
| `unknown` | Record the URL only. Includes unattributed reposts without a primary source. Do not download, study as an internal visual reference, or use as generation input until the primary source or permission is found. |
| `prohibited` | Do not download or use. Includes leaks, ripped game assets, and paywall bypasses. |

5. Download only when the user requests collection and the source is eligible. Store media under `art/reference-packs/<character-id>/private/` on the project drive. Never place it on `C:` or stage it in Git.
6. Copy `assets/character-brief.md` beside `sources.yaml`. Describe only observations supported by recorded sources; move uncertain details to the uncertainty section.
7. Report separately:
   - what is safe for internal reference;
   - what may be included in the repository;
   - unresolved permission questions.
8. Pass the brief and selected local references to `imagegen`. Use `hatch-pet` only after the base character design is approved.

## Required Output

```text
art/reference-packs/<character-id>/
|-- sources.yaml
|-- character-brief.md
|-- private/              # local only
`-- contact-sheet.webp    # local only
```

Do not claim legal clearance. Preserve source URLs and permission evidence so a human can review the decision.

## Common Mistakes

- A high-resolution repost is not a primary source.
- An official image is not automatically redistributable.
- Open-sourcing project code does not open-source third-party character material.
- AI-generated fan work can still be subject to the character owner's rules.
