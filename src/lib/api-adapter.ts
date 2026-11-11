import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import {discoverFields, discoverDownloads, fail, readSource} from "./discovery";
import {dvpGene} from "./dvp";

export function createHpaApiFetch(): ApiFetchFn {
    return async (request) => {
        if (request.method !== "GET" || request.body !== undefined) fail("HPA supports read-only GET requests");
        const params = {...request.params};
        if (request.path === "/discovery/fields" || request.path === "/discovery/downloads") {
            if (Object.keys(params).length) fail("Discovery takes no parameters");
            return {status: 200, data: await (request.path.endsWith("fields") ? discoverFields() : discoverDownloads())};
        }
        const dvp = request.path.match(/^\/gene\/([^/]+)\/dvp$/);
        if (dvp) return {status: 200, data: await dvpGene(dvp[1], params)};
        // Map clean paths to HPA's URL patterns
        let path = request.path;

        // Gene lookup: /gene/{id} → /{id}.json
        if (path.startsWith("/gene/")) {
            const id = path.replace("/gene/", "");
            if (!/^ENSG\d{11}$/.test(id)) fail("Invalid human Ensembl gene ID");
            if (Object.keys(params).length) fail("Gene lookup takes no query parameters");
            path = `/${id}.json`;
        }
        // Search: /search → /api/search_download.php
        else if (path === "/search" || path === "/api/search_download.php") {
            path = "/api/search_download.php";
            if (params.compress !== undefined && params.compress !== "no") fail("Use compress=no for Code Mode");
            params.compress = "no";
            params.format ??= "json";
            params.columns ??= "g,eg,up";
            if (!["json", "tsv"].includes(String(params.format))) fail("Use JSON or TSV format");
        } else fail("Unknown HPA path");

        const response = await readSource(path, params);
        if (params.format === "tsv") return {status: response.status, data: response.text};
        try { return {status: response.status, data: JSON.parse(response.text)}; }
        catch { throw Object.assign(new Error("HPA returned invalid JSON"), {status: 502, data: {provider_response: response.text, provenance: response.provenance}}); }
    };
}
