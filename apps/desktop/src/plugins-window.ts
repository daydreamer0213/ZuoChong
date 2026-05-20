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
            transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1);
          }
          button:hover:not(:disabled) { transform: translateY(-1px); }
          button:active:not(:disabled) { transform: scale(0.96); }
          button:disabled { cursor: default; opacity: 0.54; transform: none; }

          button.primary { background: linear-gradient(180deg, #3b96ff, #176df2); color: #fff; box-shadow: 0 14px 28px rgba(37, 99, 235, 0.24), inset 0 1px 0 rgba(255,255,255,0.38); border-color: transparent; }
          button.primary:hover:not(:disabled) { background: linear-gradient(180deg, #55a6ff, #176df2); }

          button.secondary { background: rgba(255,255,255,0.76); color: #176df2; border-color: rgba(37, 99, 235, 0.42); box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 18px rgba(61, 99, 160, 0.08); }
          button.secondary:hover:not(:disabled) { background: rgba(255,255,255,0.95); border-color: rgba(37, 99, 235, 0.55); box-shadow: inset 0 1px 0 rgba(255,255,255,1), 0 8px 18px rgba(61, 99, 160, 0.12); }

          button.compact { min-height: 32px; padding: 0 10px; font-size: 11px; border-radius: 9px; }
          button.danger { color: #dc2626; border-color: rgba(220, 38, 38, 0.3); }

          /* Layout & Views */
          .view-section { display: none; }
          .view-section.active { display: block; }

          /* Plugin Hub Grid */
          .plugin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; margin-top: 24px; }

          /* Cards */
          .plugin-card { min-height: 248px; box-sizing: border-box; display: flex; flex-direction: column; gap: 9px; border: 1px solid rgba(126, 161, 210, 0.44); border-radius: 20px; background: rgba(255,255,255,0.76); box-shadow: 0 16px 38px rgba(61, 99, 160, 0.1), inset 0 1px 0 rgba(255,255,255,0.94); padding: 16px; }
          .plugin-card.featured { border-color: rgba(37, 99, 235, 0.36); background: linear-gradient(180deg, rgba(239, 247, 255, 0.92), rgba(255,255,255,0.78)); }
          .plugin-card.disabled { opacity: 0.74; filter: grayscale(0.5); }
          .plugin-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
          .plugin-icon { width: 48px; height: 48px; display: grid; place-items: center; border: 1px solid rgba(126, 161, 210, 0.34); border-radius: 16px; background: rgba(255,255,255,0.76); box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 10px 20px rgba(61, 99, 160, 0.08); font-size: 24px; }
          .plugin-icon img, .plugin-icon svg { width: 28px; height: 28px; object-fit: contain; }
          .plugin-card h2 { margin: 0; font-size: 20px; color: #102149; }
          .plugin-card p { flex: 1 1 auto; margin: 0; color: #526483; line-height: 1.35; font-size: 14px; }

          /* Status Pills */
          .status-pill { height: 30px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; border: 1px solid rgba(126, 161, 210, 0.36); border-radius: 10px; padding: 0 10px; background: rgba(255,255,255,0.68); color: #526483; font-size: 10px; font-weight: 900; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.05em; }
          .status-pill.success { color: #047857; background: rgba(236, 253, 245, 0.86); border-color: rgba(16, 185, 129, 0.28); }
          .status-pill.info { color: #176df2; background: rgba(239, 246, 255, 0.9); border-color: rgba(37, 99, 235, 0.28); }
          .status-pill.error { color: #b91c1c; background: rgba(254, 242, 242, 0.9); border-color: rgba(248, 113, 113, 0.32); }
          .status-pill.muted { color: #64748b; background: rgba(248, 250, 252, 0.82); }

          /* Actions */
          .plugin-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: auto; }
          .plugin-actions.stacked { grid-template-columns: 1fr; gap: 8px; }
          .plugin-actions button:only-child { grid-column: 1 / -1; }

          /* Detail View */
          .detail-toolbar { display: flex; justify-content: flex-start; margin-bottom: 24px; padding: 4px 2px 0; }
          .detail-pane { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
          .detail-header { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 16px; }
          .detail-header-text { flex: 1 1 auto; }
          .detail-header-text .eyebrow { margin: 0 0 4px; color: #2478ff; font-weight: 900; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }

          /* Config Sections */
          .config-card { box-sizing: border-box; border: 1px solid rgba(126, 161, 210, 0.44); border-radius: 20px; background: rgba(255,255,255,0.76); box-shadow: 0 16px 38px rgba(61, 99, 160, 0.1), inset 0 1px 0 rgba(255,255,255,0.94); padding: 20px; display: flex; flex-direction: column; gap: 16px; }
          .config-section-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 4px; }
          .config-section-header span:first-child { display: grid; gap: 4px; }
          .config-section-header small { color: #2478ff; font-size: 11px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
          .config-section-header strong { color: #102149; font-size: 18px; line-height: 1.2; }

          /* Form Controls */
          .form-group { display: flex; flex-direction: column; gap: 6px; }
          .form-group label { color: #102149; font-weight: 700; font-size: 14px; }
          .form-group .help-text { color: #63708f; font-size: 12px; margin-bottom: 4px; }
          .form-input { width: 100%; box-sizing: border-box; min-height: 38px; border: 1px solid rgba(126, 161, 210, 0.54); border-radius: 11px; background: rgba(255,255,255,0.82); color: #17284f; padding: 0 12px; outline: none; }
          .form-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
          textarea.form-input { padding: 10px 12px; min-height: 80px; resize: vertical; font-family: inherit; }

          /* Toggle Row */
          .toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 0; }
          .toggle-row-text { display: flex; flex-direction: column; gap: 2px; }
          .toggle-row-text strong { color: #102149; font-size: 14px; }
          .toggle-row-text small { color: #63708f; font-size: 12px; }

          /* CSS Toggle Switch */
          .toggle-switch { position: relative; width: 44px; height: 24px; display: inline-block; }
          .toggle-switch input { opacity: 0; width: 0; height: 0; }
          .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .2s; border-radius: 24px; }
          .toggle-slider:before { position: absolute; content: ""; height: 20px; width: 20px; left: 2px; bottom: 2px; background-color: white; transition: .2s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          input:checked + .toggle-slider { background-color: #10b981; }
          input:focus + .toggle-slider { box-shadow: 0 0 1px #10b981; }
          input:checked + .toggle-slider:before { transform: translateX(20px); }

          /* Chips / MultiSelect */
          .chips-container { display: flex; flex-wrap: wrap; gap: 8px; }
          .chip-label { display: inline-flex; align-items: center; cursor: pointer; }
          .chip-label input { position: absolute; opacity: 0; width: 0; height: 0; }
          .chip-text { display: inline-flex; align-items: center; justify-content: center; min-height: 32px; padding: 0 12px; border-radius: 16px; border: 1px solid rgba(126, 161, 210, 0.44); background: rgba(255,255,255,0.76); color: #526483; font-size: 13px; font-weight: 600; transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease; user-select: none; }
          .chip-label input:checked + .chip-text { background: rgba(239, 246, 255, 0.9); border-color: rgba(37, 99, 235, 0.5); color: #176df2; box-shadow: inset 0 1px 0 rgba(255,255,255,0.9); }

          /* List Editor */
          .list-editor { display: flex; flex-direction: column; gap: 12px; }
          .list-item-card { border: 1px solid rgba(126, 161, 210, 0.3); border-radius: 16px; background: rgba(255,255,255,0.5); padding: 16px; position: relative; display: flex; flex-direction: column; gap: 12px; }
          .list-item-remove { position: absolute; top: 12px; right: 12px; background: none; border: none; box-shadow: none; color: #94a3b8; padding: 4px; min-height: auto; border-radius: 6px; }
          .list-item-remove:hover { background: rgba(254, 242, 242, 0.8); color: #ef4444; }

          /* Dev Mode Toggle */
          .dev-toggle-container { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; margin-top: 24px; justify-content: flex-end; }

          /* Spinner */
          @keyframes spin { to { transform: rotate(360deg); } }
          .loading-icon { animation: spin 0.85s linear infinite; }

          /* Messages */
          .empty-state { text-align: center; padding: 48px; color: #64748b; }
        </style>
      </head>
      <body data-openpets-view="plugins">
        <main>
          <header>
            <div>
              <h1>${escapeHtml(definition.heading)}</h1>
              <p>${escapeHtml(definition.description)}</p>
            </div>
            <button id="plugins-refresh" type="button" class="secondary">Refresh</button>
          </header>

          <section id="plugins-status" class="muted" aria-live="polite">Loading plugins…</section>

          <div id="hub-view" class="view-section active">
            <div class="plugin-grid" id="plugins-grid">
              <!-- Cards rendered by preload -->
            </div>

            <div class="dev-toggle-container">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="checkbox" id="dev-mode-toggle" />
                Developer mode
              </label>
            </div>

            <div id="dev-actions" style="display: none; margin-top: 16px; text-align: right;">
              <button id="plugins-load-local" class="secondary">Load local plugin folder</button>
            </div>
          </div>

          <div id="detail-view" class="view-section">
            <div class="detail-toolbar">
              <button id="back-to-hub" class="secondary compact">Back to plugins</button>
            </div>
            <div class="detail-pane" id="plugin-detail-content">
              <!-- Detail content rendered by preload -->
            </div>
          </div>
        </main>
      </body>
    </html>`;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
