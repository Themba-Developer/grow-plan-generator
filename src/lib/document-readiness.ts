export type ReadinessItem = {
  id: string;
  label: string;
  met: boolean;
  guidance: string;
  weight: number;
};

export type ReadinessReport = {
  score: number;
  level: "strong" | "workable" | "thin";
  items: ReadinessItem[];
  missing: ReadinessItem[];
};

const has = (text: string, pattern: RegExp) => pattern.test(text);

export function assessDocumentReadiness(
  docType: string,
  brief: string,
  companyName = "",
): ReadinessReport {
  const text = `${companyName}\n${brief}`.trim();
  const financial = /business_plan|feasibility_study|funding_proposal|financial_report/.test(
    docType,
  );
  const technical = /building|structural|technical/.test(docType);

  const items: ReadinessItem[] = [
    {
      id: "identity",
      label: "Organisation or project name",
      met:
        Boolean(companyName.trim()) ||
        has(
          text,
          /\b(?:company|business|project|organisation|organization|venture)\s+(?:named|called|is)\b/i,
        ),
      guidance: "Add the legal or working name of the organisation or project.",
      weight: 14,
    },
    {
      id: "location",
      label: "Location and jurisdiction",
      met: has(
        text,
        /\b(?:based|located|site|jurisdiction|country|city|province|district|region|municipality|in)\s+(?:at|in|near|within)?\s*[A-Z][A-Za-z-]{2,}/,
      ),
      guidance: "State the country and city/site because markets, regulation and costs are local.",
      weight: 14,
    },
    {
      id: "scope",
      label: "Products, services or project scope",
      met: has(
        text,
        /\b(?:product|service|manufactur|supply|facility|platform|develop|construct|operate|produce|deliver|scope)\w*/i,
      ),
      guidance: "Describe what will be sold, delivered, built or assessed.",
      weight: 18,
    },
    {
      id: "market",
      label: "Customers, users or beneficiaries",
      met: has(
        text,
        /\b(?:customer|client|target market|beneficiar|user|buyer|tenant|patient|student|household|businesses|corporate|government)\w*/i,
      ),
      guidance: "Identify the intended customers, users or beneficiaries.",
      weight: 14,
    },
    {
      id: "objective",
      label: "Decision or funding objective",
      met: has(
        text,
        /\b(?:fund|finance|loan|invest|approve|decision|objective|goal|purpose|feasib|proposal|expansion|launch)\w*/i,
      ),
      guidance: "Explain the decision this document must support and who will read it.",
      weight: 14,
    },
    {
      id: "timeline",
      label: "Timeline or planning horizon",
      met: has(text, /\b(?:20\d{2}|month|year|week|quarter|timeline|schedule|phase|horizon)\w*/i),
      guidance: "Add the implementation timeline or projection period.",
      weight: 10,
    },
  ];

  if (financial) {
    items.push({
      id: "financial_basis",
      label: "Currency and financial basis",
      met:
        has(
          text,
          /\b(?:USD|ZAR|EUR|GBP|ZMW|BWP|NAD|KES|NGN|GHS|currency|capital|budget|revenue|cost)\b/i,
        ) && has(text, /\d/),
      guidance: "State currency and at least the investment, budget, revenue or cost basis.",
      weight: 16,
    });
  }

  if (technical) {
    items.push(
      {
        id: "site_basis",
        label: "Site, dimensions and intended use",
        met: has(
          text,
          /\b(?:m2|m²|hectare|square metre|sqm|dimension|area|storey|floor|site|plot|capacity)\b/i,
        ),
        guidance: "Provide site area, approximate dimensions, capacity and intended occupancy/use.",
        weight: 12,
      },
      {
        id: "technical_inputs",
        label: "Technical constraints and surveys",
        met: has(
          text,
          /\b(?:soil|geotechnical|survey|topograph|material|load|utility|zoning|code|standard|drainage|wind|seismic)\w*/i,
        ),
        guidance:
          "Add known surveys, materials, utilities, zoning, loads and applicable local codes.",
        weight: 12,
      },
    );
  }

  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const achieved = items.reduce((sum, item) => sum + (item.met ? item.weight : 0), 0);
  const score = Math.round((achieved / total) * 100);
  const missing = items.filter((item) => !item.met);
  return {
    score,
    level: score >= 80 ? "strong" : score >= 55 ? "workable" : "thin",
    items,
    missing,
  };
}
