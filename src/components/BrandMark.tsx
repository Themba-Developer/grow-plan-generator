import logo from "@/assets/black-r-logo.png";
import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  showWordmark = true,
  invert = false,
}: {
  className?: string;
  showWordmark?: boolean;
  invert?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          invert ? "bg-sidebar-accent" : "bg-brand-black",
        )}
      >
        <img src={logo} alt="Black R AI" className="size-6 object-contain" />
      </span>
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              "font-display text-sm font-bold tracking-tight",
              invert ? "text-sidebar-foreground" : "text-foreground",
            )}
          >
            Black R <span className="text-primary">AI</span>
          </span>
          <span
            className={cn(
              "mt-0.5 text-[10px] uppercase tracking-[0.14em]",
              invert ? "text-sidebar-foreground/55" : "text-muted-foreground",
            )}
          >
            Business Plans
          </span>
        </span>
      )}
    </div>
  );
}
