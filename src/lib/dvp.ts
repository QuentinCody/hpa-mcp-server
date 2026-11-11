import {discoverDownloads, discoverFields, fail, HpaField, readSource} from "./discovery";
export async function dvpGene(ensemblId: string, params: Record<string, unknown>) {
  if (!/^ENSG\d{11}$/.test(ensemblId)) fail("Use an unversioned human Ensembl gene ID (ENSG plus 11 digits)");
  for (const key of Object.keys(params)) if (!["columns", "expected_release"].includes(key)) fail(`Unsupported DVP parameter ${key}`);
  if (params.expected_release !== undefined && (typeof params.expected_release !== "string" || !/^\d+\.\d+$/.test(params.expected_release))) fail("expected_release must be a major.minor string");
  if (params.columns !== undefined && (typeof params.columns !== "string" || !params.columns || params.columns.length > 5000)) fail("columns must be a comma-separated string of DVP field codes");
  const [discovery, downloads] = await Promise.all([discoverFields(), discoverDownloads()]);
  if (params.expected_release !== undefined && downloads.observed_release !== params.expected_release) fail("HPA observed release differs from expected_release or could not be determined", 409);
  const available = discovery.fields.filter(f => f.code.startsWith("ct_dvp_") && f.unit === "Intensity");
  const { records, fields, source } = await readDvpRecords(params, available, ensemblId);
  return {ensembl_id: ensemblId, records, fields, observed_release: downloads.observed_release, release_pinned: false,
    provenance: [source.provenance, discovery.provenance, ...downloads.provenance],
    evidence: "Deep Visual Proteomics protein intensity; native values preserved. Missing/empty values are not evidence of absence. These are not RNA nCPM, absolute concentrations or per-sample measurements.",
    complete: false, note: "Selected gene/fields only. Documentation and API reads are not an atomic release snapshot; empty results do not prove no expression."};
}

async function readDvpRecords(params: Record<string, unknown>, available: HpaField[], ensemblId: string) {
  const requested = params.columns === undefined ? available.map(f => f.code) : (params.columns as string).split(",");
  if (!requested.length || requested.length > 100 || new Set(requested).size !== requested.length) fail("Select 1–100 distinct DVP column codes");
  const fields = requested.map(code => {
    const matches = available.filter(f => f.code === code);
    if (matches.length !== 1) fail(`DVP field unavailable or ambiguous: ${code}`);
    return matches[0];
  });
  const source = await readSource("/api/search_download.php", { search: ensemblId, format: "json", columns: ["g", "eg", ...requested].join(","), compress: "no" });
  let records: unknown;
  try { records = JSON.parse(source.text); } catch { fail("HPA returned invalid DVP JSON", 502); }
  if (!Array.isArray(records) || records.length > 1) fail("Expected at most one exact HPA gene record", 502);
  for (const record of records) {
    if (!record || typeof record !== "object" || record.Ensembl !== ensemblId || typeof record.Gene !== "string") fail("HPA gene identity mismatch or response schema changed", 502);
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(record, field.label) || !["string", "number"].includes(typeof record[field.label]) && record[field.label] !== null) fail(`HPA DVP response field missing or incompatible: ${field.label}`, 502);
    }
  }
  if (source.provenance.total_results !== null && source.provenance.total_results !== String(records.length)) fail("HPA result count disagrees with returned records", 502);
  return { records, fields, source };
}
