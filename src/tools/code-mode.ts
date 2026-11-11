import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { hpaCatalog } from "../spec/catalog";
import { createHpaApiFetch } from "../lib/api-adapter";
import { hpaResponse } from "../lib/tool-result";

interface CodeModeEnv {
    HPA_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createHpaApiFetch();
    const registrar = {tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        const handler = rest.pop() as (args: unknown, extra: unknown) => ReturnType<Parameters<typeof hpaResponse>[0]>;
        const respond = (args: unknown, extra: unknown) => hpaResponse(() => handler(args, extra), env, String(name), extra, args);
        const register = server.tool.bind(server) as (...values: unknown[]) => void;
        register(name, ...rest, respond); register(`mcp_${String(name)}`, ...rest, respond);
    }};

    const searchTool = createSearchTool({
        prefix: "hpa",
        catalog: hpaCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "hpa",
        catalog: hpaCatalog,
        apiFetch,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        preserveApiErrors: true,
        timeout: 90_000,
        doNamespace: env.HPA_DATA_DO,
        loader: env.CODE_MODE_LOADER,
        // Verifiable provenance: every hpa_execute result carries a _meta.citation.
        source: {
            id: "hpa",
            name: "Human Protein Atlas",
            url: "https://www.proteinatlas.org",
            license: "CC BY 4.0; third-party terms may apply",
        },
    });
    executeTool.register(registrar);
}
