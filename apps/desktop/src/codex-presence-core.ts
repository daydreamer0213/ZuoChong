export interface TasklistRow {
  readonly imageName: string;
  readonly windowTitle: string;
}

export function supportsCodexDesktopPresence(platform: NodeJS.Platform): boolean {
  return platform === "win32";
}

export function hasCodexDesktopWindow(stdout: string): boolean {
  return parseTasklistCsv(stdout).some((row) => {
    const image = row.imageName.toLowerCase();
    const title = row.windowTitle.trim();
    const isCodexProcess = image === "chatgpt.exe" || image === "codex.exe" || image === "codex-desktop.exe";
    return isCodexProcess && title === "Codex";
  });
}

export function parseTasklistCsv(stdout: string): TasklistRow[] {
  const rows: TasklistRow[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const columns = parseCsvLine(line);
    if (columns.length < 9) continue;
    rows.push({
      // tasklist /v /fo csv columns: Image Name, PID, Session Name, Session#,
      // Mem Usage, Status, User Name, CPU Time, Window Title.
      imageName: columns[0].trim(),
      windowTitle: columns[8].trim(),
    });
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      columns.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  columns.push(current);
  return columns;
}
