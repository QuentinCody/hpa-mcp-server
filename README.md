# HPA MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream HPA API in natural language. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

Production endpoint (new local additions described below have not been deployed):

```
https://hpa-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "hpa": {
      "command": "npx",
      "args": ["mcp-remote", "https://hpa-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8843/mcp` (start it with `./scripts/dev-servers.sh hpa`):

```json
{
  "mcpServers": {
    "hpa-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8843/mcp"]
    }
  }
}
```

## Tools

- `hpa_search` — discover available API operations (Code Mode catalog search, 6 operations)
- `hpa_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `hpa_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `hpa_get_schema` — inspect the inferred schema of a staged dataset
- `hpa_gene_lookup`
- `hpa_gene_search`

Large responses (>30KB) are auto-staged into a queryable SQLite database; the tools return a `data_access_id` you can query with SQL.

Every tool returns both a human-readable `content` summary and a structured `structuredContent` payload.

## Development

```bash
./scripts/dev-servers.sh hpa            # run locally (port 8843)
pnpm --filter hpa-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

---

*Auto-generated baseline README — refine with server-specific detail as needed.*

## DVP evidence and discovery (verified locally 2026-10-03)

The [HPA programmatic-access table](https://www.proteinatlas.org/about/help/dataaccess)
exposes cell-type protein intensity fields separately from RNA expression. The
[download page](https://www.proteinatlas.org/about/download) identifies version 25.1;
this observation is not a pinned API release.

- `GET /discovery/fields`: parse the current provider field table, retaining codes,
  labels, measurement units and a hash of the retrieved HTML. Large tables stage.
- `GET /discovery/downloads`: discover links on the [DVP data page](https://www.proteinatlas.org/humanproteome/single%2Bcell/dvp/data)
  for cell-type, cell-type-group, sample and metadata archives. Missing expected
  assets are reported. No archive content is fetched or checksum-verified.
- `GET /gene/{ensembl_id}/dvp`: validate an exact unversioned human Ensembl ID,
  discover current DVP fields and request a bounded JSON subset through the
  documented search-download endpoint. Optional `columns` selects distinct
  `ct_dvp_` fields; `expected_release` checks the download-page major.minor version.
  Documentation and data reads are not an atomic snapshot.

```js
return await api.get("/gene/ENSG00000141510/dvp", {
  columns: "ct_dvp_Hepatocytes,ct_dvp_Neurons"
});
```

Native values, including zero, blank strings and null, survive unchanged. Missing
measurements are not evidence of absence. DVP protein Intensity is distinct from
RNA nCPM, absolute concentration and sample-level measurements; bulk group data's
`matched_nCPM` column remains RNA evidence. Discovery HTML and JSON schema changes
fail explicitly. Responses are bounded to 2 MiB and 25 seconds per upstream read.

All tools have `hpa_` and `mcp_hpa_` aliases and verifiable citations. API payloads
and complete tool envelopes stage above 30 KiB, including composed results, SQL
rows and native error evidence. Oversized results fail explicitly if staging is
unavailable. Complete-envelope handles expose `_staging` and `data_access_id` at
the structured root; API staging handles remain in `data`. Use bounded SQL reads
from `payloads.root_json` (and `content_chunks` when indicated) to recover the
complete original value. Gene arrays retain separate inferred SQL tables.
Search supports JSON and TSV with uncompressed downloads and default identity
columns. Individual gene JSON is a subset of the more comprehensive XML entry.

Live local acceptance now verifies all 1,990 documented fields, 27 DVP Intensity
fields, five archive links, gene JSON and search JSON/TSV against independent
provider reads. The TAU score remains a separate specificity measure. Both
recipes execute; field discovery returns its staging handle alongside the
archive links. ALB decimal strings, TP53 null values and empty unknown-gene
results are preserved. Complete staged payloads, citations and all eleven arrays
in the native TP53 gene record recover correctly through SQL.

The [provider license page](https://www.proteinatlas.org/about/licence) specifies
CC BY 4.0 for copyrightable database content, with possible third-party terms.
Citation metadata reflects that qualification. Archive bytes have not been
checksum-verified or ingested; normal HTTPS HEAD checks only established that
all five discovered ZIP URLs answered successfully. Changes remain undeployed.
Detailed test counts and acceptance artifacts are recorded in the
[implementation tracker](../../docs/plans/2026-09-26-upstream-api-implementation.md).

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from Human Protein Atlas and stays under the terms of that source: CC BY 4.0; some third-party terms.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
