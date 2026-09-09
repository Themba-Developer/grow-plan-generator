import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopPosition,
  TabStopType,
  TextRun,
  WidthType,
  ShadingType,
  BorderStyle,
  Footer,
  PageNumber,
} from "docx";
import { jsPDF } from "jspdf";
import {
  EMPTY_BRANDING,
  dataUrlToUint8Array,
  docxImageType,
  fitLogo,
  pdfImageFormat,
  type Branding,
} from "./doc-branding";
import { normalizeDocumentDesign, type DocumentDesign } from "./doc-design";

export type DocBlock =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "bullet" | "numbered"; text: string }
  | { kind: "table"; rows: string[][] };

export type ExportVisual = {
  title: string;
  kind: string;
  dataUrl: string;
  revisedPrompt?: string;
  placementHeading?: string;
};

const RED = "C8102E";
const BLACK = "111111";
const GREY = "5A5A5A";
const HEAD_FONT = "Arial";
const BODY_FONT = "Georgia";

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace(/^#/, "").padEnd(6, "0").slice(0, 6);
  return [
    Number.parseInt(cleaned.slice(0, 2), 16),
    Number.parseInt(cleaned.slice(2, 4), 16),
    Number.parseInt(cleaned.slice(4, 6), 16),
  ];
}

function pdfFont(font: DocumentDesign["headingFont"] | DocumentDesign["bodyFont"]) {
  return font === "Georgia" ? "times" : "helvetica";
}

function splitRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string) {
  return /^\|?[\s:|-]+\|?$/.test(line.trim()) && line.includes("-");
}

export function parseMarkdown(markdown: string): DocBlock[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: DocBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: "p", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      continue;
    }
    if (trimmed.startsWith("```")) {
      flush();
      continue;
    }
    if (trimmed.startsWith("|") && lines[i + 1] && isSeparatorRow(lines[i + 1] ?? "")) {
      flush();
      const rows: string[][] = [splitRow(trimmed)];
      i += 1;
      while (i + 1 < lines.length && (lines[i + 1] ?? "").trim().startsWith("|")) {
        i += 1;
        rows.push(splitRow(lines[i] ?? ""));
      }
      blocks.push({ kind: "table", rows });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const level = (heading[1] ?? "#").length;
      blocks.push({
        kind: level <= 1 ? "h1" : level === 2 ? "h2" : "h3",
        text: (heading[2] ?? "").trim(),
      });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flush();
      blocks.push({ kind: "bullet", text: (bullet[1] ?? "").trim() });
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      flush();
      blocks.push({ kind: "numbered", text: (numbered[1] ?? "").trim() });
      continue;
    }

    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

function stripMarks(text: string) {
  return text
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\*/g, "");
}

function headingKey(text: string) {
  return stripMarks(text)
    .toLocaleLowerCase()
    .replace(/^\s*\d+[.)-]?\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function visualMatchesHeading(visual: ExportVisual, heading: string) {
  if (!visual.placementHeading) return false;
  const requested = headingKey(visual.placementHeading);
  const actual = headingKey(heading);
  return requested === actual || requested.includes(actual) || actual.includes(requested);
}

function inlineRuns(
  text: string,
  options?: { bold?: boolean; color?: string; size?: number; font?: string },
) {
  const cleaned = text.replace(/`/g, "");
  const parts = cleaned
    .split(/(\*\*[^*]+\*\*|\[[^\]]+]\(https?:\/\/[^)]+\)|https?:\/\/[^\s]+)/g)
    .filter(Boolean);
  return parts.map((part) => {
    const markdownLink = /^\[([^\]]+)]\((https?:\/\/[^)]+)\)$/.exec(part);
    const bareLink = /^https?:\/\/[^\s]+$/.test(part) ? part : null;
    const link = markdownLink?.[2] || bareLink;
    if (link) {
      return new ExternalHyperlink({
        link,
        children: [
          new TextRun({
            text: markdownLink?.[1] || bareLink || link,
            style: "Hyperlink",
            size: options?.size ?? 22,
            font: options?.font ?? BODY_FONT,
          }),
        ],
      });
    }
    const bold = part.startsWith("**") && part.endsWith("**");
    return new TextRun({
      text: bold ? part.slice(2, -2) : part.replace(/\*/g, ""),
      bold: bold || options?.bold || false,
      color: options?.color ?? BLACK,
      size: options?.size ?? 22,
      font: options?.font ?? BODY_FONT,
    });
  });
}

function docxTable(
  rows: string[][],
  theme: { secondary: string; ink: string; headingFont: string },
) {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const totalWidth = 9000;
  const columnWidth = Math.floor(totalWidth / columnCount);
  const border = { style: BorderStyle.SINGLE, size: 1, color: "D5D5D5" };
  const borders = { top: border, bottom: border, left: border, right: border };

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: Array.from({ length: columnCount }, () => columnWidth),
    rows: rows
      .filter((row) => !isSeparatorRow(row.join("|")))
      .map(
        (row, rowIndex) =>
          new TableRow({
            tableHeader: rowIndex === 0,
            children: Array.from({ length: columnCount }, (_, cellIndex) => {
              const value = row[cellIndex] ?? "";
              return new TableCell({
                borders,
                width: { size: columnWidth, type: WidthType.DXA },
                margins: { top: 90, bottom: 90, left: 130, right: 130 },
                ...(rowIndex === 0
                  ? {
                      shading: {
                        fill: theme.secondary,
                        type: ShadingType.CLEAR,
                        color: "auto",
                      },
                    }
                  : {}),

                children: [
                  new Paragraph({
                    children: inlineRuns(value, {
                      bold: rowIndex === 0,
                      size: 19,
                      font: theme.headingFont,
                      color: theme.ink,
                    }),
                  }),
                ],
              });
            }),
          }),
      ),
  });
}

function preparedOn() {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function markdownToDocxBlob(args: {
  title: string;
  subtitle: string;
  markdown: string;
  branding?: Branding;
  visuals?: ExportVisual[];
  design?: DocumentDesign;
  coverArt?: ExportVisual;
  pageFormat?: "a4" | "letter";
}) {
  const branding = args.branding ?? EMPTY_BRANDING;
  const design = normalizeDocumentDesign(args.design);
  const RED = design.accentColor;
  const BLACK = design.inkColor;
  const GREY = design.mutedColor;
  const HEAD_FONT = design.headingFont;
  const BODY_FONT = design.bodyFont;
  const blocks = parseMarkdown(args.markdown);
  const children: (Paragraph | Table)[] = [];
  const coverAlignment =
    design.coverLayout === "minimal_luxury" ? AlignmentType.CENTER : AlignmentType.LEFT;

  // ---------- Cover page ----------
  if (args.coverArt) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 260 },
        children: [
          new ImageRun({
            type: docxImageType(args.coverArt.dataUrl),
            data: dataUrlToUint8Array(args.coverArt.dataUrl),
            transformation: { width: 620, height: 350 },
            altText: {
              title: "Cover artwork",
              description: args.coverArt.revisedPrompt || design.creativeDirection,
              name: "cover-artwork",
            },
          }),
        ],
      }),
    );
  }

  if (branding.logo) {
    const size = fitLogo(branding.logo, args.coverArt ? 125 : 170, args.coverArt ? 65 : 110);
    children.push(
      new Paragraph({
        alignment: coverAlignment,
        spacing: { before: args.coverArt ? 80 : 1600, after: 220 },
        children: [
          new ImageRun({
            type: docxImageType(branding.logo.dataUrl),
            data: dataUrlToUint8Array(branding.logo.dataUrl),
            transformation: { width: size.width, height: size.height },
            altText: {
              title: branding.companyName || "Company logo",
              description: "Company logo",
              name: "logo",
            },
          }),
        ],
      }),
    );
  } else {
    children.push(new Paragraph({ spacing: { before: args.coverArt ? 80 : 1800 }, children: [] }));
  }

  if (branding.companyName) {
    children.push(
      new Paragraph({
        alignment: coverAlignment,
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: branding.companyName.toUpperCase(),
            bold: true,
            color: RED,
            size: 26,
            font: HEAD_FONT,
            characterSpacing: 40,
          }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({
      alignment: coverAlignment,
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 12 } },
      children: [
        new TextRun({
          text: args.title,
          bold: true,
          color: design.primaryColor,
          size: 48,
          font: HEAD_FONT,
        }),
      ],
    }),
    new Paragraph({
      alignment: coverAlignment,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: args.subtitle, color: GREY, size: 26, font: BODY_FONT })],
    }),
  );

  if (branding.contact) {
    children.push(
      new Paragraph({
        alignment: coverAlignment,
        spacing: { after: 120 },
        children: [new TextRun({ text: branding.contact, color: GREY, size: 20, font: BODY_FONT })],
      }),
    );
  }

  children.push(
    new Paragraph({
      alignment: coverAlignment,
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: `Prepared ${preparedOn()}`,
          color: "808080",
          size: 20,
          font: BODY_FONT,
        }),
      ],
    }),
    new Paragraph({
      alignment: coverAlignment,
      spacing: { before: args.coverArt ? 260 : 1200 },
      children: [
        new TextRun({
          text: "Strictly private and confidential",
          color: "9A9A9A",
          size: 18,
          font: BODY_FONT,
          italics: true,
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );

  // ---------- Table of contents ----------
  const tocEntries = blocks.filter((block) => block.kind === "h1" || block.kind === "h2") as {
    kind: "h1" | "h2";
    text: string;
  }[];

  if (tocEntries.length > 1) {
    children.push(
      new Paragraph({
        spacing: { after: 240 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RED, space: 8 } },
        children: [
          new TextRun({
            text: "Table of Contents",
            bold: true,
            color: BLACK,
            size: 32,
            font: HEAD_FONT,
          }),
        ],
      }),
    );
    for (const entry of tocEntries) {
      children.push(
        new Paragraph({
          spacing: { after: 90 },
          ...(entry.kind === "h2" ? { indent: { left: 360 } } : {}),
          children: [
            new TextRun({
              text: stripMarks(entry.text),
              bold: entry.kind === "h1",
              color: entry.kind === "h1" ? BLACK : GREY,
              size: entry.kind === "h1" ? 22 : 21,
              font: BODY_FONT,
            }),
          ],
        }),
      );
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // ---------- Body ----------
  const pendingVisuals = [...(args.visuals ?? [])];
  const sectionTotal = blocks.filter((block) => block.kind === "h1" || block.kind === "h2").length;
  const visualInterval = Math.max(1, Math.floor(sectionTotal / (pendingVisuals.length + 1)));
  let sectionNumber = 0;
  let visualNumber = 0;

  const appendDocxVisual = (visual: ExportVisual) => {
    visualNumber += 1;
    children.push(
      new Paragraph({
        spacing: { before: 260, after: 140 },
        children: [
          new TextRun({
            text: visual.title,
            bold: true,
            size: 23,
            font: HEAD_FONT,
            color: design.primaryColor,
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 180 },
        children: [
          new ImageRun({
            type: docxImageType(visual.dataUrl),
            data: dataUrlToUint8Array(visual.dataUrl),
            transformation: { width: 560, height: 373 },
            altText: {
              title: visual.title,
              description: visual.revisedPrompt || visual.title,
              name: `visual-${visualNumber}`,
            },
          }),
        ],
      }),
    );
    if (visual.kind === "layout") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 },
          children: [
            new TextRun({
              text: "CONCEPTUAL - NOT FOR CONSTRUCTION. Licensed professional review required.",
              bold: true,
              color: RED,
              size: 18,
              font: HEAD_FONT,
            }),
          ],
        }),
      );
    }
  };

  for (const block of blocks) {
    if (block.kind === "table") {
      children.push(
        docxTable(block.rows, {
          secondary: design.secondaryColor,
          ink: BLACK,
          headingFont: HEAD_FONT,
        }),
      );
      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
      continue;
    }
    if (block.kind === "h1" || block.kind === "h2") {
      sectionNumber += 1;
      children.push(
        new Paragraph({
          heading: block.kind === "h1" ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 180 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RED, space: 6 } },
          children: inlineRuns(block.text, {
            bold: true,
            color: BLACK,
            size: block.kind === "h1" ? 32 : 27,
            font: HEAD_FONT,
          }),
        }),
      );
      let visualIndex = pendingVisuals.findIndex((visual) =>
        visualMatchesHeading(visual, block.text),
      );
      if (visualIndex < 0 && sectionNumber % visualInterval === 0) {
        visualIndex = pendingVisuals.findIndex((visual) => !visual.placementHeading);
      }
      if (visualIndex >= 0) {
        const [visual] = pendingVisuals.splice(visualIndex, 1);
        if (visual) appendDocxVisual(visual);
      }
      continue;
    }
    if (block.kind === "h3") {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 280, after: 120 },
          children: inlineRuns(block.text, { bold: true, size: 23, font: HEAD_FONT, color: RED }),
        }),
      );
      continue;
    }
    if (block.kind === "bullet" || block.kind === "numbered") {
      children.push(
        new Paragraph({
          numbering: { reference: block.kind === "bullet" ? "brBullets" : "brNumbers", level: 0 },
          spacing: { after: 100, line: 300 },
          children: inlineRuns(block.text, { color: BLACK, font: BODY_FONT }),
        }),
      );
      continue;
    }
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200, line: 320 },
        children: inlineRuns(block.text, { color: BLACK, font: BODY_FONT }),
      }),
    );
  }

  if (pendingVisuals.length) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: "Visual Appendix", bold: true, size: 32, font: HEAD_FONT })],
      }),
    );
    for (const [index, visual] of pendingVisuals.entries()) {
      if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
      appendDocxVisual(visual);
    }
  }

  // ---------- Letterhead header ----------
  const headerChildren: Paragraph[] = [];
  const headerRuns: (TextRun | ImageRun)[] = [];
  if (branding.logo) {
    const size = fitLogo(branding.logo, 90, 42);
    headerRuns.push(
      new ImageRun({
        type: docxImageType(branding.logo.dataUrl),
        data: dataUrlToUint8Array(branding.logo.dataUrl),
        transformation: { width: size.width, height: size.height },
        altText: {
          title: branding.companyName || "Company logo",
          description: "Company logo",
          name: "logo-header",
        },
      }),
    );
  }
  const headerLabel = branding.companyName
    ? `\t${branding.companyName}${branding.contact ? ` · ${branding.contact}` : ""}`
    : `\t${args.title}`;
  headerRuns.push(
    new TextRun({ text: headerLabel, color: design.primaryColor, size: 17, font: HEAD_FONT }),
  );

  headerChildren.push(
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: design.letterheadStyle === "top_band" ? 18 : 8,
          color: design.letterheadStyle === "top_band" ? design.primaryColor : RED,
          space: 6,
        },
      },
      spacing: { after: 120 },
      children: headerRuns,
    }),
  );

  const document = new Document({
    styles: {
      default: { document: { run: { font: BODY_FONT, size: 22 } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 32, bold: true, font: HEAD_FONT, color: BLACK },
          paragraph: { spacing: { before: 400, after: 180 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 27, bold: true, font: HEAD_FONT, color: BLACK },
          paragraph: { spacing: { before: 340, after: 160 }, outlineLevel: 1 },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 23, bold: true, font: HEAD_FONT, color: RED },
          paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 2 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "brBullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: "brNumbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            size:
              args.pageFormat === "letter"
                ? { width: 12240, height: 15840 }
                : { width: 11906, height: 16838 },
            margin: { top: 1560, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 620 },
          },
        },
        headers: {
          default: new Header({ children: headerChildren }),
          first: new Header({ children: [] }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${branding.companyName || "Black R AI"}  |  `,
                    color: "9A9A9A",
                    size: 17,
                    font: HEAD_FONT,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    color: "9A9A9A",
                    size: 17,
                    font: HEAD_FONT,
                  }),
                ],
              }),
            ],
          }),
          first: new Footer({ children: [] }),
        },
        children,
      },
    ],
  });

  return Packer.toBlob(document);
}

export function markdownToPdfBlob(args: {
  title: string;
  subtitle: string;
  markdown: string;
  branding?: Branding;
  visuals?: ExportVisual[];
  design?: DocumentDesign;
  coverArt?: ExportVisual;
  pageFormat?: "a4" | "letter";
}) {
  const branding = args.branding ?? EMPTY_BRANDING;
  const design = normalizeDocumentDesign(args.design);
  const primary = hexToRgb(design.primaryColor);
  const secondary = hexToRgb(design.secondaryColor);
  const accent = hexToRgb(design.accentColor);
  const ink = hexToRgb(design.inkColor);
  const muted = hexToRgb(design.mutedColor);
  const headingFont = pdfFont(design.headingFont);
  const bodyFont = pdfFont(design.bodyFont);
  const blocks = parseMarkdown(args.markdown);
  const pdf = new jsPDF({ unit: "pt", format: args.pageFormat ?? "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 64;
  const headerBottom = 92;
  const maxWidth = pageWidth - margin * 2;
  let y = headerBottom;

  const footer = () => {
    const page = pdf.getNumberOfPages();
    pdf.setFont(bodyFont, "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(muted[0], muted[1], muted[2]);
    pdf.text(
      `${branding.companyName || "Black R AI"}  |  ${page}`,
      pageWidth / 2,
      pageHeight - 30,
      { align: "center" },
    );
  };

  const letterhead = () => {
    if (design.letterheadStyle === "top_band") {
      pdf.setFillColor(primary[0], primary[1], primary[2]);
      pdf.rect(0, 0, pageWidth, 14, "F");
    } else if (design.letterheadStyle === "asymmetric") {
      pdf.setFillColor(accent[0], accent[1], accent[2]);
      pdf.rect(0, 0, 12, 76, "F");
    }
    let textLeft = margin;
    if (branding.logo) {
      const size = fitLogo(branding.logo, 70, 34);
      pdf.addImage(
        branding.logo.dataUrl,
        pdfImageFormat(branding.logo.dataUrl),
        margin,
        34,
        size.width,
        size.height,
      );
      textLeft = margin + size.width + 10;
    }
    pdf.setFont(headingFont, "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(ink[0], ink[1], ink[2]);
    pdf.text((branding.companyName || args.title).toUpperCase(), textLeft, 50, {
      maxWidth: maxWidth - (textLeft - margin),
    });
    if (branding.contact) {
      pdf.setFont(bodyFont, "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(muted[0], muted[1], muted[2]);
      pdf.text(branding.contact, textLeft, 62, { maxWidth: maxWidth - (textLeft - margin) });
    }
    pdf.setDrawColor(accent[0], accent[1], accent[2]);
    pdf.setLineWidth(1.2);
    pdf.line(margin, 74, pageWidth - margin, 74);
  };

  const newPage = () => {
    footer();
    pdf.addPage();
    letterhead();
    y = headerBottom;
  };

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - margin) newPage();
  };

  const write = (
    text: string,
    options: {
      size: number;
      style: "normal" | "bold" | "italic";
      family?: "helvetica" | "times";
      color?: [number, number, number];
      gap: number;
      indent?: number;
      align?: "left" | "justify";
    },
  ) => {
    const clean = stripMarks(text);
    pdf.setFont(options.family ?? bodyFont, options.style);
    pdf.setFontSize(options.size);
    const color = options.color ?? ink;
    pdf.setTextColor(color[0], color[1], color[2]);
    const indent = options.indent ?? 0;
    const lines = pdf.splitTextToSize(clean, maxWidth - indent) as string[];
    const lineHeight = options.size * 1.5;
    for (const line of lines) {
      ensure(lineHeight);
      pdf.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += options.gap;
  };

  // ---------- Cover ----------
  pdf.setFillColor(secondary[0], secondary[1], secondary[2]);
  pdf.rect(0, 0, pageWidth, pageHeight, "F");

  let coverY = 86;
  if (args.coverArt) {
    const framed =
      design.coverLayout === "geometric_frame" || design.coverLayout === "minimal_luxury";
    const artX = framed ? 36 : 0;
    const artY = framed ? 34 : 0;
    const artWidth = framed ? pageWidth - 72 : pageWidth;
    const artHeight = framed ? 300 : design.coverLayout === "full_bleed" ? 380 : 340;
    pdf.addImage(
      args.coverArt.dataUrl,
      pdfImageFormat(args.coverArt.dataUrl),
      artX,
      artY,
      artWidth,
      artHeight,
    );
    coverY = artY + artHeight + 34;
  } else {
    pdf.setFillColor(primary[0], primary[1], primary[2]);
    pdf.rect(0, 0, pageWidth, 205, "F");
    pdf.setFillColor(accent[0], accent[1], accent[2]);
    pdf.rect(margin, 205, 112, 8, "F");
    coverY = 252;
  }

  const coverX = margin;
  const coverTextWidth = maxWidth - 12;
  if (branding.logo) {
    const size = fitLogo(branding.logo, 112, 54);
    pdf.addImage(
      branding.logo.dataUrl,
      pdfImageFormat(branding.logo.dataUrl),
      coverX,
      coverY,
      size.width,
      size.height,
    );
    coverY += size.height + 18;
  }

  if (branding.companyName) {
    pdf.setFont(headingFont, "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(accent[0], accent[1], accent[2]);
    pdf.text(branding.companyName.toUpperCase(), coverX, coverY, { maxWidth: coverTextWidth });
    coverY += 22;
  }

  pdf.setFont(headingFont, "bold");
  pdf.setFontSize(args.title.length > 75 ? 23 : 28);
  pdf.setTextColor(ink[0], ink[1], ink[2]);
  const titleLines = pdf.splitTextToSize(args.title, coverTextWidth) as string[];
  for (const line of titleLines) {
    pdf.text(line, coverX, coverY);
    coverY += args.title.length > 75 ? 28 : 34;
  }

  pdf.setFillColor(accent[0], accent[1], accent[2]);
  pdf.rect(coverX, coverY + 3, 86, 4, "F");
  coverY += 28;

  pdf.setFont(bodyFont, "normal");
  pdf.setFontSize(12.5);
  pdf.setTextColor(muted[0], muted[1], muted[2]);
  const subtitleLines = pdf.splitTextToSize(args.subtitle, coverTextWidth) as string[];
  for (const line of subtitleLines) {
    pdf.text(line, coverX, coverY);
    coverY += 18;
  }

  if (branding.contact) {
    pdf.setFont(bodyFont, "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(muted[0], muted[1], muted[2]);
    pdf.text(branding.contact, coverX, coverY + 14, { maxWidth: coverTextWidth });
    coverY += 30;
  }

  pdf.setFont(bodyFont, "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(muted[0], muted[1], muted[2]);
  pdf.text(`Prepared ${preparedOn()}`, coverX, Math.min(coverY + 24, pageHeight - 76));
  pdf.setFont(bodyFont, "italic");
  pdf.setFontSize(9);
  pdf.setTextColor(muted[0], muted[1], muted[2]);
  pdf.text("STRICTLY PRIVATE AND CONFIDENTIAL", coverX, pageHeight - 38);

  // ---------- Table of contents ----------
  const tocEntries = blocks.filter((block) => block.kind === "h1" || block.kind === "h2") as {
    kind: "h1" | "h2";
    text: string;
  }[];

  if (tocEntries.length > 1) {
    newPage();
    write("Table of Contents", {
      size: 17,
      style: "bold",
      family: headingFont,
      gap: 6,
    });
    pdf.setDrawColor(accent[0], accent[1], accent[2]);
    pdf.setLineWidth(1);
    pdf.line(margin, y - 6, pageWidth - margin, y - 6);
    y += 10;
    for (const entry of tocEntries) {
      write(stripMarks(entry.text), {
        size: 10.5,
        style: entry.kind === "h1" ? "bold" : "normal",
        color: entry.kind === "h1" ? ink : muted,
        gap: 1,
        indent: entry.kind === "h2" ? 18 : 0,
      });
    }
  }

  newPage();

  const pendingPdfVisuals = [...(args.visuals ?? [])];
  const pdfSectionTotal = blocks.filter(
    (block) => block.kind === "h1" || block.kind === "h2",
  ).length;
  const pdfVisualInterval = Math.max(
    1,
    Math.floor(pdfSectionTotal / (pendingPdfVisuals.length + 1)),
  );
  let pdfSectionNumber = 0;

  const appendPdfVisual = (visual: ExportVisual) => {
    const imageWidth = maxWidth;
    const imageHeight = imageWidth * (2 / 3);
    ensure(imageHeight + 68);
    write(visual.title, { size: 11.5, style: "bold", family: headingFont, gap: 10 });
    ensure(imageHeight + 24);
    pdf.addImage(
      visual.dataUrl,
      pdfImageFormat(visual.dataUrl),
      margin,
      y,
      imageWidth,
      imageHeight,
    );
    y += imageHeight + 14;
    if (visual.kind === "layout") {
      write("CONCEPTUAL - NOT FOR CONSTRUCTION. Licensed professional review required.", {
        size: 9,
        style: "bold",
        family: headingFont,
        color: accent,
        gap: 8,
      });
    }
  };

  for (const block of blocks) {
    if (block.kind === "h1" || block.kind === "h2") {
      pdfSectionNumber += 1;
      ensure(70);
      write(block.text, {
        size: block.kind === "h1" ? 16 : 13.5,
        style: "bold",
        family: headingFont,
        gap: 4,
      });
      pdf.setDrawColor(accent[0], accent[1], accent[2]);
      pdf.setLineWidth(0.8);
      pdf.line(margin, y - 4, pageWidth - margin, y - 4);
      y += 10;
      let visualIndex = pendingPdfVisuals.findIndex((visual) =>
        visualMatchesHeading(visual, block.text),
      );
      if (visualIndex < 0 && pdfSectionNumber % pdfVisualInterval === 0) {
        visualIndex = pendingPdfVisuals.findIndex((visual) => !visual.placementHeading);
      }
      if (visualIndex >= 0) {
        const [visual] = pendingPdfVisuals.splice(visualIndex, 1);
        if (visual) appendPdfVisual(visual);
      }
      continue;
    }
    if (block.kind === "h3") {
      ensure(42);
      write(block.text, {
        size: 11.5,
        style: "bold",
        family: headingFont,
        color: accent,
        gap: 6,
      });
      continue;
    }
    if (block.kind === "bullet") {
      write(`•  ${block.text}`, { size: 10.5, style: "normal", gap: 3, indent: 16 });
      continue;
    }
    if (block.kind === "numbered") {
      write(`–  ${block.text}`, { size: 10.5, style: "normal", gap: 3, indent: 16 });
      continue;
    }
    if (block.kind === "table") {
      const rows = block.rows.filter((row) => !isSeparatorRow(row.join("|")));
      const columnCount = Math.max(...rows.map((row) => row.length));
      const columnWidth = maxWidth / columnCount;
      for (const [index, row] of rows.entries()) {
        const tableFontSize = columnCount > 7 ? 6.8 : columnCount > 5 ? 7.5 : 8.5;
        pdf.setFont(index === 0 ? headingFont : bodyFont, index === 0 ? "bold" : "normal");
        pdf.setFontSize(tableFontSize);
        const cellLines = Array.from({ length: columnCount }, (_, cell) => {
          const value = stripMarks(row[cell] ?? "");
          const lines = pdf.splitTextToSize(value, columnWidth - 10) as string[];
          if (lines.length <= 6) return lines;
          return [...lines.slice(0, 5), `${lines[5]?.slice(0, -1) ?? ""}…`];
        });
        const lineHeight = tableFontSize * 1.25;
        const rowHeight = Math.max(
          18,
          Math.max(...cellLines.map((lines) => lines.length)) * lineHeight + 8,
        );
        ensure(rowHeight + 4);
        const rowTop = y - 10;
        if (index === 0) {
          pdf.setFillColor(secondary[0], secondary[1], secondary[2]);
          pdf.rect(margin, rowTop, maxWidth, rowHeight, "F");
        } else if (index % 2 === 0) {
          pdf.setFillColor(250, 250, 250);
          pdf.rect(margin, rowTop, maxWidth, rowHeight, "F");
        }
        pdf.setDrawColor(215);
        pdf.setLineWidth(0.4);
        pdf.rect(margin, rowTop, maxWidth, rowHeight);
        pdf.setTextColor(ink[0], ink[1], ink[2]);
        for (let cell = 0; cell < columnCount; cell += 1) {
          const cellX = margin + cell * columnWidth;
          if (cell > 0) pdf.line(cellX, rowTop, cellX, rowTop + rowHeight);
          pdf.text(cellLines[cell] ?? [], cellX + 5, y);
          const rawCell = stripMarks(row[cell] ?? "").trim();
          if (/^https?:\/\/\S+$/.test(rawCell)) {
            pdf.link(cellX + 4, rowTop + 2, columnWidth - 8, rowHeight - 4, { url: rawCell });
          }
        }
        y += rowHeight;
      }
      y += 10;
      continue;
    }
    write(block.text, { size: 10.5, style: "normal", gap: 9 });
  }

  for (const visual of pendingPdfVisuals) {
    newPage();
    appendPdfVisual(visual);
  }

  footer();
  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function safeFilename(title: string) {
  return (
    title
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 70) || "black-r-document"
  );
}
