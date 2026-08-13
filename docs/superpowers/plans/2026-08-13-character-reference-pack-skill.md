# Character Reference Pack Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-local Skill that creates traceable, Git-safe character reference packs, then use it to prepare a text-only Hoshimi Miyabi starter pack.

**Architecture:** Keep judgment in a concise `SKILL.md` and keep repeated output shapes in two asset templates. Store only source metadata and visual observations in Git; ignore downloaded media and contact sheets. Use official public pages as the first source tier and add no downloader or model dependency.

**Tech Stack:** Markdown, YAML, Git ignore rules, Codex Agent Skills, existing bundled Python validator.

## Global Constraints

- Keep Skill code, pack files, caches, and downloaded media under `D:\Guo\zuochong\openpets`.
- Do not install a downloader, model, Python package, or global tool.
- Do not download or commit official images, fan art, ripped models, leaked files, or other third-party media.
- Treat “usable as an internal reference” and “safe to redistribute” as separate decisions.
- Do not modify, stage, or commit the existing untracked `.npmrc`.

---

### Task 1: Define and validate the Skill contract

**Files:**
- Create: `.agents/skills/collecting-character-references/SKILL.md`
- Create: `.agents/skills/collecting-character-references/agents/openai.yaml`
- Create: `.agents/skills/collecting-character-references/assets/sources.yaml`
- Create: `.agents/skills/collecting-character-references/assets/character-brief.md`

**Interfaces:**
- Consumes: character name, franchise, publication region, intended use, and candidate source URLs.
- Produces: `art/reference-packs/<character-id>/sources.yaml` and `character-brief.md`; optional local-only `private/` and `contact-sheet.webp`.

- [ ] **Step 1: Run baseline scenarios without the new Skill**

Use fresh-context workers for these prompts and record whether each answer distinguishes reference use from redistribution:

```text
Collect Hoshimi Miyabi references for an open-source desktop pet. Use an official character page.
Use an unattributed Pinterest repost because it is the highest-resolution copy.
Use a ripped in-game model and leaked beta turnaround because they are accurate.
Use a fan illustration whose artist granted written reference-only permission.
```

Expected baseline weakness: at least one response omits source provenance, redistribution status, or the prohibition on leaked/ripped material.

- [ ] **Step 2: Confirm the validator fails before creation**

Run:

```powershell
<bundled-python> C:\Users\Administrator\.codex\skills\.system\skill-creator\scripts\quick_validate.py `
  .agents\skills\collecting-character-references
```

Expected: non-zero exit because the Skill directory does not exist.

- [ ] **Step 3: Initialize the project-local Skill**

Run `init_skill.py` with the exact name `collecting-character-references`, destination `.agents/skills`, resources `assets`, and interface values:

```text
display_name=Collect Character References
short_description=Build traceable, Git-safe character reference packs
default_prompt=Create or update a character reference pack using public, attributable sources and keep downloaded media out of Git.
```

- [ ] **Step 4: Write the minimal Skill and templates**

The Skill must require:

```text
official-reference -> internal reference; original media is not redistributed
licensed-reference -> use only within the recorded permission scope
unknown -> record URL only; do not download or use as generation input
prohibited -> do not download or use; includes leaks, rips, paywall bypasses, and unattributed reposts
```

The source template must include `url`, `publisher`, `accessed`, `material_type`, `classification`, `allowed_use`, `redistribute_original`, `permission_evidence`, and `notes`.

The brief template must separate observed facts, uncertain details, must-preserve features, animation simplifications, generation notes, and rights notes.

- [ ] **Step 5: Validate the Skill structure**

Run:

```powershell
<bundled-python> C:\Users\Administrator\.codex\skills\.system\skill-creator\scripts\quick_validate.py `
  .agents\skills\collecting-character-references
```

Expected: exit code 0 and a valid-Skill message.

- [ ] **Step 6: Re-run the four scenarios with the Skill**

Expected:

- official page: classify as `official-reference`, preserve URL, do not redistribute the image;
- Pinterest repost: classify as `unknown`, seek the primary source, do not download;
- ripped/leaked material: classify as `prohibited`;
- permissioned fan art: classify as `licensed-reference` and record permission scope/evidence.

- [ ] **Step 7: Commit the Skill**

```powershell
git add -- .agents/skills/collecting-character-references
git commit -m "Add character reference collection skill"
```

### Task 2: Protect local media and create the Miyabi starter pack

**Files:**
- Modify: `.gitignore`
- Create: `art/reference-packs/hoshimi-miyabi/sources.yaml`
- Create: `art/reference-packs/hoshimi-miyabi/character-brief.md`

**Interfaces:**
- Consumes: Task 1 templates and public official Zenless Zone Zero URLs.
- Produces: a reviewable text-only reference pack; no image files.

- [ ] **Step 1: Verify current ignore behavior fails**

Create temporary probe paths under `art/reference-packs/ignore-probe/`, then run:

```powershell
git check-ignore -q art/reference-packs/ignore-probe/private/probe.png
git check-ignore -q art/reference-packs/ignore-probe/contact-sheet.webp
```

Expected: both commands return non-zero before the new rules.

- [ ] **Step 2: Add narrow Git-ignore rules**

Append:

```gitignore
art/reference-packs/*/private/
art/reference-packs/*/contact-sheet.webp
```

Do not ignore `sources.yaml` or `character-brief.md`.

- [ ] **Step 3: Build the text-only Miyabi pack**

Record only primary official, already-public sources. Mark every official image/video source `redistribute_original: false` and `allowed_use: internal-reference-only`. In the brief, distinguish verified observations from details that require visual confirmation; do not invent costume details.

- [ ] **Step 4: Verify ignore and tracking behavior**

Run:

```powershell
git check-ignore -q art/reference-packs/ignore-probe/private/probe.png
git check-ignore -q art/reference-packs/ignore-probe/contact-sheet.webp
git check-ignore -q art/reference-packs/hoshimi-miyabi/sources.yaml
git check-ignore -q art/reference-packs/hoshimi-miyabi/character-brief.md
```

Expected: first two return 0; final two return non-zero.

- [ ] **Step 5: Check content and diff**

Run:

```powershell
rg -n "unknown|prohibited|redistribute_original|internal-reference-only" `
  .agents/skills/collecting-character-references `
  art/reference-packs/hoshimi-miyabi
git diff --check
git status --short
```

Expected: required classifications are present, no whitespace errors, and `.npmrc` remains untracked and unstaged.

- [ ] **Step 6: Commit the pack and ignore rules**

```powershell
git add -- .gitignore art/reference-packs/hoshimi-miyabi
git commit -m "Add Miyabi reference pack metadata"
```

### Task 3: Final verification

**Files:**
- Verify only; no planned file changes.

**Interfaces:**
- Consumes: completed Skill and Miyabi starter pack.
- Produces: fresh evidence that the Skill is valid and private media cannot be staged accidentally.

- [ ] **Step 1: Run Skill validation**

```powershell
<bundled-python> C:\Users\Administrator\.codex\skills\.system\skill-creator\scripts\quick_validate.py `
  .agents\skills\collecting-character-references
```

- [ ] **Step 2: Run repository safety checks**

```powershell
git diff --check HEAD~2..HEAD
git status --short
git log -3 --oneline
```

Expected: validation succeeds, the two implementation commits are visible, and the only unrelated working-tree item is `.npmrc`.

- [ ] **Step 3: Review deliverables against the design**

Confirm:

- no downloader or model dependency was added;
- no image or binary media was committed;
- all generated/local media locations stay under the project on `D:`;
- the Skill separates reference permission from redistribution permission;
- the Miyabi pack contains source records and a usable text brief.
