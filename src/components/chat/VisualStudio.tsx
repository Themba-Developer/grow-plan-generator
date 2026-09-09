import { useEffect, useState } from "react";
import { Download, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createVisual } from "@/lib/docgen.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type GeneratedVisual = {
  title: string;
  kind: "concept" | "diagram" | "layout" | "chart";
  dataUrl: string;
  revisedPrompt?: string;
  model?: string;
  placementHeading?: string;
};

const PRESETS = {
  concept: "Create a premium photorealistic concept image for this business or project:",
  diagram: "Create a clean, publication-ready process or system diagram with minimal labels for:",
  layout:
    "Create a conceptual architectural site or floor layout, clearly marked not for construction, for:",
  chart: "Create a polished editorial infographic or data visualisation for:",
} as const;

export function VisualStudio({
  open,
  onOpenChange,
  context,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: string;
  onCreated?: (visual: GeneratedVisual) => void;
}) {
  const visualFn = useServerFn(createVisual);
  const [kind, setKind] = useState<GeneratedVisual["kind"]>("concept");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [visual, setVisual] = useState<GeneratedVisual | null>(null);

  useEffect(() => {
    if (!open || prompt) return;
    setPrompt(`${PRESETS[kind]}\n\n${context?.slice(0, 1800) || ""}`.trim());
  }, [open, context, kind, prompt]);

  const generate = async () => {
    if (prompt.trim().length < 10) return;
    setBusy(true);
    try {
      const result = await visualFn({
        data: { title: `${kind[0]?.toUpperCase()}${kind.slice(1)} visual`, prompt, kind },
      });
      const next: GeneratedVisual = result;
      setVisual(next);
      onCreated?.(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Visual generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <ImageIcon className="size-5 text-primary" />
            Create visual
          </DialogTitle>
          <DialogDescription>
            Create document-ready concepts, diagrams, layouts and infographics.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Visual type</Label>
            <Select
              value={kind}
              onValueChange={(value) => {
                const next = value as GeneratedVisual["kind"];
                setKind(next);
                setPrompt(`${PRESETS[next]}\n\n${context?.slice(0, 1800) || ""}`.trim());
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concept">Photorealistic concept</SelectItem>
                <SelectItem value="diagram">Process / system diagram</SelectItem>
                <SelectItem value="layout">Conceptual building / site layout</SelectItem>
                <SelectItem value="chart">Infographic / chart</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="visual-prompt">Creative brief</Label>
            <Textarea
              id="visual-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={7}
              placeholder="Describe the subject, viewpoint, materials, style, labels and intended use..."
            />
          </div>

          {kind === "layout" && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-xs leading-relaxed text-muted-foreground">
              Conceptual planning aid only. It is not a construction drawing, structural design or
              permit document. A licensed local architect/engineer must verify dimensions, loads,
              codes and safety.
            </div>
          )}

          <Button
            className="w-full gap-2"
            onClick={() => void generate()}
            disabled={busy || prompt.trim().length < 10}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy ? "Creating..." : "Generate visual"}
          </Button>

          {visual && (
            <div className="overflow-hidden rounded-2xl border border-border bg-muted/30">
              <img src={visual.dataUrl} alt={visual.title} className="w-full object-contain" />
              <div className="flex items-center justify-between gap-3 p-3">
                <div>
                  <p className="text-sm font-medium">{visual.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Ready to download or use in a document
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    const link = document.createElement("a");
                    link.href = visual.dataUrl;
                    link.download = `black-r-${visual.kind}-visual.png`;
                    link.click();
                  }}
                >
                  <Download className="size-4" /> Download
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
