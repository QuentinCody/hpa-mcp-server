import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const hpaCatalog: ApiCatalog = {
    name: "Human Protein Atlas",
    baseUrl: "https://www.proteinatlas.org",
    version: "24.0",
    auth: "none",
    endpointCount: 5,
    notes:
        "- Gene data is accessed via /{ENSG_ID}.json (Ensembl gene ID)\n" +
        "- Search via /api/search_download.php with query params\n" +
        "- Code Mode paths: use /gene/{id} (mapped to /{id}.json) and /search (mapped to /api/search_download.php)\n" +
        "- Column codes for search: g=Gene, eg=Ensembl, up=UniProt, rnats=RNA tissue specificity, pe=Protein evidence\n" +
        "  t=Tissue expression, scl=Subcellular location, pa=Pathology, cs=Cancer specificity",
    endpoints: [
        {
            method: "GET",
            path: "/gene/{ensembl_id}",
            summary: "Get full gene entry with tissue expression, subcellular localization, pathology, and cancer data",
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
                { name: "columns", type: "string", required: false, description: "Comma-separated column codes (e.g. 'g,eg,up,rnats,t')" },
                { name: "compress", type: "string", required: false, description: "Compression", enum: ["yes", "no"] },
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
