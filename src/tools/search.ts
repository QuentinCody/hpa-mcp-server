import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { hpaFetch } from "../lib/http";
import {
    createCodeModeResponse,
    createCodeModeError,
} from "@bio-mcp/shared/codemode/response";
import { shouldStage, stageToDoAndRespond } from "@bio-mcp/shared/staging/utils";

interface SearchEnv {
    HPA_DATA_DO?: {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(req: Request): Promise<Response> };
    };
}

export function registerSearch(server: McpServer, env?: SearchEnv) {
    server.registerTool(
        "hpa_gene_search",
        {
            title: "Search Human Protein Atlas",
            description:
                "Search HPA for genes by name, tissue, cancer type, or other criteria. Returns matching genes with selected data columns.",
            inputSchema: {
                search: z
                    .string()
                    .min(1)
                    .describe("Search query (gene name, tissue, cancer type, etc.)"),
                columns: z
                    .string()
                    .optional()
                    .describe("Comma-separated column codes to include (e.g. 'g,eg,up,rnats,rnatspm'). Default: gene name, Ensembl, UniProt."),
                format: z
                    .string()
                    .default("json")
                    .optional()
                    .describe("Response format: 'json' or 'tsv' (default: json)"),
            },
        },
        async (args, extra) => {
            const runtimeEnv = env || (extra as { env?: SearchEnv })?.env;
            try {
                const params: Record<string, unknown> = {
                    search: String(args.search),
                    format: args.format || "json",
                    compress: "no",
                };
                if (args.columns) {
                    params.columns = String(args.columns);
                }

                const response = await hpaFetch("/api/search_download.php", params);

                if (!response.ok) {
                    const body = await response.text().catch(() => "");
                    throw new Error(`HPA API error: HTTP ${response.status}${body ? ` - ${body.slice(0, 300)}` : ""}`);
                }

                const data = await response.json();

                const responseSize = JSON.stringify(data).length;
                if (shouldStage(responseSize) && runtimeEnv?.HPA_DATA_DO) {
                    const staged = await stageToDoAndRespond(
                        data,
                        runtimeEnv.HPA_DATA_DO as any,
                        "search",
                        undefined,
                        undefined,
                        "hpa",
                        (extra as { sessionId?: string })?.sessionId,
                    );
                    return createCodeModeResponse(
                        {
                            staged: true,
                            data_access_id: staged.dataAccessId,
                            total_rows: staged.totalRows,
                            _staging: staged._staging,
                            message: `Search results staged. Use hpa_query_data with data_access_id '${staged.dataAccessId}' to query.`,
                        },
                        { meta: { staged: true, data_access_id: staged.dataAccessId } },
                    );
                }

                const results = Array.isArray(data) ? data : [data];
                return createCodeModeResponse(
                    { results, total: results.length },
                    { meta: { fetched_at: new Date().toISOString(), total: results.length } },
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return createCodeModeError("API_ERROR", `hpa_search failed: ${msg}`);
            }
        },
    );
}
