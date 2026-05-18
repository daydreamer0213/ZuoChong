export type PluginsWindowDefinition = {
  readonly title: string;
  readonly heading: string;
  readonly description: string;
};

export function createPluginsHtml(definition: PluginsWindowDefinition): string {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(definition.title)}</title>
        <style>
          :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 12% 8%, rgba(219, 234, 254, 0.9), transparent 24%), linear-gradient(180deg, #f8fbff 0%, #eff7ff 54%, #e9f3ff 100%); color: #102149; overflow-y: scroll; }
          main { width: min(1040px, calc(100vw - 48px)); margin: 0 auto; padding: 48px 0 64px; }

          /* Typography */
          h1, h2, h3 { margin: 0; font-weight: 600; tracking: -0.02em; text-wrap: balance; }
          h1 { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; line-height: 1; letter-spacing: -0.05em; color: #102149; margin-bottom: 8px; }
          h2 { font-size: 20px; margin-bottom: 12px; color: #102149; }
          h3 { font-size: 16px; margin-bottom: 16px; color: #102149; }
          p { color: #63708f; line-height: 1.6; margin: 0; text-wrap: pretty; }
          .muted { color: #63708f; font-size: 14px; }

          /* Header */
          header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 32px; }

          /* Buttons */
          button, input, select, textarea { font: inherit; box-sizing: border-box; }
          button {
            display: inline-flex; align-items: center; justify-content: center; gap: 8px;
            min-height: 38px; padding: 0 12px; border-radius: 11px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; font-weight: 950;
            cursor: pointer; user-select: none;
            border: 1px solid rgba(37, 99, 235, 0.34); background: rgba(255,255,255,0.76); color: #176df2;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px rgba(61, 99, 160, 0.08);
          }
          button:hover:not(:disabled) { transform: translateY(-1px); }
          button:active:not(:disabled) { transform: scale(0.96); }
          button:disabled { cursor: default; opacity: 0.54; transform: none; }

          button.primary { background: linear-gradient(180deg, #3b96ff, #176df2); color: #fff; box-shadow: 0 14px 28px rgba(37, 99, 235, 0.24), inset 0 1px 0 rgba(255,255,255,0.38); border-color: transparent; }
          button.primary:hover:not(:disabled) { background: linear-gradient(180deg, #55a6ff, #176df2); }

          button.secondary { background: rgba(255,255,255,0.76); color: #176df2; border-color: rgba(37, 99, 235, 0.42); box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px rgba(61, 99, 160, 0.08); }
          button.secondary:hover:not(:disabled) { background: rgba(255,255,255,0.95); border-color: rgba(37, 99, 235, 0.55); box-shadow: inset 0 1px 0 rgba(255,255,255,1), 0 8px 18px rgba(61, 99, 160, 0.12); }

          button.destructive { color: #dc2626; border-color: rgba(239, 68, 68, 0.42); }
          button.destructive:hover:not(:disabled) { background: #fef2f2; border-color: rgba(239, 68, 68, 0.62); box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.08), inset 0 1px 0 rgba(255,255,255,0.94); }

          button:focus-visible, .discover-card:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }

          /* Segmented Control / Tabs */
          .tabs {
            display: inline-flex; background: rgba(239, 246, 255, 0.5); border: 1px solid rgba(126, 161, 210, 0.28);
            border-radius: 16px; padding: 4px; gap: 2px; margin-bottom: 32px;
          }
          .tab {
            background: transparent; border: none; border-radius: 12px; color: #526483;
            padding: 8px 20px; font-weight: 900; min-height: 36px; box-shadow: none; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 13px;
          }
          .tab:hover:not(:disabled) { background: rgba(255,255,255,0.4); color: #102149; transform: none; }
          .tab.active { background: rgba(255,255,255,0.82); color: #176df2; box-shadow: 0 4px 12px rgba(61, 99, 160, 0.08), inset 0 1px 0 rgba(255,255,255,0.9); border: 1px solid rgba(126, 161, 210, 0.34); }
          .tab.active:hover:not(:disabled) { background: rgba(255,255,255,0.9); }

          [hidden] { display: none !important; }
          /* Layouts */
          .layout { display: grid; grid-template-columns: 320px 1fr; gap: 24px; align-items: start; }

          /* Panels & Cards */
          .panel {
            background: rgba(255,255,255,0.76); border: 1px solid rgba(126, 161, 210, 0.44);
            border-radius: 20px; padding: 24px; box-shadow: 0 16px 38px rgba(61, 99, 160, 0.1), inset 0 1px 0 rgba(255,255,255,0.94);
          }

          .plugin-list { display: flex; flex-direction: column; gap: 8px; }

          /* Sidebar Cards */
          .plugin-card {
            display: flex; flex-direction: column; gap: 6px; width: 100%; text-align: left;
            padding: 16px; border-radius: 16px; background: rgba(255,255,255,0.5);
            border: 1px solid rgba(126, 161, 210, 0.28); cursor: pointer;
            box-shadow: none;
          }
          .plugin-card:hover { background: rgba(255,255,255,0.8); border-color: rgba(126, 161, 210, 0.44); transform: none; }
          .plugin-card:active { transform: scale(0.98); }
          .plugin-card.active {
            background: linear-gradient(180deg, rgba(239, 247, 255, 0.92), rgba(255,255,255,0.78)); border-color: rgba(37, 99, 235, 0.36);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.94);
          }

          /* Discover Grid */
          #plugins-discover-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
          .discover-card {
            display: flex; flex-direction: column; padding: 20px; border-radius: 20px;
            background: rgba(255,255,255,0.76); border: 1px solid rgba(126, 161, 210, 0.44);
            box-shadow: 0 16px 38px rgba(61, 99, 160, 0.1), inset 0 1px 0 rgba(255,255,255,0.94);
          }
          .discover-card:hover {
            border-color: rgba(37, 99, 235, 0.36); transform: translateY(-2px);
            box-shadow: 0 20px 42px rgba(61, 99, 160, 0.15), inset 0 1px 0 rgba(255,255,255,0.94);
          }
          .discover-card .actions { margin-top: auto; padding-top: 20px; }

          /* Detail View */
          .detail-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid rgba(126, 161, 210, 0.28); }
          .detail-title { display: flex; flex-direction: column; gap: 8px; }
          .detail-meta { display: flex; align-items: center; gap: 12px; font-size: 13px; color: #63708f; }

          /* Form Elements */
          .config-panel { background: rgba(239, 246, 255, 0.5); border-radius: 16px; padding: 24px; border: 1px solid rgba(126, 161, 210, 0.28); margin-bottom: 32px; }
          .field { display: grid; gap: 8px; margin-bottom: 20px; }
          .field:last-child { margin-bottom: 0; }
          label { color: #102149; font-weight: 900; font-size: 14px; }
          input, select, textarea {
            border: 1px solid rgba(126, 161, 210, 0.54); border-radius: 11px;
            background: rgba(255,255,255,0.82); color: #17284f; padding: 10px 14px;
            font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; outline: none;
          }
          input:focus, select:focus, textarea:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
          textarea { min-height: 100px; resize: vertical; line-height: 1.5; }

          /* Status & Badges */
          .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #64748b; }
          .status-dot.enabled { background: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4); }
          .status-dot.broken { background: #ef4444; box-shadow: 0 0 8px rgba(239, 68, 68, 0.4); }

          .pill {
            height: 30px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
            border: 1px solid rgba(126, 161, 210, 0.36); border-radius: 10px; padding: 0 10px;
            background: rgba(255,255,255,0.68); color: #526483; font-size: 10px; font-weight: 900; white-space: nowrap;
          }
          .pill.success { color: #047857; background: rgba(236, 253, 245, 0.86); border-color: rgba(16, 185, 129, 0.28); }
          .pill.error { color: #b91c1c; background: rgba(254, 242, 242, 0.9); border-color: rgba(248, 113, 113, 0.32); }

          /* Layout Utils */
          .actions { display: flex; flex-wrap: wrap; gap: 12px; }
          .actions-right { margin-left: auto; }
          .danger-zone {
            margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(239, 68, 68, 0.2);
            display: flex; justify-content: space-between; align-items: center;
          }
          .empty-state {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 64px 24px; text-align: center; gap: 16px;
          }
          .empty-state h3 { margin: 0; color: #102149; }
          .empty-state p { max-width: 400px; }

          /* Toggle Switch */
          .toggle {
            position: relative; display: inline-block; width: 44px; height: 24px; min-height: 24px; padding: 0;
            background: rgba(126, 161, 210, 0.28); border: 1px solid rgba(126, 161, 210, 0.44); border-radius: 999px; cursor: pointer;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);
          }
          .toggle.enabled { background: #10b981; border-color: #059669; }
          .toggle::after {
            content: ''; position: absolute; top: 1px; left: 1px; width: 20px; height: 20px;
            background: #fff; border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
          .toggle.enabled::after { transform: translateX(20px); }

          #plugins-status { margin-bottom: 24px; font-size: 14px; color: #63708f; }
          #plugins-status.error { color: #b91c1c; }
          @media (prefers-reduced-motion: reduce) { button:hover:not(:disabled), button:active:not(:disabled) { transform: none; } }
        </style>
      </head>
      <body data-openpets-view="plugins">
        <main>
          <header>
            <div>
              <h1>${escapeHtml(definition.heading)}</h1>
              <p>${escapeHtml(definition.description)}</p>
            </div>
            <button id="plugins-refresh" type="button">Refresh</button>
          </header>
          <nav class="tabs" aria-label="Plugin sections">
            <button id="plugins-installed-tab" class="tab active" type="button">Installed</button>
            <button id="plugins-discover-tab" class="tab" type="button">Discover</button>
            <button id="plugins-developer-tab" class="tab" type="button">Developer</button>
          </nav>
          <section id="plugins-status" class="muted" aria-live="polite">Loading plugins…</section>
          <section id="plugins-installed-view" class="layout">
            <div class="panel"><div id="plugins-list" class="plugin-list"></div></div>
            <div id="plugins-detail" class="panel empty">Select a plugin to configure it.</div>
          </section>
          <section id="plugins-discover-view" class="panel" hidden>
            <div id="plugins-discover-list" class="plugin-list"></div>
          </section>
          <section id="plugins-developer-view" class="panel" hidden>
            <h2>Developer plugins</h2>
            <p class="muted">Load a local manifest-only plugin folder for development. OpenPets snapshots only openpets.plugin.json into app data.</p>
            <button id="plugins-load-local" class="primary" type="button" style="margin-top: 24px;">Load local plugin folder</button>
          </section>
        </main>
      </body>
    </html>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
