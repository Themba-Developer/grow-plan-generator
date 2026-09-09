const MAX_REFERENCE_BYTES = 15 * 1024 * 1024;
const MAX_REFERENCE_PAGES = 120;
const MAX_REFERENCE_CHARACTERS = 60_000;

export type ReferenceDocument = {
  name: string;
  pageCount: number;
  text: string;
};

function redactPersonalDetails(text: string) {
  return text
    .replace(/\b\d{6}\s?\d{4}\s?\d{2}\s?\d\b/g, "[SA ID REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL REDACTED]")
    .replace(/(?:\+27|0)(?:[\s()-]*\d){9}\b/g, "[PHONE REDACTED]");
}

function selectReferencePages(pages: string[]) {
  const selected = new Set<number>();
  const add = (index: number) => {
    if (index >= 0 && index < pages.length) selected.add(index);
  };

  for (let index = 0; index < Math.min(10, pages.length); index += 1) add(index);

  const criticalPattern =
    /(?:table of )?contents|research methodology|references|bibliography|source list|disclaimer/i;
  const analysisPattern =
    /executive summary|market research|market analysis|industry analysis|financial projections?|financial assumptions?|capital investment|cash flow|income statement|balance sheet|break[- ]even|sensitivity analysis|risk(?: and)? mitigation|regulatory|compliance|socio-economic impact/i;

  pages.forEach((page, index) => {
    if (criticalPattern.test(page)) {
      add(index - 1);
      add(index);
      add(index + 1);
    }
  });

  pages.forEach((page, index) => {
    if (analysisPattern.test(page)) {
      add(index - 1);
      add(index);
      add(index + 1);
    }
  });

  for (let index = 0; index < pages.length; index += 1) add(index);

  let result = "";
  for (const index of selected) {
    const chunk = `\n\n--- Reference page ${index + 1} ---\n${pages[index]?.slice(0, 7_000) || ""}`;
    if (result.length + chunk.length > MAX_REFERENCE_CHARACTERS) continue;
    result += chunk;
  }
  return redactPersonalDetails(result.trim());
}

export async function extractPdfReference(file: File): Promise<ReferenceDocument> {
  if (file.size > MAX_REFERENCE_BYTES) {
    throw new Error("Reference PDFs must be 15 MB or smaller.");
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please upload a PDF business plan.");
  }

  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  if (pdf.numPages > MAX_REFERENCE_PAGES) {
    throw new Error(`Reference PDFs may contain up to ${MAX_REFERENCE_PAGES} pages.`);
  }

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => {
        if (!("str" in item)) return "";
        return `${item.str}${item.hasEOL ? "\n" : " "}`;
      })
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    pages.push(text);
  }

  const text = selectReferencePages(pages);
  if (text.length < 500) {
    throw new Error(
      "This PDF has too little extractable text. Upload a text-based PDF, not a scan.",
    );
  }

  return { name: file.name, pageCount: pdf.numPages, text };
}
