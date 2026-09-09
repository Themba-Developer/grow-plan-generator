import { calculateFinancialModel, type FinancialAssumptions } from "./financial-model";
import { normalizeDocumentDesign, type DocumentDesign } from "./doc-design";

function cssHex(value: string) {
  return `#${value.replace(/^#/, "")}`;
}

function compact(value: number, currency: string) {
  return `${currency} ${Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
}

export function createFinancialChart(
  assumptions: FinancialAssumptions,
  suppliedDesign?: DocumentDesign,
) {
  const design = normalizeDocumentDesign(suppliedDesign);
  const result = calculateFinancialModel(assumptions);
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not render the financial chart.");

  const primary = cssHex(design.primaryColor);
  const accent = cssHex(design.accentColor);
  const ink = cssHex(design.inkColor);
  const muted = cssHex(design.mutedColor);
  const secondary = cssHex(design.secondaryColor);
  const green = "#16856B";
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = primary;
  context.fillRect(0, 0, canvas.width, 22);

  context.fillStyle = ink;
  context.font = "700 54px Arial";
  context.fillText("Financial outlook", 100, 118);
  context.fillStyle = muted;
  context.font = "28px Arial";
  context.fillText(
    "Revenue, EBITDA and free cash flow — deterministic planning schedule",
    100,
    168,
  );

  const chart = { left: 130, top: 250, right: 1430, bottom: 835 };
  const values = result.schedule.flatMap((row) => [row.revenue, row.ebitda, row.freeCashFlow]);
  const maximum = Math.max(...values, 1) * 1.12;
  const minimum = Math.min(...values, 0) * 1.12;
  const range = maximum - minimum || 1;
  const yFor = (value: number) =>
    chart.bottom - ((value - minimum) / range) * (chart.bottom - chart.top);
  const zeroY = yFor(0);

  context.strokeStyle = "#D7DCE2";
  context.lineWidth = 2;
  context.font = "22px Arial";
  context.fillStyle = muted;
  for (let index = 0; index <= 4; index += 1) {
    const value = minimum + (range * index) / 4;
    const y = yFor(value);
    context.beginPath();
    context.moveTo(chart.left, y);
    context.lineTo(chart.right, y);
    context.stroke();
    context.fillText(compact(value, assumptions.currency), 18, y + 8);
  }

  const slot = (chart.right - chart.left) / result.schedule.length;
  const barWidth = Math.min(100, slot * 0.42);
  context.fillStyle = `${primary}D9`;
  result.schedule.forEach((row, index) => {
    const x = chart.left + slot * index + slot / 2;
    const revenueY = yFor(row.revenue);
    context.fillRect(x - barWidth / 2, revenueY, barWidth, zeroY - revenueY);
    context.fillStyle = ink;
    context.font = "700 20px Arial";
    context.textAlign = "center";
    context.fillText(compact(row.revenue, assumptions.currency), x, revenueY - 14);
    context.fillStyle = muted;
    context.font = "22px Arial";
    context.fillText(`Year ${row.year}`, x, chart.bottom + 42);
    context.fillStyle = `${primary}D9`;
  });

  const drawLine = (field: "ebitda" | "freeCashFlow", color: string) => {
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 7;
    context.beginPath();
    result.schedule.forEach((row, index) => {
      const x = chart.left + slot * index + slot / 2;
      const y = yFor(row[field]);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    result.schedule.forEach((row, index) => {
      const x = chart.left + slot * index + slot / 2;
      const y = yFor(row[field]);
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.fill();
    });
  };
  drawLine("ebitda", accent);
  drawLine("freeCashFlow", green);

  context.textAlign = "left";
  context.fillStyle = secondary;
  context.fillRect(100, 900, 1336, 74);
  const legends = [
    { label: "Revenue", color: primary },
    { label: "EBITDA", color: accent },
    { label: "Free cash flow", color: green },
  ];
  legends.forEach((legend, index) => {
    const x = 150 + index * 290;
    context.fillStyle = legend.color;
    context.fillRect(x, 926, 34, 16);
    context.fillStyle = ink;
    context.font = "22px Arial";
    context.fillText(legend.label, x + 48, 942);
  });
  context.fillStyle = muted;
  context.font = "18px Arial";
  context.fillText("Calculated from the assumptions shown in the financial schedules.", 1010, 942);

  return {
    title: "Revenue, EBITDA and free cash flow outlook",
    kind: "chart" as const,
    dataUrl: canvas.toDataURL("image/png"),
    revisedPrompt:
      "Deterministic chart rendered in application code from the supplied assumptions.",
    placementHeading: "Financial Plan and Assumptions",
  };
}
