import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { hpaFetch } from "./http";

export function createHpaApiFetch(): ApiFetchFn {
    return async (request) => {
        // Map clean paths to HPA's URL patterns
        let path = request.path;

        // Gene lookup: /gene/{id} → /{id}.json
        if (path.startsWith("/gene/")) {
            const id = path.replace("/gene/", "");
            path = `/${id}.json`;
        }
        // Search: /search → /api/search_download.php
        else if (path === "/search" || path.startsWith("/search?")) {
            path = "/api/search_download.php";
        }

        const response = await hpaFetch(path, request.params);

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
