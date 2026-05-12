import { marked } from "marked";

export type PdfTemplateInput = {
  clientName: string;
  weekLabel: string;
  dateRange: string;
  narrativeMd: string;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

export function renderReportHtml(input: PdfTemplateInput): string {
  const body = marked.parse(input.narrativeMd, { async: false }) as string;
  const client = escapeHtml(input.clientName);
  const range = escapeHtml(input.dateRange);
  const label = escapeHtml(input.weekLabel);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${client} — Weekly report (${label})</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: Letter; margin: 1in; }
  :root {
    --ink: #111111;
    --muted: #6b6b6b;
    --rule: #e5e5e5;
    --accent: #b5651d;
  }
  html, body { padding: 0; margin: 0; }
  body {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--ink);
    font-size: 11pt;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 14px;
    margin-bottom: 28px;
  }
  header .brand {
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-size: 9.5pt;
    color: var(--accent);
  }
  header .week {
    font-size: 9.5pt;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  h1.client {
    font-size: 22pt;
    margin: 0 0 4px 0;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .subtitle {
    color: var(--muted);
    font-size: 11pt;
    margin-bottom: 28px;
  }
  main h1 {
    font-size: 14pt;
    font-weight: 600;
    margin: 26px 0 10px;
    letter-spacing: -0.005em;
  }
  main h1:first-of-type { margin-top: 8px; }
  main h2 {
    font-size: 12pt;
    font-weight: 600;
    margin: 20px 0 8px;
    color: var(--ink);
  }
  main p { margin: 0 0 10px; }
  main ul { padding-left: 1.1em; margin: 0 0 12px; }
  main li { margin-bottom: 4px; }
  main strong { font-weight: 600; }
  footer {
    margin-top: 36px;
    padding-top: 14px;
    border-top: 1px solid var(--rule);
    color: var(--muted);
    font-size: 9pt;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>
  <header>
    <div class="brand">Example Company · Weekly Report</div>
    <div class="week">${label}</div>
  </header>
  <h1 class="client">${client}</h1>
  <div class="subtitle">Week of ${range}</div>
  <main>${body}</main>
  <footer>
    <span>Prepared by Example Company</span>
    <span>${range}</span>
  </footer>
</body>
</html>`;
}
