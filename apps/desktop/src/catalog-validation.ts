export interface CatalogV2 {
  readonly version: 2;
  readonly generatedAt: string;
  readonly pets: readonly CatalogPetV2[];
}

export interface CatalogPetV2 {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly preview: string;
  readonly zip: string;
}

export function validateCatalogV2(value: unknown): CatalogV2 {
  if (!isRecord(value)) throw new Error("Catalog must be an object.");
  if (value.version !== 2) throw new Error("Catalog version must be 2.");
  if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) throw new Error("Catalog generatedAt must be a valid date string.");
  if (!Array.isArray(value.pets)) throw new Error("Catalog pets must be an array.");
  if (value.pets.length > 1000) throw new Error("Catalog has too many pets.");

  const ids = new Set<string>();
  const pets = value.pets.map((pet) => validateCatalogPet(pet, ids));

  return {
    version: 2,
    generatedAt: value.generatedAt,
    pets,
  };
}

function validateCatalogPet(value: unknown, ids: Set<string>): CatalogPetV2 {
  if (!isRecord(value)) throw new Error("Catalog pet must be an object.");
  const id = validateId(value.id);

  if (ids.has(id)) throw new Error(`Duplicate catalog pet id: ${id}`);
  ids.add(id);

  return {
    id,
    displayName: validateString(value.displayName, "displayName", 120),
    description: validateString(value.description, "description", 500),
    preview: validateCatalogUrl(value.preview, "preview"),
    zip: validateCatalogUrl(value.zip, "zip"),
  };
}

function validateId(value: unknown): string {
  if (typeof value !== "string") throw new Error("Catalog pet id must be a string.");
  if (value === "builtin") throw new Error("Catalog pet id 'builtin' is reserved.");
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)) throw new Error(`Invalid catalog pet id: ${value}`);
  return value;
}

function validateString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`Catalog pet ${field} must be a string.`);
  if (value.length > maxLength) throw new Error(`Catalog pet ${field} is too long.`);
  return value;
}

function validateCatalogUrl(value: unknown, field: "preview" | "zip"): string {
  const raw = validateString(value, field, 2048);
  const url = new URL(raw);

  if (url.protocol !== "https:") throw new Error(`${field} URL must use https.`);
  if (url.username || url.password) throw new Error(`${field} URL cannot include credentials.`);
  if (url.port) throw new Error(`${field} URL cannot include a custom port.`);

  if (field === "preview") {
    if (url.hostname !== "openpets.dev" || !url.pathname.startsWith("/pets/")) throw new Error("Preview URL host/path is not allowed.");
  } else if (url.hostname !== "zip.openpets.dev" || !url.pathname.startsWith("/pets/")) {
    throw new Error("Zip URL host/path is not allowed.");
  }

  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
