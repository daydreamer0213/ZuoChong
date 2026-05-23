import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import logoUrl from "../../../assets/onboarding-logo.webp";
import defaultThumbUrl from "../../../assets/default-pet-thumbnail.png";

const api = (window as unknown as { openPetsControlCenter: { getPetsState(): Promise<StateSnapshot>; getCatalog(): Promise<CatalogState>; getCatalogPage(page: number): Promise<CatalogState>; getCatalogSearch(): Promise<{ pets: SearchPetEntry[]; error?: string }>; getCodexPets(): Promise<CodexState>; setDefaultPet(petId: string): Promise<StateSnapshot>; installPet(petId: string): Promise<unknown>; importCodexPet(petId: string): Promise<unknown>; removePet(petId: string): Promise<StateSnapshot> } }).openPetsControlCenter;
type Filter = "all" | "installed" | "original" | "western" | "asian" | "codex";
type InstalledPet = { id: string; displayName: string; description?: string; builtIn: boolean; protected: boolean; installed: boolean; broken?: boolean; brokenReason?: string; source?: { kind?: "catalog"; preview?: string } | { kind: "codex"; path: string } };
type PetEntry = { id: string; displayName: string; description?: string; searchText?: string; preview?: string; thumbnail?: string; spritesheet?: string; category?: "western" | "asian"; original?: boolean; featured?: boolean; catalogPage?: number; sourceKind?: "installed" | "catalog" | "codex"; installed?: boolean; builtIn?: boolean; protected?: boolean; broken?: boolean; brokenReason?: string };
type SearchPetEntry = Pick<PetEntry, "id" | "displayName" | "category" | "original" | "featured"> & { searchText?: string; catalogPage?: number };
type StateSnapshot = { preferences: { defaultPetId: string }; pets: { installed: InstalledPet[] } };
type CatalogState = { pets: PetEntry[]; source: string; error?: string; page?: number; pageCount?: number; total?: number; categories?: { id: "western" | "asian"; label: string; count: number }[]; originalsCount?: number };
type CodexState = { pets: PetEntry[]; error?: string };


function Button({ children, variant = "primary", onClick, disabled }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger"; onClick?: () => void; disabled?: boolean }) {
  return <button className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>{children}</button>;
}
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <section className={`glass ${className}`}>{children}</section>; }
function StatusPill({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "orange" | "red" | "slate" }) { return <span className={`pill pill-${tone}`}>{children}</span>; }
function SearchInput(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input className="search" placeholder="Search pets..." {...props} />; }

function isAllowedCatalogPreview(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && 
      url.hostname === "openpets.dev" && 
      url.port === "" && 
      url.username === "" && 
      url.password === "" && 
      url.pathname.startsWith("/pets/") && 
      url.pathname.endsWith(".webp");
  } catch {
    return false;
  }
}

function isAllowedCodexPreview(value: string | undefined): value is string {
  return typeof value === "string" && /^openpets-codex:\/\/spritesheet\/[a-zA-Z0-9%][a-zA-Z0-9%_-]{0,128}$/u.test(value);
}

function isAllowedDataUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^data:image\/(?:png|webp|jpeg|jpg);base64,[a-z0-9+/=]+$/iu.test(value);
}

function safePetImage(value: string | undefined): string | undefined {
  return isAllowedCatalogPreview(value) || isAllowedCodexPreview(value) || isAllowedDataUrl(value) ? value : undefined;
}

function imageDebug(value: string | undefined): string {
  if (!value) return "missing";
  if (value.startsWith("data:image/")) return `data:${value.slice(5, 16)}`;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

function logPetsEvent(event: string, fields: Record<string, unknown>): void {
  console.info(`[ControlCenterPets] ${JSON.stringify({ event, ...fields })}`);
}

function logPetsError(event: string, fields: Record<string, unknown>): void {
  console.error(`[ControlCenterPets] ${JSON.stringify({ event, ...fields })}`);
}

const spriteFrameSizes = {
  thumb: { width: 54, height: 58 },
  detail: { width: 144, height: 156 },
  mini: { width: 56, height: 61 },
} as const;

const spriteStates = {
  idle: { row: 0, frames: 6, duration: "1.65s" },
  thinking: { row: 8, frames: 6, duration: "1.55s" },
  wave: { row: 3, frames: 4, duration: "1.25s" },
  happy: { row: 4, frames: 5, duration: "1.35s" },
} as const;

function SpriteFrame({ src, label, state = "idle", size = "detail" }: { src?: string; label: string; state?: "idle" | "thinking" | "happy" | "wave"; size?: "thumb" | "detail" | "mini" }) {
  const safeSrc = safePetImage(src);
  if (!safeSrc) return <img src={defaultThumbUrl} alt="" />;
  const frame = spriteFrameSizes[size];
  const sprite = spriteStates[state];
  const xValues = Array.from({ length: sprite.frames }, (_, index) => String(-index * frame.width)).join(";");
  const y = -sprite.row * frame.height;
  return <svg className={`sprite-frame sprite-${state} sprite-${size}`} width={frame.width} height={frame.height} viewBox={`0 0 ${frame.width} ${frame.height}`} role="img" aria-label={label}>
    <image href={safeSrc} x="0" y={y} width={frame.width * 8} height={frame.height * 9} preserveAspectRatio="none" onError={() => logPetsError("sprite-failed", { label, state, size, src: imageDebug(safeSrc) })}>
      <animate attributeName="x" values={xValues} dur={sprite.duration} repeatCount="indefinite" calcMode="discrete" />
    </image>
  </svg>;
}

function PetImage({ src, alt = "", debugLabel }: { src?: string; alt?: string; debugLabel: string }) {
  const safeSrc = safePetImage(src) || defaultThumbUrl;
  return <img src={safeSrc} alt={alt} draggable="false" onError={() => logPetsError("image-failed", { label: debugLabel, src: imageDebug(safeSrc) })} />;
}

function App() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [catalogPages, setCatalogPages] = useState<Record<number, PetEntry[]>>({});
  const [catalogSearch, setCatalogSearch] = useState<SearchPetEntry[] | null>(null);
  const [catalogPage, setCatalogPage] = useState(0);
  const [codex, setCodex] = useState<CodexState>({ pets: [] });
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const [nextState, nextCatalog, nextCodex] = await Promise.all([api.getPetsState(), api.getCatalog(), api.getCodexPets()]);
    logPetsEvent("load-complete", { installed: nextState.pets.installed.length, defaultPetId: nextState.preferences.defaultPetId, catalogSource: nextCatalog.source, catalogPets: nextCatalog.pets.length, catalogPage: nextCatalog.page, catalogPageCount: nextCatalog.pageCount, codexPets: nextCodex.pets.length, catalogError: nextCatalog.error, codexError: nextCodex.error, firstCatalogPet: nextCatalog.pets[0] ? { id: nextCatalog.pets[0].id, preview: imageDebug(nextCatalog.pets[0].preview), thumbnail: imageDebug(nextCatalog.pets[0].thumbnail), spritesheet: imageDebug(nextCatalog.pets[0].spritesheet) } : null });
    setState(nextState); setCatalog(nextCatalog); setCodex(nextCodex);
    setCatalogPage(nextCatalog.page ?? 0);
    setCatalogPages({ [nextCatalog.page ?? 0]: nextCatalog.pets });
    setSelectedId((current) => current || nextState.preferences.defaultPetId || nextState.pets.installed[0]?.id || nextCatalog.pets[0]?.id || "");
  }
  useEffect(() => { void load().catch((err) => setError(String(err?.message ?? err))); }, []);

  const pets = useMemo(() => {
    const installed = new Map((state?.pets.installed ?? []).map((p) => [p.id, p]));
    const catalogMap = new Map<string, PetEntry>();
    for (const pagePets of Object.values(catalogPages)) {
      for (const p of pagePets) {
        catalogMap.set(p.id, p);
      }
    }
    const codexMap = new Map<string, PetEntry>((codex.pets ?? []).map((p) => [p.id, p]));

    const rows: PetEntry[] = (state?.pets.installed ?? []).map((p) => {
      const catalogPet = catalogMap.get(p.id);
      const codexPet = codexMap.get(p.id);
      const spritesheet = safePetImage(codexPet?.spritesheet) || safePetImage(catalogPet?.spritesheet);
      const preview = safePetImage(codexPet?.preview) || safePetImage(catalogPet?.preview) || safePetImage(catalogPet?.thumbnail) || safePetImage(p.source && "preview" in p.source ? (p.source as { preview?: string }).preview : undefined) || defaultThumbUrl;
      const category = catalogPet?.category;
      const original = catalogPet?.original;
      return {
        ...p,
        spritesheet,
        preview,
        category,
        original,
        sourceKind: "installed" as const,
        installed: true,
      };
    });

    for (const p of catalogMap.values()) {
      if (!installed.has(p.id)) {
        rows.push({
          ...p,
          preview: safePetImage(p.preview) || safePetImage(p.thumbnail) || defaultThumbUrl,
          spritesheet: safePetImage(p.spritesheet),
          sourceKind: "catalog",
          installed: false,
        });
      }
    }

    for (const p of codexMap.values()) {
      if (!installed.has(p.id) && !catalogMap.has(p.id)) {
        rows.push({
          ...p,
          preview: safePetImage(p.preview),
          spritesheet: safePetImage(p.spritesheet),
          sourceKind: "codex",
          installed: false,
        });
      }
    }

    return rows.filter((p) => {
      if (filter === "installed" && !p.installed) return false;
      if (filter === "codex" && p.sourceKind !== "codex" && !(installed.get(p.id)?.source?.kind === "codex")) return false;
      if (filter === "original" && !p.original && !p.builtIn) return false;
      if ((filter === "western" || filter === "asian") && p.category !== filter) return false;
      const q = query.trim().toLowerCase();
      return !q || `${p.displayName} ${p.description ?? ""} ${p.searchText ?? ""} ${p.id}`.toLowerCase().includes(q);
    });
  }, [state, catalogPages, catalogSearch, codex, filter, query]);

  const selected = pets.find((p) => p.id === selectedId) ?? pets[0];
  const defaultId = state?.preferences.defaultPetId;

  useEffect(() => {
    if (!selected) return;
    logPetsEvent("selected-pet", { id: selected.id, sourceKind: selected.sourceKind, installed: selected.installed, builtIn: selected.builtIn, preview: imageDebug(selected.preview), spritesheet: imageDebug(selected.spritesheet), hasSafePreview: Boolean(safePetImage(selected.preview)), hasSafeSpritesheet: Boolean(safePetImage(selected.spritesheet)), catalogPages: Object.keys(catalogPages).join(",") });
  }, [selected]);

  const statusText = useMemo(() => {
    if (!selected) return "";
    const isDefault = selected.id === defaultId;
    const isCodex = selected.sourceKind === "codex" || (state?.pets.installed.find(p => p.id === selected.id)?.source?.kind === "codex");
    if (selected.broken) return selected.brokenReason || "This installed pet is broken and cannot be selected as default.";
    if (isDefault) return selected.protected ? "Default built-in pet. Protected from removal." : "Default pet.";
    if (selected.installed) {
      if (isCodex) return "Installed and ready to become your default pet. Also found in ~/.codex/pets.";
      return "Installed and ready to become your default pet.";
    }
    if (selected.sourceKind === "codex") return "Available to import from ~/.codex/pets.";
    return "Available to install from the catalog.";
  }, [selected, defaultId, state]);

  async function act(label: string, fn: () => Promise<unknown>) {
    if (!selected) return;
    try { setBusy(label); setError(""); await fn(); await load(); }
    catch (err) { setError(String((err as Error)?.message ?? err)); }
    finally { setBusy(""); }
  }

  useEffect(() => {
    if (catalogSearch) return;
    void api.getCatalogSearch().then((result) => {
      if (result.error) setError(result.error);
      setCatalogSearch(result.pets ?? []);
    }).catch((err) => setError(String(err?.message ?? err)));
  }, [catalogSearch]);

  useEffect(() => {
    if (!catalogSearch) return;
    const q = query.trim().toLowerCase();
    const needsRemotePages = !!q || filter === "original" || filter === "western" || filter === "asian";
    
    const pages = new Set<number>();
    
    if (state?.pets.installed) {
      for (const p of state.pets.installed) {
        const searchPet = catalogSearch.find(sp => sp.id === p.id);
        if (searchPet && typeof searchPet.catalogPage === "number" && !catalogPages[searchPet.catalogPage]) {
          pages.add(searchPet.catalogPage);
        }
      }
    }

    if (needsRemotePages) {
      for (const pet of catalogSearch) {
        if (pages.size >= 12) break;
        if ((filter === "western" || filter === "asian") && pet.category !== filter) continue;
        if (filter === "original" && !pet.original) continue;
        if (q && !`${pet.displayName} ${pet.searchText ?? ""} ${pet.id}`.toLowerCase().includes(q)) continue;
        if (typeof pet.catalogPage === "number" && !catalogPages[pet.catalogPage]) pages.add(pet.catalogPage);
      }
    }
    
    if (!pages.size) return;
    let cancelled = false;
    void Promise.all([...pages].map((page) => api.getCatalogPage(page).catch((err) => ({ source: "error", pets: [], error: String((err as Error)?.message ?? err), page } as CatalogState)))).then((results) => {
      if (cancelled) return;
      setCatalogPages((current) => {
        const next = { ...current };
        for (const result of results) if (result.source !== "error") next[result.page ?? 0] = result.pets;
        return next;
      });
      const firstError = results.find((result) => result.source === "error")?.error;
      if (firstError) setError(firstError);
    });
    return () => { cancelled = true; };
  }, [catalogPages, catalogSearch, filter, query, state]);

  async function loadCatalogPage(page: number) {
    if (catalogPages[page]) { setCatalogPage(page); return; }
    try {
      setBusy("Loading page"); setError("");
      const next = await api.getCatalogPage(page);
      setCatalog(next); setCatalogPage(next.page ?? page); setCatalogPages((pages) => ({ ...pages, [next.page ?? page]: next.pets }));
    } catch (err) { setError(String((err as Error)?.message ?? err)); }
    finally { setBusy(""); }
  }

  return <main className="app-shell">
    <header className="hero">
      <img src={logoUrl} alt="OpenPets" />
      <div><p className="eyebrow">Control Center Preview</p><h1>Pets</h1><p>Install, import, preview, and choose your default desktop companion.</p></div>
    </header>
    {error && <div className="error">{error}</div>}
    <div className="layout">
      <GlassCard className="gallery">
        <div className="toolbar"><SearchInput value={query} onChange={(e) => setQuery(e.target.value)} /><StatusPill tone="slate">{pets.length} pets</StatusPill></div>
        <div className="filters">{(["all", "installed", "original", "western", "asian", "codex"] as Filter[]).map((f) => <button key={f} className={`filter ${filter === f ? "active" : ""} ${f === "original" ? "original" : ""}`} onClick={() => setFilter(f)}>{f}</button>)}</div>
        {!!catalog?.pageCount && catalog.pageCount > 1 && <div className="pager"><Button variant="secondary" disabled={!!busy || catalogPage <= 0} onClick={() => void loadCatalogPage(catalogPage - 1)}>Prev</Button><span>Catalog page {catalogPage + 1} of {catalog.pageCount}</span><Button variant="secondary" disabled={!!busy || catalogPage >= catalog.pageCount - 1} onClick={() => void loadCatalogPage(catalogPage + 1)}>Next</Button></div>}
        <div className="pets-grid">{pets.map((pet) => {
          const isBuiltIn = pet.builtIn;
          const hasDistinctPreview = pet.preview && pet.preview !== pet.spritesheet;
          const useSpritesheetFrame = !isBuiltIn && !hasDistinctPreview && !!pet.spritesheet;
          return (
            <button key={`${pet.sourceKind}-${pet.id}`} className={`pet-card ${selected?.id === pet.id ? "selected" : ""}`} onClick={() => setSelectedId(pet.id)}>
              <span className="thumb">
                {useSpritesheetFrame ? (
                  <SpriteFrame src={pet.spritesheet} label={`${pet.displayName} thumbnail`} size="thumb" />
                ) : (
                  <PetImage src={pet.preview} debugLabel={`${pet.id}:card`} />
                )}
              </span>
              <div className="card-content">
                <span className="card-title-row">
                  <b className="card-title">{pet.displayName}</b>
                </span>
                <p className="card-desc">{pet.description || pet.id}</p>
                <div className="badges">{pet.id === defaultId && <StatusPill tone="green">Default</StatusPill>}{pet.installed && <StatusPill>Installed</StatusPill>}{pet.sourceKind === "codex" && <StatusPill tone="orange">Codex</StatusPill>}</div>
              </div>
            </button>
          );
        })}</div>
      </GlassCard>
      <GlassCard className="detail">
        {selected ? <><p className="eyebrow">Pet detail</p><h2>{selected.displayName}</h2><p className="desc">{selected.description || selected.id}</p>
          <div className="stage">
            {safePetImage(selected.spritesheet) ? (
              <SpriteFrame src={selected.spritesheet} label={`${selected.displayName} animated preview`} />
            ) : (
              <PetImage src={selected.preview} debugLabel={`${selected.id}:detail-fallback`} />
            )}
          </div>
          <div className="meta">
            <StatusPill tone={selected.broken ? "red" : selected.installed ? "green" : "blue"}>
              {selected.broken ? "Broken" : selected.installed ? "Ready" : "Available"}
            </StatusPill>
            {selected.builtIn && <StatusPill tone="orange">Originals</StatusPill>}
          </div>
          {statusText && <p className="text-sm text-slatecopy mt-3 mb-0 font-medium">{statusText}</p>}
          
          {safePetImage(selected.spritesheet) && (
            <>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slatecopy mt-6 mb-3">Preview Animations</h3>
              <div className="grid grid-cols-3 gap-3 mb-2">
                {[
                  { label: "Thinking", state: "thinking" as const },
                  { label: "Happy", state: "happy" as const },
                  { label: "Wave", state: "wave" as const }
                ].map((preview) => (
                  <div key={preview.label} className="flex flex-col items-center gap-2 rounded-2xl border border-blue-100 bg-white/50 p-3 shadow-sm">
                    <SpriteFrame src={selected.spritesheet} label={`${selected.displayName} ${preview.label} preview`} state={preview.state} size="mini" />
                    <span className="text-xs font-bold text-slatecopy">{preview.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="actions">
            {!selected.installed && selected.sourceKind === "catalog" && <Button disabled={!!busy} onClick={() => act("Installing", () => api.installPet(selected.id))}>{busy || "Install pet"}</Button>}
            {!selected.installed && selected.sourceKind === "codex" && <Button disabled={!!busy} onClick={() => act("Importing", () => api.importCodexPet(selected.id))}>{busy || "Import Codex pet"}</Button>}
            {selected.installed && selected.id !== defaultId && !selected.broken && <Button disabled={!!busy} onClick={() => act("Setting default", () => api.setDefaultPet(selected.id))}>Set default</Button>}
            {selected.installed && !selected.builtIn && !selected.protected && <Button variant="danger" disabled={!!busy} onClick={() => act("Removing", () => api.removePet(selected.id))}>Remove</Button>}
            <Button variant="secondary" disabled={!!busy} onClick={() => void load()}>Refresh</Button>
          </div></> : <p>No pets available.</p>}
      </GlassCard>
    </div>
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
