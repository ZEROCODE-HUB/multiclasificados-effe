import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  variant?: "dark" | "light";
  size?: "sm" | "md" | "lg" | "xl";
  asLink?: boolean;
  className?: string;
}

const sizes = {
  sm: { kicker: "text-[8px] tracking-[0.32em]", brand: "text-base" },
  md: { kicker: "text-[9px] tracking-[0.32em]", brand: "text-xl md:text-2xl" },
  lg: { kicker: "text-[11px] tracking-[0.34em]", brand: "text-3xl md:text-4xl" },
  xl: { kicker: "text-xs md:text-sm tracking-[0.42em]", brand: "text-5xl md:text-6xl" },
};

export function BrandMark({ variant = "dark", size = "md", asLink = true, className }: BrandMarkProps) {
  const s = sizes[size];
  const kickerColor = variant === "dark" ? "text-secondary" : "text-secondary";
  const brandColor = variant === "dark" ? "text-primary" : "text-primary-foreground";

  const inner = (
    <span className={cn("inline-flex flex-col leading-none", className)}>
      <span className={cn("font-bold uppercase", s.kicker, kickerColor)}>
        Multiclasificados
      </span>
      <span className={cn("font-extrabold tracking-tight uppercase mt-0.5", s.brand, brandColor)}>
        EFFE
      </span>
    </span>
  );

  if (asLink) {
    return <Link to="/" className="inline-flex items-center shrink-0">{inner}</Link>;
  }
  return inner;
}
