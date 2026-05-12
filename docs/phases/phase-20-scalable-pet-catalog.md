# Phase 20: Scalable Pet Catalog and Lightweight Picker Images

## Goal

Scale the public pet catalog and desktop Pet Manager beyond 1,000 pets without loading full spritesheets for every visible card.

The clean solution is to move lightweight preview generation into the `web/` catalog pipeline and have desktop consume paginated catalog metadata with small thumbnail assets.

## Non-goals

- Do not change Codex/local pet discovery, import, preview inlining, or `~/.codex/pets` behavior in this phase.
- Do not change installed pet runtime rendering; installed pets still use `spritesheet.webp` after install.
- Do not remove or break `catalog.v2.json`; keep it available for older desktop clients.
- Do not make the Electron renderer construct untrusted image URLs independently.
- Do not broaden desktop CSP beyond the exact image origins needed.

## Problem

The current desktop Pet Manager reads `catalog.v2.json`, then uses each pet's `preview` URL as a card preview. Today `web/scripts/*` writes `preview` as the full spritesheet:

```js
preview: `${PUBLIC_BASE_URL}${pet.spritesheetPath}`
```

That means the picker can request hundreds or thousands of full files like:

```text
https://openpets.dev/pets/<slug>/spritesheet.webp
```

With a 1,000+ pet catalog, this creates excessive network, decode, memory, and layout work. Desktop-side lazy loading helps, but it does not solve the root issue: gallery cards need tiny thumbnails, not full runtime spritesheets.

## Desired outcome

- Public catalog supports 1,000+ pets without a huge single JSON payload.
- Pet Manager initially loads only a small page of metadata and small thumbnails.
- Pet Manager search works across the full public catalog, not only already-rendered pages.
- Full spritesheets are fetched only when needed for install/runtime or, optionally, selected-pet detail preview.
- Pet Manager keeps existing filters, including `Codex`, and adds the same high-level public catalog filters already used on the web: `Western` and `Asian`.
- Existing desktop clients can continue using `catalog.v2.json`.
- `catalog.v2.json` is statically limited to 300 pets while `catalog.v3` contains all eligible public pets.
- Codex/local pet behavior remains unchanged.

## Proposed asset model

For every public catalog pet under `web/public/pets/<slug>/`, generate and publish:

```text
spritesheet.webp  # existing full runtime/install asset
thumb.webp        # new tiny static thumbnail for gallery cards
preview.webp      # optional small animated/detail preview, if cheap to generate
<petId>.zip       # existing install package, served from zip.openpets.dev
```

Recommended budgets:

- `thumb.webp`: 96-160px static image, target < 10-20 KB.
- `preview.webp`: optional short idle animation or selected-detail image, target < 50-100 KB.
- `spritesheet.webp`: unchanged; used for installs/runtime, not bulk gallery cards.

For the first implementation, generate `thumb.webp` and defer `preview.webp`. Desktop uses `thumbnail` in cards and fetches `spritesheet` only for selected-pet detail animation, install/runtime paths, or existing installed-pet rendering.

## Proposed catalog model

Keep `public/pets/catalog.v2.json` available for compatibility, but statically cap it to 300 pets using the same stable catalog ordering as the web gallery/manifest. `catalog.v3` is the uncapped full-catalog contract.

Add `public/pets/catalog.v3.json` as an index:

```json
{
  "version": 3,
  "generatedAt": "2026-05-12T00:00:00.000Z",
  "total": 2500,
  "pageSize": 100,
  "search": "https://openpets.dev/pets/catalog.v3/search.json",
  "filters": {
    "categories": [
      { "id": "western", "label": "Western", "count": 1250 },
      { "id": "asian", "label": "Asian", "count": 1250 }
    ]
  },
  "pages": [
    "https://openpets.dev/pets/catalog.v3/page-000.json",
    "https://openpets.dev/pets/catalog.v3/page-001.json"
  ]
}
```

Add a lightweight searchable metadata index under `public/pets/catalog.v3/search.json` so desktop can search across all pets without loading every catalog page or thumbnail:

```json
{
  "version": 3,
  "generatedAt": "2026-05-12T00:00:00.000Z",
  "total": 2500,
  "pageSize": 250,
  "pages": [
    "https://openpets.dev/pets/catalog.v3/search-page-000.json",
    "https://openpets.dev/pets/catalog.v3/search-page-001.json"
  ]
}
```

Add bounded search metadata pages under `public/pets/catalog.v3/search-page-XXX.json`:

```json
{
  "version": 3,
  "page": 0,
  "pageSize": 250,
  "pets": [
    {
      "id": "snoopy",
      "displayName": "Snoopy",
      "searchText": "snoopy beagle red collar calm coding sessions",
      "category": "western",
      "catalogPage": 0
    }
  ]
}
```

The search metadata intentionally omits image and zip URLs. `searchText` should be normalized and capped during generation so each search metadata page remains within the response budget. Desktop uses search metadata only to find matching IDs/categories and then asks the main process to load the relevant validated catalog page(s) before rendering results or installing a pet.

Add paginated page files under `public/pets/catalog.v3/`:

```json
{
  "version": 3,
  "page": 0,
  "pageSize": 100,
  "pets": [
    {
      "id": "snoopy",
      "displayName": "Snoopy",
      "description": "A tiny black-and-white beagle with a red collar for calm coding sessions.",
      "thumbnail": "https://openpets.dev/pets/snoopy-23e05847/thumb.webp",
      "preview": "https://openpets.dev/pets/snoopy-23e05847/preview.webp",
      "spritesheet": "https://openpets.dev/pets/snoopy-23e05847/spritesheet.webp",
      "zip": "https://zip.openpets.dev/pets/snoopy-23e05847/snoopy.zip",
      "category": "western",
      "subcategory": "cartoons"
    }
  ]
}
```

Fields:

- `id`: required; this is the install-safe `installId`, not the upstream/manifest UUID-like `id`.
- `thumbnail`: required for v3 catalog pets.
- `preview`: optional; desktop must tolerate missing/failed preview.
- `spritesheet`: optional for gallery use, but useful for detail/runtime preview if explicitly selected.
- `zip`: required for installation.
- `category`: required for v3 public catalog pets and currently limited to `western` or `asian`.
- `subcategory`: optional; preserve existing web metadata where present.

V3 index invariants:

- Maximum index response size: 256 KB.
- Maximum page response size: 256 KB.
- Default page size: 100 pets.
- Maximum page size: 200 pets.
- Maximum page count: 100 pages for this phase.
- `total` must equal the sum of pets across all pages during generation.
- Pet IDs must be unique across all pages.
- Page URLs must match `https://openpets.dev/pets/catalog.v3/page-<3 digit>.json`.
- Search URL must match `https://openpets.dev/pets/catalog.v3/search.json`.
- Search page URLs must match `https://openpets.dev/pets/catalog.v3/search-page-<3 digit>.json`.
- Search index and search page responses must each stay within the 256 KB response budget.
- Deploy ordering must publish page files before publishing the index that references them.

## Public catalog filters

The web app already groups public pets into two top-level filters: `Western` and `Asian`. V3 should carry this as canonical metadata so desktop does not infer categories from names, slugs, descriptions, or paths.

Filter contract:

- `category` is required for every v3 public catalog pet.
- Allowed initial values are exactly:
  - `western`
  - `asian`
- Desktop labels these as `Western` and `Asian`.
- Desktop keeps existing filters and adds category filters. Button order/layout should be compact and right-aligned: `All`, `Western`, `Asian`, `Codex`, `Installed`.
- `Codex` filter behavior must stay unchanged from the current Pet Manager.
- If a v3 pet has a missing/unknown category, validation should reject the page or mark the pet unavailable rather than guessing.
- v2 fallback does not provide reliable category filtering; when using v2 fallback, desktop should hide `Western`/`Asian` filters or show them disabled.
- Codex/local-only pets are not part of this category filter contract in this phase. If shown in the same grid, they continue to appear under the existing `Codex` filter and under `All`/`Installed` when applicable, but not under `Western`/`Asian` unless they correspond to a catalog pet with v3 category metadata.

Category source rules:

- `web/scripts/import-reviewed-pets.js` already validates reviewed-pet `category`; v3 must preserve it.
- `web/scripts/sync-pets.js` must preserve category from an existing manifest entry when present.
- `web/scripts/sync-local-pets.js` must preserve category from the existing generated/manifest entry when present.
- Any pet still missing `western`/`asian` after preservation is excluded from v3 and logged, while v2 remains unchanged for compatibility.
- Generation must not infer category from names, slugs, descriptions, upstream source, or folder paths.

## Web implementation plan

Update all public catalog writers that currently emit `catalog.v2.json`:

- `web/scripts/sync-pets.js`
- `web/scripts/import-reviewed-pets.js`
- `web/scripts/sync-local-pets.js`

Tasks:

1. Add shared helpers for catalog asset paths and v3 output shape.
2. Generate `thumb.webp` for each public catalog pet if missing or stale.
3. Defer `preview.webp` until after thumbnail/search/paging is stable.
4. Continue writing `catalog.v2.json` as a backward-compatible subset capped to 300 pets.
5. Write `catalog.v3.json` plus `catalog.v3/page-XXX.json` files for all eligible public pets.
6. Write `catalog.v3/search.json` for full-catalog desktop search.
7. Keep zip URLs on `zip.openpets.dev` unchanged.
8. Include the existing web category metadata in every v3 pet as `category: "western" | "asian"`.
9. Add validation that every v3 page item has safe `id`, `thumbnail`, `zip`, and known `category` fields.
10. Add category counts to the v3 index so desktop can show correct filters before every page is loaded.

Thumbnail generation options:

- Preferred: use `sharp` in the web workspace to crop/extract the universal spritesheet idle first frame from the 8-column by 9-row spritesheet and resize to a small static WebP.
- Fallback: if sprite-frame extraction is unreliable for a pet, create a small resized/cropped static thumbnail from the top-left/idle frame area and log the fallback.
- Stale detection should be deterministic: regenerate during sync/import or compare stored content hashes. Do not rely only on filesystem mtimes.
- Generation should fail or loudly warn if thumbnails exceed the agreed byte/dimension budget.

## Desktop implementation plan

Add a new desktop catalog path while keeping v2 fallback:

1. Fetch `https://openpets.dev/pets/catalog.v3.json` first.
2. Validate the index response size and exact final URL.
3. Fetch the first page only on initial Pet Manager open.
4. Fetch the lightweight v3 search index when the user searches, or eagerly after initial open if cheap enough, so search can find pets across the full catalog.
5. Load additional pages automatically as the user scrolls near the bottom of the grid. Keep an explicit "Load more" fallback for accessibility/failure recovery.
6. Render card images from `thumbnail`, not `preview`/`spritesheet`.
7. Preserve the existing `Codex` filter behavior and add compact right-aligned filters ordered: `All`, `Western`, `Asian`, `Codex`, `Installed`.
8. Move the catalog count/status label to the bottom corner of Pet Manager. Keep it minimal, e.g. `123 pets`; remove `Live` wording and remove the Codex count from this label.
9. Apply `Western`/`Asian` filters using validated v3 `category` metadata only.
10. On selected-pet detail, fetch/use the validated `spritesheet` URL to show animation. Do not fetch spritesheets for thumbnail cards or mini card previews.
11. If only a thumbnail is loaded and the selected-detail spritesheet has not loaded yet, show the thumbnail/placeholder until the spritesheet is available.
12. Fall back to v2 when v3 is unavailable.
13. Keep all remote image URLs main-process validated before exposing them to preload.

Main-process data contract:

- Add a paged v3 catalog UI state instead of requiring preload to know remote page URLs.
- Main process owns index/page/search fetch, validation, caching, selected-detail spritesheet URL exposure, and install lookup.
- Renderer search requests must be answered from validated main-process search/page data; preload must not construct page, thumbnail, spritesheet, or zip URLs.
- `installPet(id)` must be able to resolve validated v3 metadata for pets outside page 0 by using a main-process cache, the search index page mapping, or by fetching the needed validated page/index data.
- Installed catalog pets that are not in the first loaded page must still retain usable installed-state rows; detail/category/thumbnail can be enriched as pages load.

Renderer behavior:

- Do not render 1,000 cards at once; use paging or virtualization.
- Start with scroll-triggered page loading plus a manual fallback. Virtualization can be added later if needed.
- Limit concurrent remote image loads.
- Use async decoding and no referrer.
- Keep graceful empty/failure surfaces for thumbnail load errors.
- If only a thumbnail is available for a catalog pet, do not show fake animated mini state previews. Fetch the selected-detail spritesheet on selection for the main animation and hide/degrade mini state previews until a real spritesheet is available.
- Do not change Codex/local pet rendering or import behavior in this phase.

## Implementation specification

This phase is implemented across both repositories in this workspace:

- Root OpenPets desktop app: `apps/desktop/**`.
- Nested web catalog project: `web/**`.

### Web catalog generation

Add a shared ESM helper module, tentatively `web/scripts/catalog-v3-utils.js`, and use it from:

- `web/scripts/sync-pets.js`
- `web/scripts/import-reviewed-pets.js`
- `web/scripts/sync-local-pets.js`

The helper owns constants and deterministic generation behavior:

- `V2_COMPAT_LIMIT = 300`
- `V3_PAGE_SIZE = 100`
- `V3_MAX_PAGE_SIZE = 200`
- `V3_MAX_PAGES = 100`
- `PUBLIC_BASE_URL`
- `ZIP_BASE_URL`
- allowed categories: `western`, `asian`
- thumbnail file name: `thumb.webp`
- first-frame layout: 8 columns by 9 rows, 192 by 208 frame size

The helper exposes functions equivalent to:

- `writeCatalogArtifacts({ pets, publicPetsDir, v2CatalogFile, generatedAt })`
- `generateThumbnailIfNeeded({ pet, publicPetsDir })`
- `toV2Catalog(pets, generatedAt)`
- `toV3Artifacts(pets, generatedAt)`
- `validateV3Artifacts(artifacts)`

Generation rules:

1. Preserve current manifest/web ordering.
2. Write `catalog.v2.json` from the first 300 pets only.
3. Generate v3 from every pet with a preserved valid category, using `installId` as the public `id` in v2, v3 pages, search metadata, install lookup, and desktop state.
4. Exclude pets without `category: "western" | "asian"` from v3, log them, and keep them eligible for v2 compatibility output.
5. Do not infer category from name, slug, description, source URL, or folder path.
6. Include `subcategory` in v3 only when present.
7. Normalize and cap `searchText` for search metadata. Include `id`, display name, useful aliases/source text, and a bounded description excerpt, but omit all asset URLs.
8. Delete stale old `catalog.v3/page-XXX.json` and `catalog.v3/search-page-XXX.json` files before writing the new page set.
9. Write catalog page files and search page files before the root `catalog.v3.json` and `catalog.v3/search.json` indexes.

For `sync-pets.js`:

- Build a lookup from existing `manifest.json` by `installId`, `petId`, and `slug` before replacing manifest contents.
- When mapping upstream pets, preserve `category` and `subcategory` from the existing manifest entry if present.
- Keep reviewed/manual imported pets from the existing manifest and preserve their category fields.

For `sync-local-pets.js`:

- Preserve `category` and `subcategory` when updating an existing manual entry.
- New local pets are not inferred into v3 unless their local `pet.json` explicitly includes a valid category; otherwise they remain v2-compatible only.
- Dry runs should report `catalog.v3.json`, `catalog.v3/search.json`, and page files that would be written.

For `import-reviewed-pets.js`:

- Continue requiring category and subcategory in reviewed imports.
- Reuse the shared writer so regenerated catalogs include v2 cap, thumbnails, v3 pages, and search metadata.

Thumbnail generation:

- Add `sharp` to `web/package.json` dependencies or devDependencies used by scripts.
- For each v3-eligible pet, read `public/pets/<slug>/spritesheet.webp`.
- Extract the top-left idle frame from the 8x9 universal spritesheet (`left: 0`, `top: 0`, `width: 192`, `height: 208`).
- Resize inside a 160x160 WebP canvas or fit to 160px max dimension without upscaling.
- Write `public/pets/<slug>/thumb.webp`.
- Validate spritesheet dimensions before extraction.
- Regenerate deterministically during sync/import, or store/check a content-hash sidecar/manifest field. Do not rely only on filesystem mtimes because git checkouts and deploy artifacts can have misleading timestamps.
- Warn if the generated file exceeds 20 KB; fail if missing, zero bytes, or not `.webp`.

V3 file shapes:

- `public/pets/catalog.v3.json` contains only index metadata, category counts, page URLs, and search URL.
- `public/pets/catalog.v3/page-XXX.json` contains render/install metadata: `id`, `displayName`, `description`, `thumbnail`, optional `preview`, `spritesheet`, `zip`, `category`, optional `subcategory`.
- `public/pets/catalog.v3/search.json` contains only search index metadata and search page URLs.
- `public/pets/catalog.v3/search-page-XXX.json` contains only searchable metadata: `id`, `displayName`, capped normalized `searchText`, `category`, and `catalogPage`.

Validation must check:

- unique v3 IDs across all pages
- `total` equals paged pet count and search pet count
- category counts equal page contents
- page file names use exactly three digits
- search page file names use exactly three digits
- page/index/search JSON byte size budgets
- thumbnail file exists for every v3 pet
- thumbnail/preview/spritesheet URLs are `https://openpets.dev/pets/.../*.webp`
- zip URLs are `https://zip.openpets.dev/pets/.../*.zip`

Update `web/nuxt.config.js` route rules or deployment headers for catalog JSON coherence. Either:

- use no-cache/short-cache headers for `catalog.v2.json`, `catalog.v3.json`, `catalog.v3/search.json`, page files, and search page files; or
- publish versioned/hash-named v3 page/search directories and keep only the root v3 index stable.

Do not rely on a new stable index referencing stale cached page/search files.

### Desktop main process catalog model

Extend `apps/desktop/src/catalog-validation.ts` with v3 types and validators while keeping v2 validation intact:

- `CatalogV3Index`
- `CatalogV3Page`
- `CatalogV3SearchIndex`
- `CatalogV3SearchPage`
- `CatalogPetV3`
- `CatalogV3SearchPet`
- `validateCatalogV3Index(value)`
- `validateCatalogV3Page(value, expectedPage)`
- `validateCatalogV3SearchIndex(value)`
- `validateCatalogV3SearchPage(value, expectedPage)`

Tighten v2 compatibility by changing the shipped-client validation limit from 1000 to 300 if this desktop version still validates v2 directly.

Extend `apps/desktop/src/catalog.ts` into a small catalog service:

- Try v3 index first, then v3 page 0.
- Fall back to v2 remote, then v2 fixture, on any v3 fetch/validation failure.
- Read all catalog responses with explicit byte caps.
- Use `redirect: "error"` and `credentials: "omit"` for all fetches.
- Validate final response URLs exactly for the index and search file.
- Validate page final URLs against the v3 page URL from the index.
- Cache index, loaded pages, search index, and ID-to-page mappings in the main process.
- Never expose unvalidated page URLs to preload.

Expose main-process methods equivalent to:

- `getCatalogUiState()` — returns initial state with source, mode (`v3` or `v2`), page 0 pets, counts, loaded page list, `hasMore`, category availability, and errors.
- `loadCatalogPage(page)` — loads and returns the next validated v3 page by number.
- `queryCatalog({ query, filter, cursor, limit })` — loads/uses validated search metadata, applies category/installed/codex-aware filtering as needed, loads required catalog pages, and returns `{ pets, totalMatches, nextCursor, loadedPages }`. Use this same bounded query path for `Western`/`Asian` filters even when `query` is empty, so category filters represent the full catalog rather than only already-loaded pages.
- `getCatalogPetForInstall(id)` — returns validated install metadata for any v3 pet, loading search/page data if needed.
- `getCatalogPetDetail(id)` — returns a validated spritesheet URL and full pet metadata for selected-detail animation when available. V3 should include `spritesheet` for every pet in this phase; if a validated pet lacks it or loading fails, detail degrades to the thumbnail/placeholder without card-level spritesheet fetches.

Bound all main-process query and page APIs:

- `page` must be an integer present in the validated v3 index.
- `query` must be a string capped to a small maximum length, for example 120 characters.
- `filter` must be one of `all`, `western`, `asian`, `codex`, or `installed`.
- `limit` must be capped, for example 50 results per query response.
- `cursor` must be an opaque value produced by the main process or a bounded numeric offset.
- Deduplicate in-flight page/search/detail requests.
- Limit concurrent remote catalog fetches.

Installation changes in `apps/desktop/src/pet-installation.ts`:

- Replace the current `getCatalogUiState().pets.find(...)` lookup with `getCatalogPetForInstall(petId)`.
- Store installed state with the catalog version that supplied the pet (`2` or `3`) while preserving existing state compatibility.
- Continue downloading ZIPs only from validated `zip.openpets.dev` URLs.

State changes in `apps/desktop/src/app-state.ts`:

- Extend installed-pet source normalization to accept `catalogVersion: 3` without dropping the source.
- Preserve existing v2 installed state unchanged.
- Optionally store validated `thumbnail`, `spritesheet`, and `category` metadata for installed-row enrichment, but do not require those fields for runtime rendering.

IPC changes in `apps/desktop/src/windows.ts`:

- Keep `openpets:get-catalog` for initial state.
- Add handlers for:
  - `openpets:load-catalog-page`
  - `openpets:query-catalog`
  - `openpets:get-catalog-pet-detail`
- Gate each handler with `assertAllowedSender(event, ["pet-manager"])`.
- Validate every renderer-supplied IPC argument before calling catalog service methods.
- Keep Pet Manager CSP at `img-src data: https://openpets.dev`; do not add `zip.openpets.dev` to image CSP.

### Desktop renderer / preload behavior

Update `apps/desktop/preload.cjs` Pet Manager logic:

- Treat catalog state as versioned (`mode: "v3" | "v2"`).
- Render v3 cards from `thumbnail` with `previewIsSpriteSheet: false`.
- Do not use `spritesheet` for cards.
- For selected detail, call `openpets:get-catalog-pet-detail` and render the returned validated spritesheet as an animated sprite when it arrives.
- While selected-detail spritesheet is loading, show the thumbnail or empty placeholder.
- Hide/degrade mini state previews until a real spritesheet is available.
- Keep Codex/local pets using their current preview paths and behavior.

Paging and search:

- Initial render shows built-in/installed rows plus v3 page 0 public catalog rows.
- Add a scroll listener or `IntersectionObserver` sentinel near the bottom of `#catalog-pets` to load the next page automatically when not searching.
- Debounce search input.
- For non-empty search, call `openpets:query-catalog` so results can include unloaded pages.
- For `Western` and `Asian` filters, call `openpets:query-catalog` even when search is empty so category results are full-catalog and paged, not limited to already-loaded pages.
- For empty `All`, return to loaded-page browsing and continue scroll pagination.
- Avoid rendering all 1,000+ pets at once; query results must be bounded and cursor/page-loaded from the main process.
- Protect selected-detail spritesheet rendering with a request token or equivalent cancellation guard so stale responses cannot update the detail pane after the user selects another pet.

Filters and layout:

- In `createPetManagerHtml`, order filter buttons as `All`, `Western`, `Asian`, `Codex`, `Installed`.
- Show `Western` and `Asian` only when v3 metadata is available. Hide or disable them in v2 fallback.
- Keep `Codex` filter semantics unchanged: Codex/local pets appear under `Codex`, not under `Western`/`Asian` unless they have validated v3 catalog metadata.
- Move `#catalog-status` out of the filter row and into a compact bottom-corner position.
- Status text should be minimal, e.g. `123 pets`, `300 pets`, or `Offline`; do not include `Live` and do not include Codex counts.
- Align filter buttons to the right to avoid crowding the search/header row.

Image loading:

- Keep `Image.decoding = "async"` and `referrerPolicy = "no-referrer"`.
- Continue setting CSS `backgroundImage` only after image `load`.
- Add lazy thumbnail loading from day one using `IntersectionObserver` or an equivalent small renderer-side queue so a 100-pet page does not immediately start 100 thumbnail requests.
- Add a small concurrency guard for thumbnail image loads.

### Compatibility and rollout sequencing

Implement this work in reviewable phases. After each phase, run the relevant checks and ask an oracle reviewer to review the actual implementation before starting the next phase.

1. **Web catalog artifacts**
   - Add shared web catalog helper(s).
   - Add `sharp` thumbnail generation.
   - Cap `catalog.v2.json` to 300 pets.
   - Generate `catalog.v3.json`, catalog pages, `search.json`, and search pages.
   - Add web-side validation for IDs, categories, counts, URL shapes, response budgets, stale page cleanup, and thumbnail existence.
   - Checks: `cd web && bun lint && bun run build && bun run sync:pets` or a fixture-safe equivalent if live sync is not appropriate.
   - Oracle review gate: web artifact generation, v2 compatibility, v3 contract, thumbnail generation, cache coherence, and nested-web dependency handling.

2. **Desktop catalog service and validation**
   - Add v3 index/page/search validators.
   - Add main-process catalog service caching, bounded fetches, exact URL validation, v2 fallback, query API, and install/detail lookup.
   - Add v3 installed-source normalization while preserving existing v2 state.
   - Add IPC handlers with strict argument validation, request dedupe, and concurrency bounds.
   - Add packaging coverage for v2 fixture fallback if it remains enabled.
   - Checks: `pnpm --filter @open-pets/desktop build` and focused catalog/check tests.
   - Oracle review gate: security boundaries, URL validation, app-state compatibility, fallback behavior, and install lookup outside page 0.

3. **Pet Manager renderer update**
   - Switch catalog cards to thumbnails.
   - Add lazy/concurrent thumbnail loading.
   - Add right-aligned filters: `All`, `Western`, `Asian`, `Codex`, `Installed`.
   - Move compact pet count/status to the bottom corner.
   - Add scroll-triggered paging and bounded full-catalog query/search flows.
   - Preserve Codex/local rendering and filter semantics.
   - Checks: desktop build/tests plus renderer contract checks.
   - Oracle review gate: UI data flow, search/filter completeness, no card spritesheet fetches, Codex non-regression, and renderer not constructing URLs.

4. **Selected-detail spritesheet animation**
   - Fetch selected-detail metadata through the main process.
   - Render selected spritesheet animation only in detail view.
   - Add request-token/race protection and thumbnail/placeholder degradation.
   - Hide/degrade mini previews until a real spritesheet is available.
   - Checks: desktop build/tests and manual selection/network verification.
   - Oracle review gate: detail fetch security, race handling, no bulk spritesheet requests, and graceful failure behavior.

5. **End-to-end validation and rollout readiness**
   - Run web and desktop command sets.
   - Package desktop.
   - Manually verify with a locally served or published 1,000+ pet v3 catalog.
   - Confirm v3 outage falls back to v2 and category filters hide/disable.
   - Confirm runtime installed pets still use installed `spritesheet.webp` unchanged.
   - Oracle review gate: final implementation review against all acceptance criteria before deployment/release.

### Test coverage to add

Web:

- Unit/script-level validation for v2 cap at 300.
- Validation that v3 includes all and only category-valid pets.
- Validation that search index page mappings match generated pages.
- Validation that stale page files are removed.
- Thumbnail generation smoke test on a known spritesheet fixture, if a small fixture can be added without bloating the repo.

Desktop:

- `check-catalog-v3-validation.ts` for valid/invalid index, page, and search files.
- v3 fallback behavior when index/page/search validation fails.
- install lookup for a pet outside page 0.
- URL validation rejects wrong hosts, redirects, credentials, custom ports, wrong extensions, and unindexed page URLs.
- Pet Manager renderer contract checks for filter order, hidden v2 category filters, status label wording, and no card spritesheet usage.

### Implementation risks and mitigations

- **Search metadata size grows too large**: keep it URL-free, bounded per search page, and reduce `searchText` length before exceeding the 256 KB per-response budget.
- **Many missing categories**: v3 excludes and logs them; v2 remains capped and compatible.
- **Thumbnail generation is slow**: regenerate deterministically during sync/import or via content-hash checks, and keep `sharp` work local to sync/import scripts.
- **Selected detail causes repeated spritesheet downloads**: cache detail metadata in main process and let browser cache image requests.
- **Installed pets outside loaded pages look sparse**: render installed state from local app state first, then enrich when the relevant v3 page loads.

## Security and compatibility notes

- Desktop CSP should continue to allow only `data:` and `https://openpets.dev` for Pet Manager images unless the implementation requires a narrower path/origin rule.
- The renderer must not independently derive `thumbnail`, `preview`, `spritesheet`, or `zip` URLs.
- Main process should validate:
  - catalog index final URL,
  - page URL origin/path,
  - thumbnail/preview/spritesheet origin/path/extension,
  - zip origin/path/extension.
- URL validation should also reject credentials, custom ports, query strings, hashes, encoded path traversal tricks, wrong extensions, wrong final URLs, unindexed page/search URLs, and unexpected origins.
- `catalog.v2.json` remains the compatibility contract for currently shipped clients.
- `catalog.v2.json` must remain capped to 300 pets as a compatible curated subset rather than silently breaking shipped clients.
- `catalog.v3` can be rolled out on the web before desktop starts consuming it.
- Desktop Codex/local pet behavior is a non-goal. `web/scripts/sync-local-pets.js` is only a publishing path for local pets into the public web catalog; do not change desktop `~/.codex/pets` discovery, import, preview inlining, or metadata validation.
- If v2 fixture fallback remains part of desktop behavior, include `catalog.v2.fixture.json` in packaged app files and add packaging-contract coverage for it.
- `web/` is outside the root pnpm workspace. Web checks, Bun dependencies, and the `sharp` lockfile/install path must be handled explicitly rather than assuming root `pnpm test` covers them.

## Rollout plan

1. Web-only rollout:
   - Generate `thumb.webp` assets.
   - Publish `catalog.v3` alongside existing v2.
   - Verify URLs and asset sizes on production.
2. Desktop fallback support:
   - Add v3 fetch/validation with v2 fallback.
   - Keep existing Pet Manager behavior if v3 is missing.
3. Desktop performance update:
   - Switch cards to `thumbnail`.
   - Add scroll-triggered pagination, full-catalog search via v3 search metadata, selected-detail spritesheet loading, and bounded image loading.
4. Cleanup/observability:
   - Add size checks to web sync scripts.
   - Add desktop contract tests for v3 validation and fallback.

## Acceptance criteria

- `catalog.v2.json` output remains backward compatible and capped to 300 pets.
- `catalog.v3.json` and page files are generated by all relevant web catalog sync/import flows for all eligible public pets.
- `catalog.v3/search.json` is generated and enables full-catalog desktop search without loading all page files or thumbnails initially.
- Every v3 pet has a small `thumbnail` URL under `https://openpets.dev/pets/` ending in `.webp`.
- Desktop Pet Manager card grid uses `thumbnail` for catalog pets.
- Desktop Pet Manager includes compact right-aligned filters ordered `All`, `Western`, `Asian`, existing `Codex`, and `Installed` when v3 metadata is available.
- Desktop Pet Manager moves the pet count/status label to the bottom corner and keeps it minimal, without `Live` wording or Codex count.
- `Codex` filter behavior is unchanged.
- `Western`/`Asian` filters are driven only by validated v3 `category` metadata.
- If desktop falls back to v2, `Western`/`Asian` filters are hidden or disabled because v2 does not guarantee category metadata.
- Opening Pet Manager with 1,000+ catalog pets does not request all full `spritesheet.webp` files.
- Initial Pet Manager open requests only the v3 index, first page, and thumbnails for rendered/visible cards.
- Full `spritesheet.webp` files are requested only for selected detail animation, install packages, or runtime installed pets.
- v3 outage or validation failure falls back to v2 without breaking install/default/remove operations.
- `catalog.v2.json` remains within the compatibility limit expected by shipped desktop clients.
- Codex/local pet behavior is unchanged.
- Web generation validates unique v3 IDs, category counts, page URLs, response-size budgets, and thumbnail existence.
- Search finds matching catalog pets outside already-loaded pages and loads the relevant validated page(s) before rendering results.

## Test/check plan

Web:

```bash
cd web
bun lint
bun run build
bun run sync:pets
```

Desktop:

```bash
pnpm --filter @open-pets/desktop build
pnpm --filter @open-pets/desktop test
pnpm package:desktop:dir
```

Repository-level validation should run both command sets because `web/` is a nested Bun/Nuxt project, not a root pnpm workspace package.

Manual verification:

1. Publish or locally serve a v3 catalog with at least 1,000 pets.
2. Open desktop Pet Manager.
3. Confirm only index/page JSON and card thumbnails are loaded initially.
4. Scroll/load more and confirm requests grow by page/viewport, not by total catalog size.
5. Switch between `All`, `Western`, `Asian`, `Codex`, and `Installed`; confirm Codex remains unchanged and category filters match web categories.
6. Search for a pet that is not on the first loaded page and confirm it appears after the relevant page is loaded.
7. Select a pet and confirm detail fetches/uses its spritesheet animation while cards continue to use thumbnails.
8. Install a pet and confirm runtime installed pet behavior is unchanged.
9. Disable v3 and confirm v2 fallback works with category filters hidden/disabled.
10. Confirm Codex/local pets behave exactly as before.

## Resolved decisions

- `preview.webp` is deferred until after thumbnail/search/paging is stable.
- Phase implementation is gated by oracle review after each phase before moving to the next phase.
