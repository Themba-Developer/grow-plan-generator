import {
  AlignmentType,
  Document,
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

export type DocBlock =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "bullet" | "numbered"; text: string }
  | { kind: "table"; rows: string[][] };

const RED = "C8102E";
const BLACK = "111111";
const GREY = "5A5A5A";
const HEAD_FONT = "Arial";
const BODY_FONT = "Georgia";

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
  return text.replace(/\*\*/g, "").replace(/`/g, "").replace(/\*/g, "");
}

function inlineRuns(
  text: string,
  options?: { bold?: boolean; color?: string; size?: number; font?: string },
) {
  const cleaned = text.replace(/`/g, "");
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
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

function docxTable(rows: string[][]) {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const totalWidth = 9360;
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
                        fill: "F4F4F4",
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
                      font: HEAD_FONT,
                      color: rowIndex === 0 ? BLACK : BLACK,
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
}) {
  const branding = args.branding ?? EMPTY_BRANDING;
  const blocks = parseMarkdown(args.markdown);
  const children: (Paragraph | Table)[] = [];

  // ---------- Cover page ----------
  if (branding.logo) {
    const size = fitLogo(branding.logo, 170, 110);
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 1600, after: 320 },
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
    children.push(new Paragraph({ spacing: { before: 1800 }, children: [] }));
  }

  if (branding.companyName) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
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
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: RED, space: 12 } },
      children: [
        new TextRun({ text: args.title, bold: true, color: BLACK, size: 48, font: HEAD_FONT }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: args.subtitle, color: GREY, size: 26, font: BODY_FONT })],
    }),
  );

  if (branding.contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({ text: branding.contact, color: GREY, size: 20, font: BODY_FONT }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400 },
      children: [
        new TextRun({ text: `Prepared ${preparedOn()}`, color: "808080", size: 20, font: BODY_FONT }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200 },
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
  const tocEntries = blocks.filter(
    (block) => block.kind === "h1" || block.kind === "h2",
  ) as { kind: "h1" | "h2"; text: string }[];

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
          indent: entry.kind === "h2" ? { left: 360 } : undefined,
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
  for (const block of blocks) {
    if (block.kind === "table") {
      children.push(docxTable(block.rows));
      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
      continue;
    }
    if (block.kind === "h1" || block.kind === "h2") {
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
          children: inlineRuns(block.text),
        }),
      );
      continue;
    }
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200, line: 320 },
        children: inlineRuns(block.text),
      }),
    );
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
    new TextRun({ text: headerLabel, color: GREY, size: 17, font: HEAD_FONT }),
  );

  headerChildren.push(
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RED, space: 6 } },
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
            size: { width: 12240, height: 15840 },
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
}) {
  const branding = args.branding ?? EMPTY_BRANDING;
  const blocks = parseMarkdown(args.markdown);
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 64;
  const headerBottom = 92;
  const maxWidth = pageWidth - margin * 2;
  let y = headerBottom;

  const footer = () => {
    const page = pdf.getNumberOfPages();
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(
      `${branding.companyName || "Black R AI"}  |  ${page}`,
      pageWidth / 2,
      pageHeight - 30,
      { align: "center" },
    );
  };

  const letterhead = () => {
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
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(40);
    pdf.text((branding.companyName || args.title).toUpperCase(), textLeft, 50, {
      maxWidth: maxWidth - (textLeft - margin),
    });
    if (branding.contact) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(120);
      pdf.text(branding.contact, textLeft, 62, { maxWidth: maxWidth - (textLeft - margin) });
    }
    pdf.setDrawColor(200, 16, 46);
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
    pdf.setFont(options.family ?? "times", options.style);
    pdf.setFontSize(options.size);
    const color = options.color ?? [17, 17, 17];
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
  let coverY = 170;
  if (branding.logo) {
    const size = fitLogo(branding.logo, 190, 110);
    pdf.addImage(
      branding.logo.dataUrl,
      pdfImageFormat(branding.logo.dataUrl),
      (pageWidth - size.width) / 2,
      coverY,
      size.width,
      size.height,
    );
    coverY += size.height + 46;
  } else {
    coverY = 230;
  }

  if (branding.companyName) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(200, 16, 46);
    pdf.text(branding.companyName.toUpperCase(), pageWidth / 2, coverY, { align: "center" });
    coverY += 30;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(25);
  pdf.setTextColor(17, 17, 17);
  const titleLines = pdf.splitTextToSize(args.title, maxWidth - 40) as string[];
  for (const line of titleLines) {
    pdf.text(line, pageWidth / 2, coverY, { align: "center" });
    coverY += 32;
  }

  pdf.setDrawColor(200, 16, 46);
  pdf.setLineWidth(1.5);
  pdf.line(pageWidth / 2 - 70, coverY + 4, pageWidth / 2 + 70, coverY + 4);
  coverY += 34;

  pdf.setFont("times", "normal");
  pdf.setFontSize(13);
  pdf.setTextColor(70);
  const subtitleLines = pdf.splitTextToSize(args.subtitle, maxWidth - 80) as string[];
  for (const line of subtitleLines) {
    pdf.text(line, pageWidth / 2, coverY, { align: "center" });
    coverY += 20;
  }

  if (branding.contact) {
    pdf.setFontSize(10);
    pdf.setTextColor(110);
    pdf.text(branding.contact, pageWidth / 2, coverY + 14, { align: "center", maxWidth });
    coverY += 30;
  }

  pdf.setFontSize(10);
  pdf.setTextColor(130);
  pdf.text(`Prepared ${preparedOn()}`, pageWidth / 2, coverY + 24, { align: "center" });
  pdf.setFont("times", "italic");
  pdf.setFontSize(9);
  pdf.setTextColor(150);
  pdf.text("Strictly private and confidential", pageWidth / 2, pageHeight - 90, {
    align: "center",
  });

  // ---------- Table of contents ----------
  const tocEntries = blocks.filter(
    (block) => block.kind === "h1" || block.kind === "h2",
  ) as { kind: "h1" | "h2"; text: string }[];

  if (tocEntries.length > 1) {
    newPage();
    write("Table of Contents", {
      size: 17,
      style: "bold",
      family: "helvetica",
      gap: 6,
    });
    pdf.setDrawColor(200, 16, 46);
    pdf.setLineWidth(1);
    pdf.line(margin, y - 6, pageWidth - margin, y - 6);
    y += 10;
    for (const entry of tocEntries) {
      write(stripMarks(entry.text), {
        size: 10.5,
        style: entry.kind === "h1" ? "bold" : "normal",
        color: entry.kind === "h1" ? [17, 17, 17] : [90, 90, 90],
        gap: 1,
        indent: entry.kind === "h2" ? 18 : 0,
      });
    }
  }

  newPage();

  for (const block of blocks) {
    if (block.kind === "h1" || block.kind === "h2") {
      ensure(70);
      write(block.text, {
        size: block.kind === "h1" ? 16 : 13.5,
        style: "bold",
        family: "helvetica",
        gap: 4,
      });
      pdf.setDrawColor(200, 16, 46);
      pdf.setLineWidth(0.8);
      pdf.line(margin, y - 4, pageWidth - margin, y - 4);
      y += 10;
      continue;
    }
    if (block.kind === "h3") {
      ensure(42);
      write(block.text, {
        size: 11.5,
        style: "bold",
        family: "helvetica",
        color: [200, 16, 46],
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
      const rowHeight = 16;
      for (const [index, row] of rows.entries()) {
        ensure(rowHeight + 4);
        if (index === 0) {
          pdf.setFillColor(244, 244, 244);
          pdf.rect(margin, y - 11, maxWidth, rowHeight, "F");
        }
        pdf.setDrawColor(215);
        pdf.setLineWidth(0.4);
        pdf.line(margin, y + 5, pageWidth - margin, y + 5);
        pdf.setFont("helvetica", index === 0 ? "bold" : "normal");
        pdf.setFontSize(8.5);
        pdf.setTextColor(30);
        for (let cell = 0; cell < columnCount; cell += 1) {
          const value = stripMarks(row[cell] ?? "");
          const lines = pdf.splitTextToSize(value, columnWidth - 10) as string[];
          pdf.text(lines[0] ?? "", margin + cell * columnWidth + 5, y);
        }
        y += rowHeight;
      }
      y += 10;
      continue;
    }
    write(block.text, { size: 10.5, style: "normal", gap: 9 });
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
