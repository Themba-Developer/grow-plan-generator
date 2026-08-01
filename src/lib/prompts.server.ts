export const CHAT_MODEL = "google/gemini-3.5-flash";

export const SYSTEM_PROMPT = `You are Black R AI, an expert business planning consultant built by Black R (Apparel Supply & Systems).

Your specialty is producing investor-grade, bank-ready **business plans** and **feasibility studies** of 50–60 pages, plus the strategic, financial and market analysis conversation around them.

Behaviour:
- Be concise and professional in chat. Ask focused clarifying questions when a brief is thin (business name, country/city, industry, products/services, target market, capital required, currency, funding purpose, timeline).
- When a user asks you to build a full business plan or feasibility study, tell them to click **Build full document** (or confirm you can start) — the document builder generates the complete 50–60 page document section by section and gives DOCX and PDF downloads.
- Use markdown: clear headings, short paragraphs, tables for figures, and explicit assumptions behind every number.
- Never invent verified statistics; label estimates as assumptions and state the basis.
- Currency and units must follow the user's market.`;

export type Outline = {
  title: string;
  subtitle: string;
  sections: { heading: string; brief: string; targetWords: number }[];
};

const BUSINESS_PLAN_SPINE = `1. Executive Summary
2. Company / Business Overview
3. Vision, Mission and Strategic Objectives
4. Products and Services
5. Industry and Market Analysis
6. Target Market and Customer Segmentation
7. Competitive Analysis and Positioning
8. Marketing and Sales Strategy
9. Operations Plan
10. Supply Chain, Procurement and Technology
11. Organisation, Management and Human Resources
12. Regulatory, Legal and Compliance Framework
13. Risk Analysis and Mitigation
14. Sustainability, ESG and Social Impact
15. Financial Plan and Assumptions
16. Financial Projections (P&L, Cash Flow, Balance Sheet, Break-even)
17. Funding Requirements and Use of Funds
18. Implementation Roadmap and Milestones
19. Monitoring, Evaluation and Exit Strategy
20. Conclusion and Appendices`;

const FEASIBILITY_SPINE = `1. Executive Summary
2. Project Background and Rationale
3. Project Description and Scope
4. Methodology and Assumptions
5. Market Feasibility
6. Demand and Supply Analysis
7. Competitive and Value Chain Analysis
8. Technical Feasibility
9. Location, Site and Infrastructure Assessment
10. Operational Feasibility
11. Organisational and Management Feasibility
12. Legal, Regulatory and Environmental Feasibility
13. Financial Feasibility and Cost Estimates
14. Financial Projections and Ratio Analysis
15. Sensitivity, Scenario and Risk Analysis
16. Economic and Social Feasibility
17. Funding Structure and Investment Appraisal (NPV, IRR, Payback)
18. Implementation Plan and Schedule
19. Findings, Conclusion and Recommendations
20. Appendices and Supporting Data`;

export function outlinePrompt(docType: string, brief: string) {
  const spine = docType === "feasibility_study" ? FEASIBILITY_SPINE : BUSINESS_PLAN_SPINE;
  const label = docType === "feasibility_study" ? "feasibility study" : "business plan";
  return `Create the section plan for a professional 50–60 page ${label}.

CLIENT BRIEF:
"""
${brief}
"""

Use this canonical structure, adapted to the brief (rename, merge or add sections where the business genuinely requires it, keep 18–22 sections):
${spine}

Return ONLY valid JSON, no markdown fences, in this shape:
{
  "title": "<document title including the business name>",
  "subtitle": "<e.g. 'Business Plan 2026–2030' plus location>",
  "sections": [
    { "heading": "1. Executive Summary", "brief": "<what this section must cover for THIS business, 2-3 sentences>", "targetWords": 900 }
  ]
}

Rules: numbered headings, targetWords between 700 and 1400, total target 16000–20000 words.`;
}

export function sectionPrompt(args: {
  docType: string;
  brief: string;
  title: string;
  outlineHeadings: string[];
  heading: string;
  sectionBrief: string;
  targetWords: number;
  previousSummary: string;
}) {
  const label = args.docType === "feasibility_study" ? "feasibility study" : "business plan";
  return `You are writing ONE section of a professional, investor-grade ${label} titled "${args.title}".

CLIENT BRIEF:
"""
${args.brief}
"""

FULL DOCUMENT OUTLINE (for context, do not rewrite other sections):
${args.outlineHeadings.join("\n")}

WHAT HAS BEEN WRITTEN SO FAR (condensed):
${args.previousSummary || "Nothing yet — this is the first section."}

NOW WRITE THIS SECTION ONLY:
Heading: ${args.heading}
Coverage: ${args.sectionBrief}
Target length: approximately ${args.targetWords} words.

Requirements:
- Start with "## ${args.heading}" and use "###" for sub-headings.
- Substantive consulting-grade prose. No filler, no placeholder text, no "TBD".
- Include concrete figures, markdown tables, and stated assumptions where numbers appear (financials, market size, staffing, costs, schedules).
- Keep all currency, regulation and market references consistent with the brief and with earlier sections.
- Do NOT write an introduction to the whole document, do NOT repeat other sections, and do NOT add commentary about being an AI.
- Output markdown only.`;
}
