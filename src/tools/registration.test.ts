import {afterEach, expect, it, vi} from "vitest";
import {McpServer} from "@bio-mcp/shared/mcp";
import {createApiProxyTool} from "@bio-mcp/shared/tools/api-proxy";
import {registerCodeMode} from "./code-mode";
import {registerSearch} from "./search";
import {registerGeneLookup} from "./gene-lookup";
import {registerGetSchema} from "./get-schema";
import {registerQueryData} from "./query-data";
import {hpaCatalog} from "../spec/catalog";
import {createHpaApiFetch} from "../lib/api-adapter";
const json = (data: unknown) => new Response(JSON.stringify(data), {headers: {"content-type": "application/json"}});
afterEach(() => vi.unstubAllGlobals());
function registered() {
  const server = new McpServer({name: "fixture", version: "1"});
  registerCodeMode(server, {CODE_MODE_LOADER: {get: () => ({})}} as unknown as Parameters<typeof registerCodeMode>[1]);
  registerSearch(server, {}); registerGeneLookup(server, {}); registerQueryData(server, {}); registerGetSchema(server, {});
  return (server as unknown as {_registeredTools: Record<string, {handler: (args: unknown, extra: unknown) => Promise<unknown>}>})._registeredTools;
}
it("registers every HPA tool under both aliases and keeps both fields on errors", async () => {
  const tools = registered();
  for (const suffix of ["search", "execute", "gene_search", "gene_lookup", "query_data", "get_schema"]) {
    expect(tools[`hpa_${suffix}`]).toBeDefined(); expect(tools[`mcp_hpa_${suffix}`]).toBeDefined();
  }
  expect(await tools.mcp_hpa_query_data.handler({data_access_id: "hpa_fixture", sql: "SELECT 1"}, {})).toMatchObject({isError: true, content: expect.any(Array), structuredContent: expect.any(Object)});
});
it("searches TSV without trying to parse JSON", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Response("Gene\tEnsembl\nTP53\tENSG00000141510")));
  expect(await registered().hpa_gene_search.handler({search: "TP53", format: "tsv"}, {})).toMatchObject({content: expect.any(Array), structuredContent: {data: {format: "tsv", total: null}}});
  expect(await registered().mcp_hpa_gene_search.handler({search: "TP53", format: "tsv"}, {})).not.toHaveProperty("isError");
});
it("does not inline an oversized hand-built search result when staging is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => json([{Gene: "α".repeat(20000)}])));
  const result = await registered().hpa_gene_search.handler({search: "TP53"}, {});
  expect(result).toMatchObject({isError: true, content: expect.any(Array), structuredContent: expect.any(Object)});
  expect(JSON.stringify(result).length).toBeLessThan(30720);
});
it("stages field discovery with its source hash when it exceeds 30 KiB", async () => {
  const rows = Array.from({length: 600}, (_, i) => `<tr><td>RNA fixture ${i} [nCPM]</td><td>rna_${i}</td></tr>`).join("");
  const html = `<table><tr><td>Column name</td><td>Columns parameter value</td></tr><tr><td>Gene</td><td>g</td></tr><tr><td>Ensembl</td><td>eg</td></tr>${rows}</table>`;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html)));
  const stored: unknown[] = [];
  const namespace = {idFromName: (name: string) => name, get: () => ({fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      stored.push((await request.json() as {data: unknown}).data);
      return json({success: true, tables_created: ["fields"], total_rows: 602, input_rows: 602, table_row_counts: {fields: 602}});
    }
    return json({success: true, schema: {tables: {fields: {columns: [{name: "code"}]}}}});
  }})} as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({apiFetch: createHpaApiFetch(), catalog: hpaCatalog, doNamespace: namespace, stagingPrefix: "hpa", maxInlineBytes: 30 * 1024});
  expect(await proxy.handler({method: "GET", path: "/discovery/fields"}, {sql: () => []})).toMatchObject({__staged: true, data_access_id: expect.any(String)});
  expect(JSON.parse(stored[0] as string)).toMatchObject({fields: expect.arrayContaining([{label: "Gene", code: "g", evidence: "provider field", unit: null}]), provenance: {response_sha256: expect.stringMatching(/^[a-f0-9]{64}$/)}});
});
it.each([{__api_error: true}, {__stage_error: true}])("preserves workflow discovery handle %#", async handle => {
  const api = {get: vi.fn().mockResolvedValue(handle)};
  expect(await new Function("api", `return (async () => {${hpaCatalog.workflows?.[1].code}})()`)(api)).toEqual(handle);
  expect(api.get).toHaveBeenCalledTimes(1);
});

it("continues download discovery when fields are staged", async () => {
  const fields = {__staged: true, data_access_id: "fields"};
  const downloads = {assets: [{filename: "dvp_cell_type.tsv.zip"}]};
  const api = {get: vi.fn().mockResolvedValueOnce(fields).mockResolvedValueOnce(downloads)};
  expect(await new Function("api", `return (async () => {${hpaCatalog.workflows?.[1].code}})()`)(api)).toEqual({fields, downloads});
  expect(api.get).toHaveBeenCalledTimes(2);
});
