import type { McpServer } from "@bio-mcp/shared/mcp";
import { z } from "zod";
import { createHpaApiFetch } from "../lib/api-adapter";
import { hpaResponse } from "../lib/tool-result";
import {
    createCodeModeResponse,
    createCodeModeError,
} from "@bio-mcp/shared/codemode/response";

interface LookupEnv {
    HPA_DATA_DO?: {
        idFromName(name: string): unknown;
        get(id: unknown): { fetch(req: Request): Promise<Response> };
    };
}

export function registerGeneLookup(server: McpServer, env?: LookupEnv): void {
    for (const toolName of ["hpa_gene_lookup", "mcp_hpa_gene_lookup"]) server.registerTool(
        toolName,
        {
            title: "HPA Gene Lookup",
            description:
                "Look up a gene in the Human Protein Atlas by Ensembl ID. Returns the provider JSON subset; XML contains more comprehensive data. Use Code Mode DVP discovery for cell-type protein intensity.",
            inputSchema: {
                ensembl_id: z
                    .string()
                    .regex(/^ENSG\d{11}$/)
                    .describe("Ensembl gene ID (e.g. 'ENSG00000141510' for TP53)"),
            },
        },
        async (args, extra) => {
            const runtimeEnv = env || (extra as { env?: LookupEnv })?.env;
            return hpaResponse(async () => {
                try {
                    const ensemblId = String(args.ensembl_id).trim();

                    const {data} = await createHpaApiFetch()({method: "GET", path: `/gene/${ensemblId}`});

                    return createCodeModeResponse(data, {
                        meta: { fetched_at: new Date().toISOString() },
                    });
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    const evidence = err as {status?: number; data?: unknown};
                    return createCodeModeError("API_ERROR", `hpa_gene_lookup failed: ${msg}`, {status: evidence.status, data: evidence.data});
                }
            }, runtimeEnv || {}, toolName, extra, args);
        },
    );
}
