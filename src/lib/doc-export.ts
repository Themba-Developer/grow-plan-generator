import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  ShadingType,
  BorderStyle,
  Footer,
  PageNumber,
} from "docx";
import { jsPDF } from "jspdf";

export type DocBlock =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "bullet" | "numbered"; text: string }
  | { kind: "table"; rows: string[][] };

const RED = "D71920";
const BLACK = "111111";

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

function inlineRuns(text: string, options?: { bold?: boolean; color?: string; size?: number }) {
  const cleaned = text.replace(/`/g, "");
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    return new TextRun({
      text: bold ? part.slice(2, -2) : part.replace(/\*/g, ""),
      bold: bold || options?.bold || false,
      color: options?.color ?? BLACK,
      size: options?.size ?? 22,
      font: "Arial",
    });
  });
}

function docxTable(rows: string[][]) {
  const columnCount = Math.max(...rows.map((row) => row.length));
  const totalWidth = 9360;
  const columnWidth = Math.floor(totalWidth / columnCount);
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: Array.from({ length: columnCount }, () => columnWidth),
    rows: rows
      .filter((row) => !isSeparatorRow(row.join("|")))
      .map(
        (row, rowIndex) =>
          new TableRow({
            children: Array.from({ length: columnCount }, (_, cellIndex) => {
              const value = row[cellIndex] ?? "";
              return new TableCell({
                borders,
                width: { size: columnWidth, type: WidthType.DXA },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                shading:
                  rowIndex === 0
                    ? { fill: "F2F2F2", type: ShadingType.CLEAR, color: "auto" }
                    : undefined,
                children: [
                  new Paragraph({
                    children: inlineRuns(value, { bold: rowIndex === 0, size: 20 }),
                  }),
                ],
              });
            }),
          }),
      ),
  });
}

export async function markdownToDocxBlob(args: {
  title: string;
  subtitle: string;
  markdown: string;
}) {
  const blocks = parseMarkdown(args.markdown);
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 200 },
      children: [
        new TextRun({ text: "BLACK R AI", bold: true, color: RED, size: 28, font: "Arial" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: args.title,
          bold: true,
          color: BLACK,
          size: 52,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: args.subtitle, color: "444444", size: 26, font: "Arial" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Prepared ${new Date().toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}`,
          color: "666666",
          size: 22,
          font: "Arial",
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  for (const block of blocks) {
    if (block.kind === "table") {
      children.push(docxTable(block.rows));
      children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
      continue;
    }
    if (block.kind === "h1" || block.kind === "h2") {
      children.push(
        new Paragraph({
          heading: block.kind === "h1" ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          spacing: { before: 320, after: 160 },
          children: inlineRuns(block.text, {
            bold: true,
            color: block.kind === "h1" ? RED : BLACK,
            size: block.kind === "h1" ? 34 : 28,
          }),
        }),
      );
      continue;
    }
    if (block.kind === "h3") {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
          children: inlineRuns(block.text, { bold: true, size: 24 }),
        }),
      );
      continue;
    }
    if (block.kind === "bullet" || block.kind === "numbered") {
      children.push(
        new Paragraph({
          numbering: { reference: block.kind === "bullet" ? "brBullets" : "brNumbers", level: 0 },
          spacing: { after: 80 },
          children: inlineRuns(block.text),
        }),
      );
      continue;
    }
    children.push(
      new Paragraph({
        spacing: { after: 160, line: 300 },
        children: inlineRuns(block.text),
      }),
    );
  }

  const document = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 34, bold: true, font: "Arial", color: RED },
          paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 28, bold: true, font: "Arial", color: BLACK },
          paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 24, bold: true, font: "Arial" },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 },
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
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Black R AI  |  ", color: "999999", size: 18, font: "Arial" }),
                  new TextRun({ children: [PageNumber.CURRENT], color: "999999", size: 18 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBlob(document);
}

export function markdownToPdfBlob(args: { title: string; subtitle: string; markdown: string }) {
  const blocks = parseMarkdown(args.markdown);
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 64;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const footer = () => {
    const page = pdf.getNumberOfPages();
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(`Black R AI  |  ${page}`, pageWidth / 2, pageHeight - 28, { align: "center" });
  };

  const newPage = () => {
    footer();
    pdf.addPage();
    y = margin;
  };

  const ensure = (needed: number) => {
    if (y + needed > pageHeight - margin) newPage();
  };

  const write = (
    text: string,
    options: { size: number; style: "normal" | "bold"; color?: [number, number, number]; gap: number; indent?: number },
  ) => {
    const clean = text.replace(/\*\*/g, "").replace(/`/g, "").replace(/\*/g, "");
    pdf.setFont("helvetica", options.style);
    pdf.setFontSize(options.size);
    const color = options.color ?? [17, 17, 17];
    pdf.setTextColor(color[0], color[1], color[2]);
    const indent = options.indent ?? 0;
    const lines = pdf.splitTextToSize(clean, maxWidth - indent) as string[];
    const lineHeight = options.size * 1.45;
    for (const line of lines) {
      ensure(lineHeight);
      pdf.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += options.gap;
  };

  // Cover
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(215, 25, 32);
  pdf.text("BLACK R AI", pageWidth / 2, 240, { align: "center" });
  pdf.setFontSize(26);
  pdf.setTextColor(17, 17, 17);
  const titleLines = pdf.splitTextToSize(args.title, maxWidth) as string[];
  let coverY = 290;
  for (const line of titleLines) {
    pdf.text(line, pageWidth / 2, coverY, { align: "center" });
    coverY += 34;
  }
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  pdf.setTextColor(70);
  const subtitleLines = pdf.splitTextToSize(args.subtitle, maxWidth) as string[];
  for (const line of subtitleLines) {
    pdf.text(line, pageWidth / 2, coverY + 12, { align: "center" });
    coverY += 20;
  }
  pdf.setFontSize(10);
  pdf.setTextColor(130);
  pdf.text(
    `Prepared ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`,
    pageWidth / 2,
    coverY + 36,
    { align: "center" },
  );
  newPage();

  for (const block of blocks) {
    if (block.kind === "h1") {
      ensure(60);
      write(block.text, { size: 17, style: "bold", color: [215, 25, 32], gap: 10 });
      continue;
    }
    if (block.kind === "h2") {
      ensure(48);
      write(block.text, { size: 14, style: "bold", gap: 8 });
      continue;
    }
    if (block.kind === "h3") {
      ensure(40);
      write(block.text, { size: 12, style: "bold", gap: 6 });
      continue;
    }
    if (block.kind === "bullet") {
      write(`•  ${block.text}`, { size: 10.5, style: "normal", gap: 3, indent: 14 });
      continue;
    }
    if (block.kind === "numbered") {
      write(`–  ${block.text}`, { size: 10.5, style: "normal", gap: 3, indent: 14 });
      continue;
    }
    if (block.kind === "table") {
      const rows = block.rows.filter((row) => !isSeparatorRow(row.join("|")));
      for (const [index, row] of rows.entries()) {
        write(row.join("   |   "), {
          size: 9.5,
          style: index === 0 ? "bold" : "normal",
          gap: 2,
          indent: 8,
        });
      }
      y += 8;
      continue;
    }
    write(block.text, { size: 10.5, style: "normal", gap: 8 });
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
