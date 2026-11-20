// Pure helpers: no Herdr or network calls, so they're easy to reason about.

export function relative(ts, now = Date.now() / 1000) {
  if (!ts) return "";
  const d = Math.max(0, now - ts);
  if (d < 60) return "now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 7 * 86400) return `${Math.floor(d / 86400)}d`;
  if (d < 60 * 86400) return `${Math.floor(d / (7 * 86400))}w`;
  return `${Math.floor(d / (30 * 86400))}mo`;
}

const pad = (n) => String(n).padStart(2, "0");
export const clock = (ts) => (ts ? `${pad(new Date(ts * 1000).getHours())}:${pad(new Date(ts * 1000).getMinutes())}` : "");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const day = (ts) => (ts ? `${MONTHS[new Date(ts * 1000).getMonth()]} ${new Date(ts * 1000).getDate()}` : "");

// owner/name from an origin URL (https, scp-style or ssh://), as Recherche names repos.
export function repoFromRemote(url) {
  const m = String(url).trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

// Recherche records the full hostname (often with .local); compare the first label.
export function sameHost(host, local) {
  if (!host || !local) return true;
  const short = (h) => h.split(".")[0].toLowerCase();
  return short(host) === short(local);
}

const quote = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);
export function resumeCommand(s) {
  const argv = (s.resume_argv ?? []).map(quote).join(" ");
  return s.cwd ? `cd ${quote(s.cwd)} && ${argv}` : argv;
}

export function tildify(path, home) {
  if (!path) return "";
  return home && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path;
}

export const firstLine = (text, max = 160) => {
  const line = String(text ?? "").trim().split("\n")[0];
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

// One line per tool call: tool inputs arrive as JSON text, and their description,
// command or path says more than the raw object.
export function toolLine(tool) {
  let input = tool.input ?? "";
  try {
    const o = JSON.parse(input);
    input = o.description ?? o.command ?? o.file_path ?? o.pattern ?? o.url ?? input;
  } catch {}
  return `${tool.name} ${firstLine(input, 140)}`;
}

export function clip(text, max) {
  const s = String(text ?? "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// PRs, tickets and branches get chips; files, worktrees and SHAs are noise here.
const CHIP_ORDER = ["pr", "ticket", "branch"];
export function chips(entities, max = 5) {
  return (entities ?? [])
    .filter((e) => CHIP_ORDER.includes(e.kind))
    .sort((a, b) => CHIP_ORDER.indexOf(a.kind) - CHIP_ORDER.indexOf(b.kind) || b.strength - a.strength)
    .slice(0, max)
    .map((e) => ({ kind: e.kind, label: e.kind === "pr" ? `PR ${e.display}` : e.display }));
}

// Where a resumed session goes: a new tab in a space that already has a terminal in the
// session's folder or below it (the focused space first); null means a new space there.
// Only this computer's spaces count, since sessions resume where they were recorded.
export function placeFor(cwd, spaceList, paneList, focusedSpace) {
  if (!cwd) return { space: focusedSpace ?? null };
  const root = cwd.replace(/\/+$/, "");
  const inside = (p) => Boolean(p) && (p.replace(/\/+$/, "") === root || p.startsWith(`${root}/`));
  const spaceOfTab = new Map(spaceList.flatMap((s) => s.tabs.map((t) => [t.id, s.id])));
  const hits = new Set(paneList.filter((p) => inside(p.cwd)).map((p) => spaceOfTab.get(p.tab)));
  const local = spaceList.filter((s) => !s.machine && hits.has(s.id));
  const found = local.find((s) => s.id === focusedSpace) ?? local[0];
  return found ? { space: found.id } : null;
}
