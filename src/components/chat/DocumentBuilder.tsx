import { useEffect, useRef, useState } from "react";
import { Download, FileText, ImagePlus, Loader2, RefreshCw, X } from "lucide-react";
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
import { createOutline, createSection } from "@/lib/docgen.functions";
import { markdownToDocxBlob, markdownToPdfBlob, downloadBlob, safeFilename } from "@/lib/doc-export";
import { EMPTY_BRANDING, readLogoFile, type Branding } from "@/lib/doc-branding";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Phase = "idle" | "outline" | "writing" | "done" | "error";

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

  const [docType, setDocType] = useState("business_plan");
  const [editedBrief, setEditedBrief] = useState(brief);
  const [phase, setPhase] = useState<Phase>("idle");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [headings, setHeadings] = useState<string[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [current, setCurrent] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const [branding, setBranding] = useState<Branding>(EMPTY_BRANDING);
  const logoInput = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (open) setEditedBrief(brief);
  }, [open, brief]);

  useEffect(() => {
    if (!open) cancelled.current = true;
  }, [open]);

  const wordCount = markdown ? markdown.trim().split(/\s+/).length : 0;
  const estimatedPages = Math.round(wordCount / 320);

  const build = async () => {
    cancelled.current = false;
    setPhase("outline");
    setError("");
    setMarkdown("");
    setDoneCount(0);
    setCurrent("");

    try {
      const outline = await outlineFn({ data: { docType, brief: editedBrief } });
      if (cancelled.current) return;
      setTitle(outline.title);
      setSubtitle(outline.subtitle);
      const outlineHeadings = outline.sections.map((section) => section.heading);
      setHeadings(outlineHeadings);
      setPhase("writing");

      let assembled = "";
      let previousSummary = "";

      for (const [index, section] of outline.sections.entries()) {
        if (cancelled.current) return;
        setCurrent(section.heading);
        const { markdown: sectionMarkdown } = await sectionFn({
          data: {
            docType,
            brief: editedBrief,
            title: outline.title,
            outlineHeadings,
            heading: section.heading,
            sectionBrief: section.brief,
            targetWords: section.targetWords,
            previousSummary,
          },
        });
        assembled += `${sectionMarkdown.trim()}\n\n`;
        previousSummary = `${previousSummary}\n- ${section.heading}: ${sectionMarkdown
          .replace(/[#*|>-]/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 320)}`.slice(-4000);
        setMarkdown(assembled);
        setDoneCount(index + 1);
      }

      setCurrent("");
      setPhase("done");

      const { data: session } = await supabase.auth.getUser();
      if (session.user) {
        const { error: saveError } = await supabase.from("documents").insert({
          user_id: session.user.id,
          thread_id: threadId,
          title: outline.title,
          doc_type: docType,
          content: assembled,
        });
        if (saveError) console.error("[documents] save failed", saveError);
      }
      toast.success("Document complete — download it below.");
    } catch (caught) {
      console.error("[builder] failed", caught);
      setError(caught instanceof Error ? caught.message : "Document generation failed");
      setPhase("error");
    }
  };

  const downloadDocx = async () => {
    const blob = await markdownToDocxBlob({ title, subtitle, markdown, branding });
    downloadBlob(blob, `${safeFilename(title)}.docx`);
  };

  const downloadPdf = () => {
    const blob = markdownToPdfBlob({ title, subtitle, markdown, branding });
    downloadBlob(blob, `${safeFilename(title)}.pdf`);
  };

  const progress = headings.length ? Math.round((doneCount / headings.length) * 100) : 0;
  const running = phase === "outline" || phase === "writing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">Build full document</DialogTitle>
          <DialogDescription>
            Black R AI writes the complete document section by section — typically 50–60 pages — then
            gives you Word and PDF downloads.
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" || phase === "error" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Document type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="business_plan">Business plan</SelectItem>
                  <SelectItem value="feasibility_study">Feasibility study</SelectItem>
                </SelectContent>
              </Select>
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
                      toast.error(caught instanceof Error ? caught.message : "Could not read image");
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => logoInput.current?.click()}>
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
                    : phase === "done"
                      ? "Document complete"
                      : `Writing section ${doneCount + 1} of ${headings.length}`}
                </span>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={phase === "outline" ? 4 : progress} />
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
                  {wordCount.toLocaleString()} words · approx. {estimatedPages} pages ·{" "}
                  {doneCount}/{headings.length} sections
                </p>
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
