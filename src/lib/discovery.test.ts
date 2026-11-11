import {afterEach, expect, it, vi} from "vitest";
import {createHpaApiFetch} from "./api-adapter";
import {DVP_PAGE, FIELD_PAGE, parseDownloads, parseFields, readSource} from "./discovery";
// Synthetic HTML/JSON fixtures based on documented columns, not captured live API responses.
const label = "Cell type protein - Hepatocytes [Intensity]";
const fields = `<table><tr><th>Column name</th><th>Columns parameter value</th></tr><tr><td>Gene</td><td>g</td></tr><tr><td>Ensembl</td><td>eg</td></tr><tr><td>${label}</td><td>ct_dvp_Hepatocytes</td></tr><tr><td>RNA single cell type - Hepatocytes [nCPM]</td><td>sc_RNA_Hepatocytes</td></tr></table>`;
const links = '<a href="/download/dvp_cell_type.tsv.zip">Download</a>';
const api = createHpaApiFetch();
function mock(record: unknown = [{Gene: "TP53", Ensembl: "ENSG00000141510", [label]: "0.00"}], version = "25.1", total?: string) {
  return vi.stubGlobal("fetch", vi.fn(async (input: URL) => {
    const url = new URL(input);
    if (url.pathname === FIELD_PAGE) return new Response(fields);
    if (url.pathname === DVP_PAGE) return new Response(links);
    if (url.pathname === "/about/download") return new Response(`HPA version ${version}`);
    return new Response(JSON.stringify(record), {headers: {"content-type": "application/json", ...(total === undefined ? {} : {"X-Total-Results": total})}});
  }));
}
afterEach(() => vi.unstubAllGlobals());
it("retains documented labels, exact field codes and different measurement units", () => {
  expect(parseFields(fields)).toEqual(expect.arrayContaining([
    {code: "ct_dvp_Hepatocytes", label, unit: "Intensity", evidence: "DVP protein intensity"},
    {code: "sc_RNA_Hepatocytes", label: "RNA single cell type - Hepatocytes [nCPM]", unit: "nCPM", evidence: "RNA expression"},
  ]));
});
it.each(["<html>unavailable</html>", fields.replace("Ensembl", "Changed"), fields.replace("ct_dvp_Hepatocytes", "bad,code")])("fails closed on field-table drift %#", html => expect(() => parseFields(html)).toThrow());
it("preserves provider aliases with the same code", () => {
  expect(parseFields(fields.replace("</table>", '<tr><td>Alias</td><td>g</td></tr></table>')).filter(f => f.code === "g")).toHaveLength(2);
});
it("only exposes observed same-origin HTTPS asset links, reporting partial discovery", () => {
  const parsed = parseDownloads(links + '<a href="https://evil.test/dvp_sample_data.tsv.zip">bad</a><a href="http://www.proteinatlas.org/dvp_cell_types.tsv.zip">bad</a>');
  expect(parsed.assets).toEqual([{filename: "dvp_cell_type.tsv.zip", url: "https://www.proteinatlas.org/download/dvp_cell_type.tsv.zip"}]);
  expect(parsed.missing_documented_files).toHaveLength(4);
});
it("does not manufacture download paths from labels", () => expect(() => parseDownloads('<p>dvp_cell_type.tsv.zip</p>')).toThrow());
it("discovers current release without claiming a pinned snapshot", async () => {
  mock();
  expect((await api({method: "GET", path: "/discovery/downloads"})).data).toMatchObject({observed_release: "25.1", release_pinned: false, provenance: [expect.objectContaining({response_sha256: expect.stringMatching(/^[a-f0-9]{64}$/)}), expect.any(Object)]});
});
it("marks conflicting release markers unresolved", async () => {
  mock(undefined, "25.1 and version 26.0");
  expect((await api({method: "GET", path: "/discovery/downloads"})).data).toMatchObject({observed_release: null});
});
it.each(["0.00", 0, null, "", "NA"])("retains native DVP measurement/missing value %j", async value => {
  mock([{Gene: "TP53", Ensembl: "ENSG00000141510", [label]: value}]);
  const result = await api({method: "GET", path: "/gene/ENSG00000141510/dvp", params: {expected_release: "25.1"}});
  expect(result.data).toMatchObject({records: [{[label]: value}], release_pinned: false, complete: false});
  const urls = vi.mocked(fetch).mock.calls.map(c => new URL(String(c[0])));
  const query = urls.find(u => u.pathname.startsWith("/api/"));
  expect(query?.searchParams.get("columns")).toBe("g,eg,ct_dvp_Hepatocytes");
  expect(query?.searchParams.get("compress")).toBe("no");
});
it.each([
  [{Gene: "TP53", Ensembl: "ENSG00000000000", [label]: 3}],
  [{Gene: "TP53", Ensembl: "ENSG00000141510"}],
  [{Gene: "TP53", Ensembl: "ENSG00000141510", [label]: {value: 3}}],
  {error: "upstream changed"},
  [1, 2],
])("rejects identity/response-schema drift %#", async records => {
  mock(records); await expect(api({method: "GET", path: "/gene/ENSG00000141510/dvp"})).rejects.toThrow();
});
it("allows no match without claiming biological absence", async () => {
  mock([]); expect((await api({method: "GET", path: "/gene/ENSG00000141510/dvp"})).data).toMatchObject({records: [], complete: false});
});
it("rejects a count mismatch", async () => {
  mock([], "25.1", "1"); await expect(api({method: "GET", path: "/gene/ENSG00000141510/dvp"})).rejects.toThrow("count");
});
it.each([{columns: "sc_RNA_Hepatocytes"}, {columns: "ct_dvp_Hepatocytes,ct_dvp_Hepatocytes"}, {columns: "made_up"}, {expected_release: "24.0"}, {expected_release: 25.1}, {limit: 5}])("rejects unsupported selection or release drift %#", async params => {
  mock(); await expect(api({method: "GET", path: "/gene/ENSG00000141510/dvp", params})).rejects.toThrow();
});
it.each([{format: "tsv"}, {columns: "g"}])("rejects query params on gene lookup %#", async params => {
  mock(); await expect(api({method: "GET", path: "/gene/ENSG00000141510", params})).rejects.toMatchObject({status: 400}); expect(fetch).not.toHaveBeenCalled();
});
it.each(["ENSG00000141510.1", "TP53", "../file"]) ("rejects invalid gene %s", async id => {
  mock(); await expect(api({method: "GET", path: `/gene/${id}`})).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
});
it.each(["/search", "/api/search_download.php"]) ("defaults raw/search aliases consistently: %s", async path => {
  mock([]); const params = {search: "TP53"}; await api({method: "GET", path, params});
  expect(params).toEqual({search: "TP53"});
  const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
  expect(url.searchParams.get("format")).toBe("json"); expect(url.searchParams.get("columns")).toBe("g,eg,up");
});
it("rejects unsupported methods and compressed attachments", async () => {
  mock(); await expect(api({method: "POST", path: "/discovery/fields"})).rejects.toThrow();
  await expect(api({method: "GET", path: "/search", params: {compress: "yes"}})).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
});
it("bounds upstream streaming reads and cancels on overflow", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(2 * 1024 * 1024 + 1))));
  await expect(readSource(FIELD_PAGE)).rejects.toThrow("2 MiB");
});
it("preserves HTTP status without embedding an HTML error page", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>failure</html>", {status: 503})));
  await expect(readSource(FIELD_PAGE)).rejects.toMatchObject({status: 503, message: expect.stringContaining("HTTP 503"), data: {provider_response: "<html>failure</html>", provenance: {response_sha256: expect.stringMatching(/^[a-f0-9]{64}$/)}}});
});
it("keeps DVP specificity scores separate from measured intensities", async () => {
  const html = fields.replace("</table>", "<tr><td>TAU score - Cell type protein</td><td>ct_dvp__tau</td></tr></table>");
  expect(parseFields(html).find(field => field.code === "ct_dvp__tau")).toEqual({code: "ct_dvp__tau", label: "TAU score - Cell type protein", unit: null, evidence: "DVP cell-type specificity score"});
  mock();
  await expect(api({method: "GET", path: "/gene/ENSG00000141510/dvp", params: {columns: "ct_dvp__tau"}})).rejects.toThrow();
});
it.each(["/gene/ENSG00000141510", "/search"])("bounds legacy route %s", async path => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(2 * 1024 * 1024 + 1))));
  await expect(api({method: "GET", path})).rejects.toThrow("2 MiB");
});
it("retains native malformed JSON as an explicit error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Not JSON</html>")));
  await expect(api({method: "GET", path: "/gene/ENSG00000141510"})).rejects.toMatchObject({status: 502, data: {provider_response: "<html>Not JSON</html>"}});
});
