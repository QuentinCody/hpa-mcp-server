import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const HPA_BASE = "https://www.proteinatlas.org";

export interface HpaFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the Human Protein Atlas API.
 */
export async function hpaFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: HpaFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? HPA_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "hpa-mcp-server/1.0 (bio-mcp)",
    });
}
