import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const hpaCatalog: ApiCatalog = {
    name: "Human Protein Atlas",
    baseUrl: "https://www.proteinatlas.org",
    version: "current (documentation observed 25.1 on 2026-10-03; not pinned)",
    auth: "none",
    endpointCount: 6,
    notes:
        "- Gene data is accessed via /{ENSG_ID}.json (Ensembl gene ID)\n" +
        "- Search via /api/search_download.php with query params\n" +
        "- Code Mode paths: use /gene/{id} (mapped to /{id}.json) and /search (mapped to /api/search_download.php)\n" +
        "- Column codes for search: g=Gene, eg=Ensembl, up=UniProt, rnats=RNA tissue specificity, pe=Protein evidence\n" +
        "- Discover current column codes using /discovery/fields; DVP Intensity and RNA nCPM are different evidence types.\n" +
        "- /discovery/downloads returns provider-linked DVP archives, not their contents. Metadata reads do not pin API data to a release.",
    workflows: [{title: "Gene to DVP cell-type protein evidence", keywords: ["DVP", "protein", "cell type", "intensity", "HPA"],
        description: "Discover current fields and download assets, then request an exact Ensembl gene. Preserve native protein intensities and missing values; compare RNA evidence separately. Optional expected_release checks current documentation, not an atomic snapshot.",
        code: `return await api.get("/gene/ENSG00000141510/dvp", {columns: "ct_dvp_Hepatocytes,ct_dvp_Neurons"});`},
        {title: "Discover HPA download fields and DVP archives", keywords: ["download", "fields", "columns", "DVP", "bulk"],
            description: "Field tables can stage: inspect the returned handle with hpa_get_schema and hpa_query_data. Downloads are current provider links with an observed page release, not verified or pinned archive contents.",
            code: `const fields = await api.get("/discovery/fields");
if (fields.__api_error || fields.__stage_error) return fields;
const downloads = await api.get("/discovery/downloads");
return {fields, downloads};`}],
    endpoints: [
        {method: "GET", path: "/discovery/fields", category: "discovery", summary: "Local helper: read current provider field table, preserving codes, labels and DVP units with source hash. May stage; inspect staged rows before choosing columns."},
        {method: "GET", path: "/discovery/downloads", category: "discovery", summary: "Local helper: discover current DVP cell-type, group and sample archive links from provider HTML, report missing expected files and observed release. No bulk download or atomic release guarantee."},
        {method: "GET", path: "/gene/{ensembl_id}/dvp", category: "protein", summary: "Local helper: exact gene DVP protein intensity from documented API fields; retains native values, field labels and provenance. Fails closed on schema/identity mismatch. No absence inference.",
            pathParams: [{name: "ensembl_id", type: "string", required: true, description: "Unversioned ENSG plus 11 digits"}],
            queryParams: [{name: "columns", type: "string", required: false, description: "1–100 distinct comma-separated ct_dvp_ codes discovered from /discovery/fields; defaults to all current DVP Intensity fields"},
                {name: "expected_release", type: "string", required: false, description: "Optional major.minor; checks current download-page release, does not pin the API"}]},
        {
            method: "GET",
            path: "/gene/{ensembl_id}",
            summary: "Get gene JSON subset; XML is the provider’s most comprehensive individual entry format",
            category: "gene",
            pathParams: [
                { name: "ensembl_id", type: "string", required: true, description: "Ensembl gene ID (e.g. ENSG00000141510)" },
            ],
        },
        {
            method: "GET",
            path: "/search",
            summary: "Search HPA genes by name, tissue, cancer type, or other criteria with customizable columns",
            category: "search",
            queryParams: [
                { name: "search", type: "string", required: true, description: "Search query" },
                { name: "format", type: "string", required: false, description: "Response format", enum: ["json", "tsv"] },
                { name: "columns", type: "string", required: false, description: "Comma-separated column codes (e.g. 'g,eg,up,rnats')" },
                { name: "compress", type: "string", required: false, description: "Compression", enum: ["no"] },
            ],
        },
        {
            method: "GET",
            path: "/api/search_download.php",
            summary: "Direct search endpoint -- same as /search but using the raw HPA URL",
            category: "search",
            queryParams: [
                { name: "search", type: "string", required: true, description: "Search query" },
                { name: "format", type: "string", required: false, description: "Response format" },
                { name: "columns", type: "string", required: false, description: "Column codes" },
            ],
        },
    ],
};
