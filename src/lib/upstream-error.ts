/**
 * Upstream error-body summarisation for HPA.
 *
 * The Human Protein Atlas answers 4xx/5xx with a full HTML error page. Pasting
 * that verbatim into a tool error burns the caller's context and tells a model
 * nothing it can act on — a live fleet sweep (2026-07-27) caught
 * `hpa_gene_lookup` returning `HTTP 404 - <!DOCTYPE HTML><html><head><title>The
 * Human Protein Atlas</title>...` as its entire diagnostic.
 *
 * An HTML body carries no machine-usable detail, so it is replaced with a short
 * marker. Non-HTML bodies (JSON errors, plain text) are still useful and are
 * kept, truncated.
 */

const MAX_BODY_CHARS = 300;
/** Enough of the body to recognise a doctype/-html/-title preamble. */
const SNIFF_CHARS = 200;

/** True when the body looks like a served HTML page rather than an API error. */
export function looksLikeHtml(body: string): boolean {
	const head = body.trimStart().slice(0, SNIFF_CHARS).toLowerCase();
	return (
		head.startsWith("<!doctype html") ||
		head.startsWith("<html") ||
		(head.includes("<head") && head.includes("<title"))
	);
}

/**
 * Render an upstream failure as a single actionable line.
 *
 * @param status HTTP status from the upstream response.
 * @param body   Raw response body (may be empty).
 */
export function describeUpstreamError(status: number, body: string): string {
	if (!body.trim()) return `HPA API error: HTTP ${status}`;
	if (looksLikeHtml(body)) {
		return (
			`HPA API error: HTTP ${status} — upstream returned an HTML error page, ` +
			"not an API response. Check the identifier format (HPA expects an " +
			"Ensembl gene ID such as ENSG00000157764) or whether the endpoint moved."
		);
	}
	return `HPA API error: HTTP ${status} - ${body.slice(0, MAX_BODY_CHARS)}`;
}
