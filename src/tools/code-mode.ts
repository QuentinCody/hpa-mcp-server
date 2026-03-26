import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { hpaCatalog } from "../spec/catalog";
import { createHpaApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    HPA_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createHpaApiFetch();

    const searchTool = createSearchTool({
        prefix: "hpa",
        catalog: hpaCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "hpa",
        catalog: hpaCatalog,
        apiFetch,
        doNamespace: env.HPA_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
