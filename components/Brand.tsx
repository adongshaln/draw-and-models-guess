import Link from "next/link";
import { GLYPH_PATH } from "@/lib/creatures";

/**
 * The mark: a scribble loop that runs out to a finish dot, the same glyph the
 * other game uses, with the red dot standing in for the pencil.
 */
export function BrandGlyph({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <path d={GLYPH_PATH} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="13.5" r="4.2" fill="#F2442E" />
      <circle cx="25" cy="13.5" r="1.6" fill="#16130f" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" aria-label="Draw & Models Guess" className={`group flex shrink-0 items-center gap-1.5 rounded-xl text-ink ${className}`}>
      <BrandGlyph className="size-8 transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-rotate-12" />
      <span className="text-[1.25rem] leading-none font-extrabold tracking-[-0.04em] [font-variation-settings:'opsz'_48,'wdth'_85]">
        draw &amp; models guess
      </span>
    </Link>
  );
}
