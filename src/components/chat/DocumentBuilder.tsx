import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  CircleCheck,
  Download,
  FileClock,
  FileText,
  FileUp,
  ImagePlus,
  Loader2,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createDocumentDesign,
  createOutline,
  createSection,
  createVisual,
} from "@/lib/docgen.functions";
import {
  markdownToDocxBlob,
  markdownToPdfBlob,
  downloadBlob,
  safeFilename,
} from "@/lib/doc-export";
import { EMPTY_BRANDING, readLogoFile, type Branding } from "@/lib/doc-branding";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { financialModelMarkdown, type FinancialAssumptions } from "@/lib/financial-model";
import { createFinancialChart } from "@/lib/financial-chart";
import { DOCUMENT_TYPES } from "@/lib/prompts.server";
import type { GeneratedVisual } from "@/components/chat/VisualStudio";
import { DEFAULT_DOCUMENT_DESIGN, type DocumentDesign } from "@/lib/doc-design";
import { assessDocumentReadiness } from "@/lib/document-readiness";
import {
  appendEvidenceAndReliance,
  auditDocument,
  type DocumentQualityReport,
} from "@/lib/document-quality";
import { friendlyAiError } from "@/lib/ai-errors";
import { extractPdfReference, type ReferenceDocument } from "@/lib/reference-document";

type Phase = "idle" | "outline" | "design" | "writing" | "visuals" | "quality" | "done" | "error";

type SavedDocument = {
  id: string;
  title: string;
  doc_type: string;
  content: string;
  status: string;
  updated_at: string;
};

async function withRetry<T>(action: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => window.setTimeout(resolve, 700 * attempt));
      }
    }
  }
  throw lastError;
}

export function DocumentBuilder({
  open,
  onOpenChange,
  threadId,
  brief,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string | null;
  brief: string;
}) {
  const outlineFn = useServerFn(createOutline);
  const sectionFn = useServerFn(createSection);
  const visualFn = useServerFn(createVisual);
  const designFn = useServerFn(createDocumentDesign);

  const [docType, setDocType] = useState("business_plan");
  const [editedBrief, setEditedBrief] = useState(brief);
  const [jurisdiction, setJurisdiction] = useState("South Africa");
  const [referenceDocument, setReferenceDocument] = useState<ReferenceDocument | null>(null);
  const [readingReference, setReadingReference] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [headings, setHeadings] = useState<string[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [current, setCurrent] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [branding, setBranding] = useState<Branding>(EMPTY_BRANDING);
  const [verify, setVerify] = useState(true);
  const [usePremiumDesign, setUsePremiumDesign] = useState(true);
  const [includeVisuals, setIncludeVisuals] = useState(true);
  const [useFinancialModel, setUseFinancialModel] = useState(true);
  const [visuals, setVisuals] = useState<GeneratedVisual[]>([]);
  const [coverArt, setCoverArt] = useState<GeneratedVisual | null>(null);
  const [design, setDesign] = useState<DocumentDesign>(DEFAULT_DOCUMENT_DESIGN);
  const [qualityReport, setQualityReport] = useState<DocumentQualityReport | null>(null);
  const [savedDocument, setSavedDocument] = useState<SavedDocument | null>(null);
  const [modelsUsed, setModelsUsed] = useState<string[]>([]);
  const [financials, setFinancials] = useState<FinancialAssumptions>({
    currency: "ZAR",
    years: 5,
    startupInvestment: 250000,
    openingRevenue: 400000,
    annualGrowthRate: 15,
    grossMarginRate: 42,
    openingOperatingExpenses: 112000,
    operatingExpenseGrowthRate: 8,
    taxRate: 27,
    discountRate: 12,
    depreciationYears: 5,
    workingCapitalRate: 8,
    maintenanceCapexRate: 2,
  });
  const logoInput = useRef<HTMLInputElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  const documentId = useRef<string | null>(null);
  const latestMarkdown = useRef("");

  useEffect(() => {
    if (open) setEditedBrief(brief);
  }, [open, brief]);

  useEffect(() => {
    if (!open || !threadId) {
      setSavedDocument(null);
      return;
    }
    let active = true;
    void supabase
      .from("documents")
      .select("id, title, doc_type, content, status, updated_at")
      .eq("thread_id", threadId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("[documents] recovery lookup failed", error);
        if (active) setSavedDocument(data?.content ? data : null);
      });
    return () => {
      active = false;
    };
  }, [open, threadId]);

  useEffect(() => {
    if (!open) {
      cancelled.current = true;
      if (
        documentId.current &&
        ["outline", "design", "writing", "visuals", "quality"].includes(phase)
      ) {
        void supabase
          .from("documents")
          .update({ content: latestMarkdown.current, status: "draft" })
          .eq("id", documentId.current);
      }
    }
  }, [open, phase]);

  const wordCount = markdown ? markdown.trim().split(/\s+/).length : 0;
  const estimatedPages = Math.round(wordCount / 320);
  const readiness = useMemo(
    () => assessDocumentReadiness(docType, editedBrief, branding.companyName),
    [docType, editedBrief, branding.companyName],
  );

  const build = async () => {
    cancelled.current = false;
    setPhase("outline");
    setError("");
    setMarkdown("");
    setDoneCount(0);
    setCurrent("");
    setVisuals([]);
    setCoverArt(null);
    setDesign(DEFAULT_DOCUMENT_DESIGN);
    setQualityReport(null);
    setModelsUsed([]);
    documentId.current = null;
    latestMarkdown.current = "";
    let assembled = "";
    let activeDesign = DEFAULT_DOCUMENT_DESIGN;

    try {
      const outline = await withRetry(() =>
        outlineFn({
          data: {
            docType,
            brief: editedBrief,
            jurisdiction: jurisdiction.trim() || undefined,
            referenceName: referenceDocument?.name,
            referenceText: referenceDocument?.text,
          },
        }),
      );
      if (cancelled.current) return;
      setTitle(outline.title);
      setSubtitle(outline.subtitle);
      const outlineHeadings = outline.sections.map((section) => section.heading);
      setHeadings(outlineHeadings);

      const { data: userResult } = await supabase.auth.getUser();
      if (userResult.user) {
        const { data: draft, error: draftError } = await supabase
          .from("documents")
          .insert({
            user_id: userResult.user.id,
            thread_id: threadId,
            title: outline.title,
            doc_type: docType,
            content: "",
            status: "generating",
          })
          .select("id")
          .single();
        if (draftError) console.error("[documents] draft create failed", draftError);
        documentId.current = draft?.id ?? null;
      }

      if (usePremiumDesign) {
        setPhase("design");
        setCurrent("Designing the cover and letterhead system");
        try {
          const designResult = await withRetry(() =>
            designFn({
              data: {
                docType,
                title: outline.title,
                subtitle: outline.subtitle,
                brief: editedBrief,
                companyName: branding.companyName || undefined,
                contact: branding.contact || undefined,
                brandColor: branding.logo?.dominantColor,
                jurisdiction: jurisdiction.trim() || undefined,
                referenceProfile: outline.referenceProfile,
              },
            }),
          );
          if (cancelled.current) return;
          activeDesign = designResult.design;
          setDesign(designResult.design);
          setModelsUsed((previous) => Array.from(new Set([...previous, designResult.provider])));
          setCurrent("Creating original cover artwork");
          try {
            const art = await withRetry(() =>
              visualFn({
                data: {
                  title: "Cover artwork",
                  kind: "concept",
                  prompt: `${designResult.design.coverArtPrompt}\n\nThis is a sophisticated hero image for a ${docType.replaceAll("_", " ")} about: ${editedBrief.slice(0, 1200)}. Use a landscape editorial composition with purposeful negative space. Absolutely no text, letters, numbers, logos, seals, watermarks or UI elements.`,
                },
              }),
            );
            if (cancelled.current) return;
            setCoverArt(art);
            if (art.model) {
              setModelsUsed((previous) => Array.from(new Set([...previous, art.model])));
            }
          } catch (coverError) {
            console.error("[builder] cover art failed", coverError);
            toast.warning("Art direction is ready, but cover artwork could not be generated.");
          }
        } catch (designError) {
          console.error("[builder] design direction failed", designError);
          toast.warning("Using the premium fallback design for this document.");
        }
      }

      setPhase("writing");

      let previousSummary = "";
      const financialModel = useFinancialModel ? financialModelMarkdown(financials) : undefined;

      for (const [index, section] of outline.sections.entries()) {
        if (cancelled.current) return;
        setCurrent(section.heading);
        const {
          markdown: sectionMarkdown,
          lead,
          reviewer,
        } = await withRetry(() =>
          sectionFn({
            data: {
              docType,
              brief: editedBrief,
              title: outline.title,
              outlineHeadings,
              heading: section.heading,
              sectionBrief: section.brief,
              targetWords: section.targetWords,
              previousSummary,
              research: outline.research,
              financialModel,
              jurisdiction: jurisdiction.trim() || undefined,
              referenceProfile: outline.referenceProfile,
              verify,
            },
          }),
        );
        setModelsUsed((previous) => Array.from(new Set([...previous, lead, reviewer])));
        assembled += `${sectionMarkdown.trim()}\n\n`;
        latestMarkdown.current = assembled;
        previousSummary = `${previousSummary}\n- ${section.heading}: ${sectionMarkdown
          .replace(/[#*|>-]/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 320)}`.slice(-4000);
        setMarkdown(assembled);
        setDoneCount(index + 1);
        if (documentId.current) {
          const { error: progressError } = await supabase
            .from("documents")
            .update({ content: assembled, status: "generating" })
            .eq("id", documentId.current);
          if (progressError) console.error("[documents] progress save failed", progressError);
        }
      }

      if (includeVisuals && (outline.visuals.length || useFinancialModel)) {
        setPhase("visuals");
        const generated: GeneratedVisual[] = useFinancialModel
          ? [createFinancialChart(financials, activeDesign)]
          : [];
        setVisuals([...generated]);
        const requestedVisuals = outline.visuals
          .filter((visual) => !useFinancialModel || visual.kind !== "chart")
          .slice(0, Math.max(0, 3 - generated.length));
        for (const visual of requestedVisuals) {
          if (cancelled.current) return;
          setCurrent(visual.title);
          const result = await withRetry(() => visualFn({ data: visual }));
          generated.push({
            ...result,
            ...(visual.afterSection ? { placementHeading: visual.afterSection } : {}),
          });
          setVisuals([...generated]);
        }
      }

      setPhase("quality");
      setCurrent("Checking completeness, evidence and professional boundaries");
      assembled = appendEvidenceAndReliance({
        markdown: assembled,
        docType,
        readinessScore: readiness.score,
        financialModelEnabled: useFinancialModel,
      });
      const report = auditDocument({
        markdown: assembled,
        docType,
        expectedSections: outline.sections.length + 1,
        financialModelEnabled: useFinancialModel,
      });
      setMarkdown(assembled);
      latestMarkdown.current = assembled;
      setQualityReport(report);

      if (documentId.current) {
        const { error: saveError } = await supabase
          .from("documents")
          .update({ content: assembled, status: "complete" })
          .eq("id", documentId.current);
        if (saveError) console.error("[documents] final save failed", saveError);
      }

      setCurrent("");
      setPhase("done");
      toast.success("Document complete — download it below.");
    } catch (caught) {
      console.error("[builder] failed", caught);
      if (documentId.current) {
        const { error: saveError } = await supabase
          .from("documents")
          .update({ content: assembled, status: "error" })
          .eq("id", documentId.current);
        if (saveError) console.error("[documents] failure save failed", saveError);
      }
      setError(friendlyAiError(caught));
      setPhase("error");
    }
  };

  const downloadDocx = async () => {
    const pageFormat = /united states|\busa?\b|u\.s\./i.test(jurisdiction) ? "letter" : "a4";
    const blob = await markdownToDocxBlob({
      title,
      subtitle,
      markdown,
      branding,
      visuals,
      design,
      ...(coverArt ? { coverArt } : {}),
      pageFormat,
    });
    downloadBlob(blob, `${safeFilename(title)}.docx`);
  };

  const downloadPdf = () => {
    const pageFormat = /united states|\busa?\b|u\.s\./i.test(jurisdiction) ? "letter" : "a4";
    const blob = markdownToPdfBlob({
      title,
      subtitle,
      markdown,
      branding,
      visuals,
      design,
      ...(coverArt ? { coverArt } : {}),
      pageFormat,
    });
    downloadBlob(blob, `${safeFilename(title)}.pdf`);
  };

  const progress = headings.length ? Math.round((doneCount / headings.length) * 100) : 0;
  const running =
    phase === "outline" ||
    phase === "design" ||
    phase === "writing" ||
    phase === "visuals" ||
    phase === "quality";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Build full document</DialogTitle>
          <DialogDescription>
            Black R AI writes the complete document section by section — typically 50–60 pages —
            then gives you Word and PDF downloads.
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" || phase === "error" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Document type</Label>
              <Select
                value={docType}
                onValueChange={(value) => {
                  setDocType(value);
                  setUseFinancialModel(
                    /business_plan|feasibility_study|funding_proposal|financial_report/.test(value),
                  );
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {savedDocument && (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/35 p-3">
                <FileClock className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{savedDocument.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {savedDocument.status === "complete" ? "Saved document" : "Recoverable draft"} ·{" "}
                    {new Date(savedDocument.updated_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const recoveredHeadings = [
                      ...savedDocument.content.matchAll(/^##\s+(.+)$/gm),
                    ].map((match) => match[1] || "Section");
                    setDocType(savedDocument.doc_type);
                    setTitle(savedDocument.title);
                    setSubtitle("Recovered from document history");
                    setMarkdown(savedDocument.content);
                    latestMarkdown.current = savedDocument.content;
                    documentId.current = savedDocument.id;
                    setHeadings(recoveredHeadings);
                    setDoneCount(recoveredHeadings.length);
                    setQualityReport(
                      auditDocument({
                        markdown: savedDocument.content,
                        docType: savedDocument.doc_type,
                        expectedSections: Math.max(1, recoveredHeadings.length),
                        financialModelEnabled: /Deterministic financial source of truth/i.test(
                          savedDocument.content,
                        ),
                      }),
                    );
                    setPhase("done");
                  }}
                >
                  Open
                </Button>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <ShieldCheck className="size-4 text-primary" />
                    Quality review
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Every section receives an independent accuracy check.
                  </p>
                </div>
                <Switch checked={verify} onCheckedChange={setVerify} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Sparkles className="size-4 text-primary" />
                    Visual package
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Up to 3 custom visuals in exports.
                  </p>
                </div>
                <Switch checked={includeVisuals} onCheckedChange={setIncludeVisuals} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Palette className="size-4 text-primary" />
                  Premium document design
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Bespoke cover artwork, typography and letterhead composed with your exact logo and
                  title.
                </p>
              </div>
              <Switch checked={usePremiumDesign} onCheckedChange={setUsePremiumDesign} />
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Calculator className="size-4 text-primary" />
                    Deterministic financial model
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Calculates the schedule in code, then locks it for both models.
                  </p>
                </div>
                <Switch checked={useFinancialModel} onCheckedChange={setUseFinancialModel} />
              </div>
              {useFinancialModel && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Input
                    aria-label="Currency"
                    value={financials.currency}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        currency: event.target.value.toUpperCase().slice(0, 6),
                      }))
                    }
                    placeholder="ZAR"
                  />
                  <Input
                    aria-label="Projection years"
                    type="number"
                    min={1}
                    max={10}
                    value={financials.years}
                    onChange={(event) =>
                      setFinancials((value) => ({ ...value, years: Number(event.target.value) }))
                    }
                    placeholder="Years"
                  />
                  <Input
                    aria-label="Initial investment"
                    type="number"
                    min={0}
                    value={financials.startupInvestment}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        startupInvestment: Number(event.target.value),
                      }))
                    }
                    placeholder="Initial investment"
                  />
                  <Input
                    aria-label="Year one revenue"
                    type="number"
                    min={0}
                    value={financials.openingRevenue}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        openingRevenue: Number(event.target.value),
                      }))
                    }
                    placeholder="Year 1 revenue"
                  />
                  <Input
                    aria-label="Annual growth percentage"
                    type="number"
                    value={financials.annualGrowthRate}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        annualGrowthRate: Number(event.target.value),
                      }))
                    }
                    placeholder="Growth %"
                  />
                  <Input
                    aria-label="Gross margin percentage"
                    type="number"
                    value={financials.grossMarginRate}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        grossMarginRate: Number(event.target.value),
                      }))
                    }
                    placeholder="Gross margin %"
                  />
                  <Input
                    aria-label="Year one operating expenses"
                    type="number"
                    min={0}
                    value={financials.openingOperatingExpenses}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        openingOperatingExpenses: Number(event.target.value),
                      }))
                    }
                    placeholder="Year 1 opex"
                  />
                  <Input
                    aria-label="Operating expense growth percentage"
                    type="number"
                    value={financials.operatingExpenseGrowthRate}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        operatingExpenseGrowthRate: Number(event.target.value),
                      }))
                    }
                    placeholder="Opex growth %"
                  />
                  <Input
                    aria-label="Tax percentage"
                    type="number"
                    value={financials.taxRate}
                    onChange={(event) =>
                      setFinancials((value) => ({ ...value, taxRate: Number(event.target.value) }))
                    }
                    placeholder="Tax %"
                  />
                  <Input
                    aria-label="Discount rate percentage"
                    type="number"
                    value={financials.discountRate}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        discountRate: Number(event.target.value),
                      }))
                    }
                    placeholder="Discount rate %"
                  />
                  <Input
                    aria-label="Depreciation life in years"
                    type="number"
                    min={1}
                    max={30}
                    value={financials.depreciationYears}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        depreciationYears: Number(event.target.value),
                      }))
                    }
                    placeholder="Asset life (years)"
                  />
                  <Input
                    aria-label="Working capital percentage of revenue"
                    type="number"
                    min={0}
                    max={100}
                    value={financials.workingCapitalRate}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        workingCapitalRate: Number(event.target.value),
                      }))
                    }
                    placeholder="Working capital %"
                  />
                  <Input
                    aria-label="Maintenance capital expenditure percentage of revenue"
                    type="number"
                    min={0}
                    max={100}
                    value={financials.maintenanceCapexRate}
                    onChange={(event) =>
                      setFinancials((value) => ({
                        ...value,
                        maintenanceCapexRate: Number(event.target.value),
                      }))
                    }
                    placeholder="Maintenance capex %"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Jurisdiction and primary market</Label>
              <Input
                value={jurisdiction}
                onChange={(event) => setJurisdiction(event.target.value)}
                placeholder="South Africa"
              />
              <p className="text-xs text-muted-foreground">
                Controls spelling, currency context, institutions, regulation and research sources.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Reference business plan</Label>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded border border-dashed border-border text-muted-foreground">
                  {readingReference ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <FileText className="size-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium">
                    {referenceDocument?.name || "Upload an existing plan (optional)"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {referenceDocument
                      ? `${referenceDocument.pageCount} pages analysed for structure and research style.`
                      : "PDF, up to 15 MB. Its format is followed; its facts are not reused as current evidence."}
                  </p>
                </div>
                <input
                  ref={referenceInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setReadingReference(true);
                    try {
                      const reference = await extractPdfReference(file);
                      setReferenceDocument(reference);
                      toast.success(`Reference plan ready: ${reference.pageCount} pages analysed.`);
                    } catch (caught) {
                      toast.error(
                        caught instanceof Error ? caught.message : "Could not read reference PDF",
                      );
                    } finally {
                      setReadingReference(false);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={readingReference}
                  onClick={() => referenceInput.current?.click()}
                >
                  <FileUp className="size-4" />
                  {referenceDocument ? "Replace" : "Upload"}
                </Button>
                {referenceDocument && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove reference plan"
                    onClick={() => setReferenceDocument(null)}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Company letterhead</Label>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                {branding.logo ? (
                  <img
                    src={branding.logo.dataUrl}
                    alt="Company logo preview"
                    className="h-12 w-12 rounded border border-border object-contain"
                  />
                ) : (
                  <span className="flex size-12 items-center justify-center rounded border border-dashed border-border text-muted-foreground">
                    <ImagePlus className="size-5" />
                  </span>
                )}
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">
                    {branding.logo ? "Logo added" : "Upload your logo"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG or JPG. Used on the cover page and every page header.
                  </p>
                </div>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/gif"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    try {
                      const logo = await readLogoFile(file);
                      setBranding((prev) => ({ ...prev, logo }));
                    } catch (caught) {
                      toast.error(
                        caught instanceof Error ? caught.message : "Could not read image",
                      );
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => logoInput.current?.click()}
                >
                  {branding.logo ? "Replace" : "Upload"}
                </Button>
                {branding.logo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setBranding((prev) => ({ ...prev, logo: null }))}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="Business name"
                  value={branding.companyName}
                  onChange={(event) =>
                    setBranding((prev) => ({ ...prev, companyName: event.target.value }))
                  }
                />
                <Input
                  placeholder="Address · email · phone"
                  value={branding.contact}
                  onChange={(event) =>
                    setBranding((prev) => ({ ...prev, contact: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brief">Brief</Label>
              <Textarea
                id="brief"
                value={editedBrief}
                onChange={(event) => setEditedBrief(event.target.value)}
                rows={9}
                placeholder="Business name, location, industry, products, target market, capital required, currency, funding purpose, timeline..."
              />
              <p className="text-xs text-muted-foreground">
                Pulled from this conversation. Edit or add detail for a sharper document.
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl border p-3",
                readiness.level === "strong"
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : "border-amber-500/25 bg-amber-500/5",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {readiness.level === "strong" ? (
                    <CircleCheck className="size-4 text-emerald-600" />
                  ) : (
                    <TriangleAlert className="size-4 text-amber-600" />
                  )}
                  Brief readiness
                </p>
                <span className="text-sm font-semibold">{readiness.score}%</span>
              </div>
              {readiness.missing.length ? (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {readiness.missing.slice(0, 3).map((item) => (
                    <p key={item.id}>• {item.guidance}</p>
                  ))}
                  <p className="pt-1">
                    You may continue; missing inputs will be labelled as assumptions.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  The brief contains the core inputs required for a strong first draft.
                </p>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              className="w-full gap-2"
              onClick={() => void build()}
              disabled={editedBrief.trim().length < 30}
            >
              <FileText className="size-4" />
              Generate document
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              This takes several minutes. Keep this window open.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {phase === "outline"
                    ? "Planning document structure..."
                    : phase === "design"
                      ? "Designing cover and brand system..."
                      : phase === "visuals"
                        ? `Creating visual ${visuals.length + 1}`
                        : phase === "quality"
                          ? "Running final quality checks..."
                          : phase === "done"
                            ? "Document complete"
                            : `Writing section ${doneCount + 1} of ${headings.length}`}
                </span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress
                value={
                  phase === "outline"
                    ? 4
                    : phase === "design"
                      ? 8
                      : phase === "visuals"
                        ? 96
                        : phase === "quality"
                          ? 99
                          : progress
                }
              />
              {current && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  {current}
                </p>
              )}
            </div>

            {title && (
              <div className="rounded-lg border border-border p-4">
                <p className="font-display text-base font-bold">{title}</p>
                <p className="text-xs text-muted-foreground">{subtitle}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {wordCount.toLocaleString()} words · approx. {estimatedPages} pages · {doneCount}/
                  {headings.length} sections
                </p>
              </div>
            )}

            {coverArt && (
              <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
                <img
                  src={coverArt.dataUrl}
                  alt="Generated cover artwork"
                  className="aspect-[3/2] w-full object-cover"
                />
                <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="font-medium">{design.themeName}</span>
                  <span className="text-muted-foreground">Premium cover + letterhead</span>
                </div>
              </div>
            )}

            {headings.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-3 text-xs">
                {headings.map((heading, index) => (
                  <li
                    key={heading}
                    className={cn(
                      "flex items-center gap-2",
                      index < doneCount ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        index < doneCount ? "bg-primary" : "bg-border",
                      )}
                    />
                    {heading}
                  </li>
                ))}
              </ul>
            )}

            {visuals.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {visuals.map((visual) => (
                  <div
                    key={`${visual.title}-${visual.dataUrl.slice(-12)}`}
                    className="overflow-hidden rounded-lg border border-border"
                  >
                    <img
                      src={visual.dataUrl}
                      alt={visual.title}
                      className="aspect-[3/2] w-full object-cover"
                    />
                    <p className="truncate px-2 py-1.5 text-[10px] text-muted-foreground">
                      {visual.title}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {modelsUsed.length > 0 && (
              <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Quality workflow complete.</span>{" "}
                Research, design and review checks were applied where enabled.
              </div>
            )}

            {qualityReport && (
              <div className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4 text-primary" />
                    Completion quality checks
                  </p>
                  <span className="text-lg font-bold">{qualityReport.score}%</span>
                </div>
                <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  {qualityReport.checks.map((check) => (
                    <p key={check.id} className="flex items-start gap-1.5">
                      <span className={check.passed ? "text-emerald-600" : "text-amber-600"}>
                        {check.passed ? "✓" : "!"}
                      </span>
                      <span>{check.label}</span>
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Automated completion checks do not replace professional factual, financial, legal
                  or engineering sign-off.
                </p>
              </div>
            )}

            {phase === "done" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="gap-2" onClick={() => void downloadDocx()}>
                  <Download className="size-4" />
                  Download DOCX
                </Button>
                <Button variant="outline" className="gap-2" onClick={downloadPdf}>
                  <Download className="size-4" />
                  Download PDF
                </Button>
              </div>
            )}

            {phase === "done" && (
              <Button
                variant="ghost"
                className="w-full gap-2"
                onClick={() => {
                  setPhase("idle");
                  setHeadings([]);
                }}
              >
                <RefreshCw className="size-4" />
                Build another document
              </Button>
            )}

            {running && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  cancelled.current = true;
                  if (documentId.current) {
                    void supabase
                      .from("documents")
                      .update({ content: latestMarkdown.current, status: "draft" })
                      .eq("id", documentId.current);
                  }
                  setPhase("idle");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
