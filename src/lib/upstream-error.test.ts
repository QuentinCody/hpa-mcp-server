import { describe, expect, it } from "vitest";
import { describeUpstreamError, looksLikeHtml } from "./upstream-error";

// The exact body shape observed in the live fleet sweep (2026-07-27).
const HPA_HTML_404 =
	'<!DOCTYPE HTML>\n<html>\n<head>\n<title>The Human Protein Atlas</title>\n<meta charset="utf-8">\n</head>\n<body>Not found</body></html>';

describe("looksLikeHtml", () => {
	it("detects a doctype preamble", () => {
		expect(looksLikeHtml(HPA_HTML_404)).toBe(true);
	});

	it("detects a bare <html> root with leading whitespace", () => {
		expect(looksLikeHtml("\n\n  <html><body>x</body></html>")).toBe(true);
	});

	it("does not flag a JSON error body", () => {
		expect(looksLikeHtml('{"error":"gene not found"}')).toBe(false);
	});

	it("does not flag plain text", () => {
		expect(looksLikeHtml("gene not found")).toBe(false);
	});

	it("does not flag an empty body", () => {
		expect(looksLikeHtml("")).toBe(false);
	});
});

describe("describeUpstreamError", () => {
	// REGRESSION: hpa_gene_lookup used to paste the whole HTML page into the
	// error, burning caller context and carrying no actionable detail.
	it("never leaks HTML markup into the message", () => {
		const msg = describeUpstreamError(404, HPA_HTML_404);
		expect(msg).not.toContain("<!DOCTYPE");
		expect(msg).not.toContain("<html");
		expect(msg).not.toContain("<title");
	});

	it("says what to do about an HTML error page", () => {
		const msg = describeUpstreamError(404, HPA_HTML_404);
		expect(msg).toContain("HTTP 404");
		expect(msg).toContain("HTML error page");
		expect(msg).toContain("ENSG00000157764");
	});

	it("keeps a JSON error body, which is actionable", () => {
		const msg = describeUpstreamError(400, '{"error":"bad id"}');
		expect(msg).toContain('{"error":"bad id"}');
	});

	it("truncates a long non-HTML body", () => {
		const msg = describeUpstreamError(500, "x".repeat(1000));
		expect(msg.length).toBeLessThan(400);
	});

	it("omits the separator entirely when the body is empty", () => {
		expect(describeUpstreamError(503, "")).toBe("HPA API error: HTTP 503");
	});

	it("treats a whitespace-only body as empty", () => {
		expect(describeUpstreamError(503, "   \n ")).toBe("HPA API error: HTTP 503");
	});
});
