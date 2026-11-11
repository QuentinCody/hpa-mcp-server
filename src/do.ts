import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class HpaDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        // Keep parallel gene arrays in separate inferred tables; a fixed name
        // would collapse Uniprot, tissue and pathology collections into one.
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
