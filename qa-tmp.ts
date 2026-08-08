import { markdownToPdfBlob } from "./src/lib/doc-export";
import fs from "fs";
const md = `## 1. Executive Summary\n\nAcme Apparel is a **premium** manufacturer. ${"Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor. ".repeat(20)}\n\n### 1.1 Highlights\n\n- Revenue of USD 2.4m by year 3\n- Break-even in month 18\n\n| Item | Year 1 | Year 2 |\n| --- | --- | --- |\n| Revenue | 500,000 | 900,000 |\n| Costs | 400,000 | 640,000 |\n\n## 2. Market Analysis\n\n${"Market text here. ".repeat(120)}\n`;
const logo = "data:image/png;base64," + fs.readFileSync("/tmp/qa/logo.png").toString("base64");
const blob = markdownToPdfBlob({ title: "Business Plan for Acme Apparel (Pvt) Ltd", subtitle: "Business Plan 2026-2030 · Harare, Zimbabwe", markdown: md, branding: { companyName: "Acme Apparel", contact: "12 Samora Machel Ave, Harare · info@acme.co.zw · +263 77 000 0000", logo: { dataUrl: logo, width: 512, height: 256 } } });
fs.writeFileSync("/tmp/qa/out.pdf", Buffer.from(await blob.arrayBuffer()));
console.log("ok");
