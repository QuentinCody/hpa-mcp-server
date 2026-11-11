import { describeUpstreamError } from "./upstream-error";
export const HPA_ORIGIN = "https://www.proteinatlas.org";
export const FIELD_PAGE = "/about/help/dataaccess";
export const DVP_PAGE = "/humanproteome/single%2Bcell/dvp/data";
export function fail(message: string, status = 400): never { throw Object.assign(new Error(message), {status}); }
export function plain(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
    const value = code.startsWith("x") ? Number.parseInt(code.slice(1), 16) : Number(code);
    return value <= 0x10ffff ? String.fromCodePoint(value) : "�";
  }).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
export async function readSource(path: string, params: Record<string, unknown> = {}) {
  const url = new URL(path, HPA_ORIGIN);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await fetch(url, {headers: {Accept: params.format === "tsv" ? "text/tab-separated-values" : path.startsWith("/api/") || path.endsWith(".json") ? "application/json" : "text/html"}, redirect: "manual", signal: AbortSignal.timeout(25_000)});
  const reader = response.body?.getReader();
  if (!reader) fail("Empty HPA response", 502);
  const decoder = new TextDecoder("utf-8", {fatal: true, ignoreBOM: false});
  let text = ""; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2 * 1024 * 1024) fail("HPA response exceeds 2 MiB; narrow the query", 502);
      text += decoder.decode(chunk.value, {stream: true});
    }
    text += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const provenance = {source_url: url.toString(), retrieved_at: new Date().toISOString(), response_sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""), total_results: response.headers.get("X-Total-Results")};
  if (!response.ok) throw Object.assign(new Error(describeUpstreamError(response.status, text)), {status: response.status, data: {provider_response: text, provenance}});
  return {text, provenance, status: response.status};
}
export interface HpaField {code: string; label: string; evidence: string; unit: string | null}
export function parseFields(html: string): HpaField[] {
  const fields: HpaField[] = [];
  let inFields = false;
  for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    if (!/Column name/i.test(plain(table[1])) || !/Columns parameter value/i.test(plain(table[1]))) continue;
    inFields = true;
    for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = Array.from(row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi), m => plain(m[1]));
      if (cells.length !== 2 || cells[0] === "Column name") continue;
      const [label, code] = cells;
      if (!label || !code || code.length > 200 || /[\s,<>]/.test(code)) fail("HPA field table format changed", 502);
      const unit = label.match(/\[([^\]]+)\]$/)?.[1] ?? null;
      const evidence = code.startsWith("ct_dvp_") && unit === "Intensity" ? "DVP protein intensity" : code === "ct_dvp__tau" ? "DVP cell-type specificity score" : label.startsWith("RNA ") ? "RNA expression" : "provider field";
      fields.push({code, label, evidence, unit});
    }
  }
  if (!inFields || !fields.some(f => f.code === "eg" && f.label === "Ensembl") || !fields.some(f => f.code === "g" && f.label === "Gene")) fail("HPA field table identity columns unavailable", 502);
  // Provider aliases may share a code (e.g. secretome fields); retain every documented label.
  return fields;
}
export async function discoverFields() {
  const source = await readSource(FIELD_PAGE);
  return {fields: parseFields(source.text), provenance: source.provenance, release: null, release_pinned: false};
}
const DVP_FILES = ["dvp_cell_type.tsv.zip", "dvp_cell_types.tsv.zip", "dvp_cell_type_group_data.tsv.zip", "dvp_cell_type_group_cell_type_groups.tsv.zip", "dvp_sample_data.tsv.zip"];
export function parseDownloads(html: string) {
  const assets = new Map<string, {filename: string; url: string}>();
  for (const link of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    let url: URL;
    try { url = new URL(link[1].replace(/&amp;/g, "&"), HPA_ORIGIN + DVP_PAGE); } catch { continue; }
    if (url.protocol !== "https:" || url.hostname !== "www.proteinatlas.org" || url.port || url.username || url.password) continue;
    const filename = url.pathname.split("/").pop() ?? "";
    if (DVP_FILES.includes(filename)) assets.set(filename, {filename, url: url.toString()});
  }
  if (!assets.size) fail("HPA DVP download links unavailable or format changed", 502);
  return {assets: [...assets.values()], missing_documented_files: DVP_FILES.filter(name => !assets.has(name))};
}
export async function discoverDownloads() {
  const [data, release] = await Promise.all([readSource(DVP_PAGE), readSource("/about/download")]);
  const versions = [...new Set(Array.from(plain(release.text).matchAll(/(?:HPA\s+)?version\s+(\d+\.\d+)/gi), m => m[1]))];
  return {...parseDownloads(data.text), observed_release: versions.length === 1 ? versions[0] : null, release_candidates: versions,
    release_pinned: false, provenance: [data.provenance, release.provenance],
    note: "Links discovered from current provider documentation; files are not downloaded or checksum-verified. Cell-type-group matched_nCPM is RNA, distinct from protein Intensity. Current page release is not an atomic data snapshot."};
}
