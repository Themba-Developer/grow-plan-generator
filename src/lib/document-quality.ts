export type QualityCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  points: number;
};

export type DocumentQualityReport = {
  score: number;
  grade: "excellent" | "strong" | "review" | "incomplete";
  checks: QualityCheck[];
  sources: { title: string; url: string }[];
};

const LONG_DOCUMENTS = new Set(["business_plan", "feasibility_study", "strategic_plan"]);
const FINANCIAL_DOCUMENTS = new Set([
  "business_plan",
  "feasibility_study",
  "funding_proposal",
  "financial_report",
]);

export function extractDocumentSources(markdown: string) {
  const sources = new Map<string, string>();
  for (const match of markdown.matchAll(/\[([^\]]+)]\((https?:\/\/[^)\s]+)\)/g)) {
    const title = match[1]?.trim();
    const url = match[2]?.trim();
    if (url) sources.set(url, title || url);
  }
  for (const match of markdown.matchAll(/(?<!\()https?:\/\/[^\s)<]+/g)) {
    const url = match[0].replace(/[.,;:]$/, "");
    if (url && !sources.has(url)) sources.set(url, url);
  }
  return [...sources.entries()].map(([url, title]) => ({ title, url }));
}

export function appendEvidenceAndReliance(args: {
  markdown: string;
  docType: string;
  readinessScore: number;
  financialModelEnabled: boolean;
}) {
  if (/^##\s+(?:Evidence Register|Sources and Reliance)/im.test(args.markdown)) {
    return args.markdown;
  }
  const sources = extractDocumentSources(args.markdown);
  const sourceRows = sources.length
    ? sources
        .map(
          (source, index) =>
            `| ${index + 1} | ${source.title.replaceAll("|", "-")} | ${source.url} |`,
        )
        .join("\n")
    : "| 1 | No external source URL was retained in the generated sections. External factual claims require verification before reliance. | Not available |";
  const technical = /building|structural|technical/.test(args.docType);
  const financial = FINANCIAL_DOCUMENTS.has(args.docType);

  return `${args.markdown.trim()}\n\n## Evidence Register, Assumptions and Reliance\n\n### Evidence register\n\nSources retained in the document are listed below for traceability. Access and publication dates should be confirmed during final human review.\n\n| # | Source | URL |\n|---:|---|---|\n${sourceRows}\n\n### Assumption and assurance boundary\n\n- Brief completeness at generation: ${args.readinessScore}%. Missing inputs were to be labelled as assumptions or information gaps rather than invented.\n- User-supplied information remains the client's responsibility and should be checked against corporate, legal and financial records.\n- External facts and regulations must be checked against the linked primary source and the applicable jurisdiction immediately before submission.\n${financial ? `- ${args.financialModelEnabled ? "Financial schedules identified as deterministic were calculated in application code from the displayed assumptions." : "No deterministic financial schedule was enabled; all financial figures require an independent spreadsheet model and reconciliation."}\n- Tax, accounting, finance structure and lender covenant treatment require review by a qualified accountant or financial adviser.\n` : ""}${technical ? "- All building, site and structural content is conceptual and NOT FOR CONSTRUCTION, permitting or procurement. A licensed local architect/engineer must verify surveys, dimensions, loads, geotechnical conditions, codes, member sizing, connections, reinforcement and safety.\n" : ""}- This document is a professional planning draft, not a substitute for legal, tax, audit, engineering or other regulated professional sign-off.\n`;
}

export function auditDocument(args: {
  markdown: string;
  docType: string;
  expectedSections: number;
  financialModelEnabled: boolean;
}): DocumentQualityReport {
  const markdown = args.markdown;
  const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const headings = (markdown.match(/^##\s+/gm) ?? []).length;
  const tables = (markdown.match(/^\|.*\|$/gm) ?? []).length;
  const sources = extractDocumentSources(markdown);
  const unresolved = /\b(?:TBD|TODO|PLACEHOLDER|INSERT HERE|N\/A TO BE CONFIRMED)\b/i.test(
    markdown,
  );
  const technical = /building|structural|technical/.test(args.docType);
  const targetWords = LONG_DOCUMENTS.has(args.docType)
    ? 12_000
    : args.docType === "company_profile"
      ? 2_500
      : 5_000;
  const checks: QualityCheck[] = [
    {
      id: "length",
      label: "Substantive document length",
      passed: words >= targetWords,
      detail: `${words.toLocaleString()} words; professional target is at least ${targetWords.toLocaleString()} for this document type.`,
      points: 20,
    },
    {
      id: "sections",
      label: "Section completion",
      passed: headings >= Math.max(1, args.expectedSections),
      detail: `${headings} main sections detected against ${args.expectedSections} planned.`,
      points: 20,
    },
    {
      id: "evidence",
      label: "Traceable source links",
      passed: sources.length >= 3 || args.docType === "company_profile",
      detail: `${sources.length} unique source URLs retained.`,
      points: 18,
    },
    {
      id: "tables",
      label: "Decision-useful tables",
      passed: tables >= 6,
      detail: `${tables} markdown table rows detected.`,
      points: 10,
    },
    {
      id: "placeholders",
      label: "No unresolved placeholders",
      passed: !unresolved,
      detail: unresolved
        ? "Placeholder language remains and requires attention."
        : "No common placeholder markers detected.",
      points: 12,
    },
    {
      id: "financials",
      label: "Deterministic financial basis",
      passed: !FINANCIAL_DOCUMENTS.has(args.docType) || args.financialModelEnabled,
      detail: FINANCIAL_DOCUMENTS.has(args.docType)
        ? args.financialModelEnabled
          ? "Code-calculated schedules were supplied as the numerical source of truth."
          : "Deterministic financial modelling was not enabled."
        : "Not required for this document type.",
      points: 12,
    },
    {
      id: "technical_boundary",
      label: "Professional technical boundary",
      passed: !technical || /NOT FOR CONSTRUCTION/i.test(markdown),
      detail: technical
        ? "Conceptual-use and licensed-professional boundaries were checked."
        : "Not required for this document type.",
      points: 8,
    },
  ];
  const available = checks.reduce((sum, check) => sum + check.points, 0);
  const earned = checks.reduce((sum, check) => sum + (check.passed ? check.points : 0), 0);
  const score = Math.round((earned / available) * 100);
  return {
    score,
    grade:
      score >= 90 ? "excellent" : score >= 80 ? "strong" : score >= 60 ? "review" : "incomplete",
    checks,
    sources,
  };
}
