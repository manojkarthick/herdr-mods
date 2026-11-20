// The local `recherche serve` JSON API (docs/api.md in the recherche repo). It's marked
// unstable, so every request and the fields the mod relies on go through here.
// Loopback needs no token.
const BASE = "http://127.0.0.1:7777";

export class Offline extends Error {}

async function get(path, params = {}) {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  let res;
  try {
    res = await fetch(`${BASE}/api${path}${query ? `?${query}` : ""}`);
  } catch {
    throw new Offline("Recherche isn't running. Start it with `brew services start recherche` or `recherche serve`.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Recherche answered ${res.status}.`);
  return body;
}

// An empty q browses recent sessions. repo takes owner/name or a folder name.
export const search = ({ q, repo, agent, limit = 50 }) => get("/search", { q, repo, agent, limit });
export const session = (id) => get(`/sessions/${encodeURIComponent(id)}`);
export const turns = (id, offset = 0, limit = 100) => get(`/sessions/${encodeURIComponent(id)}/turns`, { offset, limit });
export const webUrl = (id) => `${BASE}/s/${encodeURIComponent(id)}`;
