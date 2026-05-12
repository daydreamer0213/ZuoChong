import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { app } from "electron";

import { validateCatalogV2, type CatalogPetV2, type CatalogV2 } from "./catalog-validation.js";

export const catalogUrl = "https://openpets.dev/pets/catalog.v2.json";
const fixtureRelativePath = "catalog.v2.fixture.json";
const maxCatalogBytes = 1_000_000;
const fetchTimeoutMs = 5_000;

export interface CatalogUiState {
  readonly source: "remote" | "fixture" | "error";
  readonly pets: readonly CatalogPetV2[];
  readonly generatedAt?: string;
  readonly error?: string;
}

export async function getCatalogUiState(): Promise<CatalogUiState> {
  const remote = await tryLoadRemoteCatalog();

  if (remote.ok) {
    return {
      source: "remote",
      pets: remote.catalog.pets,
      generatedAt: remote.catalog.generatedAt,
    };
  }

  const fixture = await tryLoadFixtureCatalog();

  if (fixture.ok) {
    return {
      source: "fixture",
      pets: fixture.catalog.pets,
      generatedAt: fixture.catalog.generatedAt,
      error: `Live catalog unavailable: ${remote.error}`,
    };
  }

  return {
    source: "error",
    pets: [],
    error: `Live catalog unavailable: ${remote.error}. Fixture unavailable: ${fixture.error}`,
  };
}

async function tryLoadRemoteCatalog(): Promise<{ readonly ok: true; readonly catalog: CatalogV2 } | { readonly ok: false; readonly error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const response = await fetch(catalogUrl, {
      signal: controller.signal,
      redirect: "error",
      credentials: "omit",
    });

    validateCatalogEndpoint(response.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await readLimitedResponse(response);
    return { ok: true, catalog: validateCatalogV2(JSON.parse(text) as unknown) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
  } finally {
    clearTimeout(timeout);
  }
}

async function tryLoadFixtureCatalog(): Promise<{ readonly ok: true; readonly catalog: CatalogV2 } | { readonly ok: false; readonly error: string }> {
  try {
    return { ok: true, catalog: validateCatalogV2(await loadFixtureCatalog()) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
  }
}

async function loadFixtureCatalog(): Promise<unknown> {
  const fixturePath = join(app.getAppPath(), fixtureRelativePath);
  return JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
}

async function readLimitedResponse(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Catalog response body is unavailable for bounded reading.");

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxCatalogBytes) throw new Error("Catalog response is too large.");
    chunks.push(value);
  }

  return new TextDecoder().decode(concatChunks(chunks, total));
}

function concatChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function validateCatalogEndpoint(value: string): void {
  const url = new URL(value);
  if (url.href !== catalogUrl) throw new Error("Catalog final URL is not allowed.");
}
