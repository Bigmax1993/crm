import React from "react";
import { cn } from "@/lib/utils";

/** Kompaktowe logo — fiolet (primary) + akcent zielony boisk. */
export function MizarSportLogo({ className, size = "md" }) {
  const h = size === "sm" ? 28 : size === "lg" ? 40 : 32;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 32"
      height={h}
      className={cn("shrink-0 text-primary", className)}
      aria-hidden
    >
      <rect width="120" height="32" rx="6" className="fill-primary/15" />
      <text
        x="58"
        y="21"
        textAnchor="middle"
        className="fill-primary"
        style={{ fontSize: 13, fontFamily: "system-ui,Segoe UI,sans-serif", fontWeight: 700 }}
      >
        MIZAR
      </text>
      <circle cx="102" cy="16" r="5" fill="hsl(124 54% 38%)" />
    </svg>
  );
}
