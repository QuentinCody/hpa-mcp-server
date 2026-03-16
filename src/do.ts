import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class HpaDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        // Single gene entry (has Ensembl ID)
        const obj = data as Record<string, unknown>;
        if (obj.Ensembl && typeof obj.Ensembl === "string") {
            // Gene-level data with tissue expression, pathology, etc.
            return {
                tableName: "gene_data",
                indexes: ["Gene", "Ensembl", "Uniprot"],
            };
        }

        if (Array.isArray(data)) {
            const sample = data[0];
            if (sample && typeof sample === "object") {
                // Search results array
                if ("Gene" in sample || "Ensembl" in sample) {
                    return {
                        tableName: "search_results",
                        indexes: ["Gene", "Ensembl"],
                    };
                }
                // Tissue expression data
                if ("tissue" in sample && ("level" in sample || "nTPM" in sample)) {
                    return {
                        tableName: "tissue_expression",
                        indexes: ["tissue", "level", "cell_type"],
                    };
                }
                // Pathology data
                if ("cancer" in sample && ("prognostic" in sample || "favorable" in sample)) {
                    return {
                        tableName: "pathology",
                        indexes: ["cancer", "prognostic"],
                    };
                }
            }
        }

        return undefined;
    }
}
