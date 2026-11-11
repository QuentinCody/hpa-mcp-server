import type { McpServer } from "@bio-mcp/shared/mcp";
import { z } from "zod";
import { createHpaApiFetch } from "../lib/api-adapter";
import { hpaResponse } from "../lib/tool-result";
import {
    createCodeModeResponse,
    createCodeModeError,
} from "@bio-mcp/shared/codemode/response";

interface SearchEnv {
    HPA_DATA_DO?: {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(req: Request): Promise<Response> };
    };
}

export function registerSearch(server: McpServer, env?: SearchEnv): void {
    for (const toolName of ["hpa_gene_search", "mcp_hpa_gene_search"]) server.registerTool(
        toolName,
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
                    .describe("Comma-separated column codes to include (e.g. 'g,eg,up,rnats,rnatsm'). Default: gene name, Ensembl, UniProt."),
                format: z
                    .enum(["json", "tsv"])
                    .default("json")
                    .optional()
                    .describe("Response format: 'json' or 'tsv' (default: json)"),
            },
        },
        async (args, extra) => {
            const runtimeEnv = env || (extra as { env?: SearchEnv })?.env;
            return hpaResponse(async () => {
                try {
                    const params: Record<string, unknown> = {
                        search: String(args.search),
                        format: args.format || "json",
                        compress: "no",
                        columns: "g,eg,up",
                    };
                    if (args.columns) {
                        params.columns = String(args.columns);
                    }

                    const {data} = await createHpaApiFetch()({method: "GET", path: "/search", params});

                    if (params.format === "tsv") return createCodeModeResponse(
                        {format: "tsv", data, total: null},
                        {meta: {fetched_at: new Date().toISOString()}},
                    );
                    const results = Array.isArray(data) ? data : [data];
                    return createCodeModeResponse(
                        { results, total: results.length },
                        { meta: { fetched_at: new Date().toISOString(), total: results.length } },
                    );
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    const evidence = err as {status?: number; data?: unknown};
                    return createCodeModeError("API_ERROR", `hpa_search failed: ${msg}`, {status: evidence.status, data: evidence.data});
                }
            }, runtimeEnv || {}, toolName, extra, args);
        },
    );
}
