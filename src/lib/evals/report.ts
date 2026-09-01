/**
 * Story 24.6 — Report generator: JSON + derived Markdown/HTML (AC-9)
 */
import type { EvalResult } from "./runner";

export function generateJsonReport(result: EvalResult): string {
  return JSON.stringify(result, null, 2);
}

export function generateMarkdownReport(result: EvalResult): string {
  const lines: string[] = [];
  lines.push(`# Evaluation Report — ${result.suite}`);
  lines.push("");
  lines.push(`**Overall:** ${result.overall_status.toUpperCase()}`);
  lines.push(`**Dataset revision:** ${result.dataset_revision}`);
  lines.push(`**Timestamp:** ${result.environment.timestamp}`);
  lines.push(`**Machine:** ${result.environment.machine}`);
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("| Metric | Value | Threshold | Status |");
  lines.push("|--------|-------|-----------|--------|");
  for (const m of result.metrics) {
    lines.push(`| ${m.name} | ${m.value} | ${m.threshold} | ${m.status}${m.measured ? " (measured)" : " (wiring-check)"} |`);
  }
  if (result.failures.length > 0) {
    lines.push("");
    lines.push("## Failures");
    lines.push("");
    for (const f of result.failures) {
      lines.push(`- **${f.metric}**: observed ${f.observed}, threshold ${f.threshold}${f.baseline !== undefined ? `, baseline ${f.baseline}` : ""}${f.scenario_id ? `, scenario ${f.scenario_id}` : ""}`);
    }
  }
  lines.push("");
  lines.push("## Evidence Hashes");
  lines.push("");
  for (const [name, hash] of Object.entries(result.evidence_hashes)) {
    lines.push(`- ${name}: \`${hash.slice(0, 16)}...\``);
  }
  return lines.join("\n");
}

export function generateHtmlReport(result: EvalResult): string {
  const rows = result.metrics
    .map(
      (m) =>
        `<tr><td>${m.name}</td><td>${m.value}</td><td>${m.threshold}</td><td style="color:${m.status === "pass" ? "green" : "red"}">${m.status}</td></tr>`,
    )
    .join("");
  const failRows = result.failures
    .map((f) => `<li><strong>${f.metric}</strong>: observed ${f.observed}, threshold ${f.threshold}</li>`)
    .join("");
  return `<!DOCTYPE html>
<html><head><title>Eval Report — ${result.suite}</title></head>
<body>
<h1>Evaluation Report — ${result.suite}</h1>
<p><strong>Overall:</strong> ${result.overall_status.toUpperCase()} | <strong>Dataset:</strong> ${result.dataset_revision} | <strong>Machine:</strong> ${result.environment.machine}</p>
<table border="1"><tr><th>Metric</th><th>Value</th><th>Threshold</th><th>Status</th></tr>${rows}</table>
${result.failures.length > 0 ? `<h2>Failures</h2><ul>${failRows}</ul>` : ""}
</body></html>`;
}