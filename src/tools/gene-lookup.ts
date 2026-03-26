import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { hpaFetch } from "../lib/http";
import {
    createCodeModeResponse,
    createCodeModeError,
} from "@bio-mcp/shared/codemode/response";
import { shouldStage, stageToDoAndRespond } from "@bio-mcp/shared/staging/utils";

interface LookupEnv {
    HPA_DATA_DO?: {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(req: Request): Promise<Response> };
    };
}

export function registerGeneLookup(server: McpServer, env?: LookupEnv): void {
    server.registerTool(
        "hpa_gene_lookup",
        {
            title: "HPA Gene Lookup",
            description:
                "Look up a gene in the Human Protein Atlas by Ensembl ID. Returns comprehensive data: tissue expression (44 tissues), subcellular localization, pathology (cancer vs normal), cancer prognostics, and protein annotations.",
            inputSchema: {
                ensembl_id: z
                    .string()
                    .min(1)
                    .describe("Ensembl gene ID (e.g. 'ENSG00000141510' for TP53)"),
            },
        },
        async (args, extra) => {
            const runtimeEnv = env || (extra as { env?: LookupEnv })?.env;
            try {
                const ensemblId = String(args.ensembl_id).trim();

                const response = await hpaFetch(`/${ensemblId}.json`);

                if (!response.ok) {
                    const body = await response.text().catch(() => "");
                    throw new Error(`HPA API error: HTTP ${response.status}${body ? ` - ${body.slice(0, 300)}` : ""}`);
                }

                const data = await response.json();

                const responseSize = JSON.stringify(data).length;
                if (shouldStage(responseSize) && runtimeEnv?.HPA_DATA_DO) {
                    const staged = await stageToDoAndRespond(
                        data,
                        runtimeEnv.HPA_DATA_DO as DurableObjectNamespace,
                        "gene_lookup",
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
                            message: `HPA gene data staged. Use hpa_query_data with data_access_id '${staged.dataAccessId}' to query.`,
                        },
                        { meta: { staged: true, data_access_id: staged.dataAccessId } },
                    );
                }

                return createCodeModeResponse(data, {
                    meta: { fetched_at: new Date().toISOString() },
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return createCodeModeError("API_ERROR", `hpa_gene_lookup failed: ${msg}`);
            }
        },
    );
}
