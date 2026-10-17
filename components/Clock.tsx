"use client";

import { useEffect, useState } from "react";

const R = 9;
const LEN = 2 * Math.PI * R;

/**
 * The clock as a sticker: a ring that drains on one CSS animation (no React
 * work per frame) and a number that ticks a few times a second. The last ten
 * seconds turn red and breathe.
 *
 * A negative animation-delay starts the ring where the phase actually is, so a
 * page reloaded mid-round does not show a full ring next to a 12s countdown.
 */
export function Clock({ deadline, total }: { deadline: number | null; total: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline == null) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [deadline]);

  const left = deadline == null ? total : Math.max(0, Math.ceil((deadline - now) / 1000));
  const urgent = deadline != null && left <= 10;
  const elapsed = Math.max(0, Math.min(total, total - left));

  return (
    <span className={`pill gap-2 pl-2 pr-3.5 ${urgent ? "clock-urgent" : ""}`} role="timer" aria-label={`还剩 ${left} 秒`} style={{ cursor: "default" }}>
      <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden>
        <circle cx="12" cy="12" r={R} fill="none" stroke="var(--ink-4)" strokeWidth="3.4" />
        <circle
          key={deadline ?? "idle"}
          cx="12"
          cy="12"
          r={R}
          fill="none"
          stroke={urgent ? "#F2442E" : "var(--ink)"}
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeDasharray={LEN}
          className="clock-ring"
          style={
            {
              "--len": LEN,
              animationDuration: `${total}s`,
              animationDelay: `-${elapsed}s`,
              transition: "stroke 0.3s",
            } as React.CSSProperties
          }
        />
      </svg>
      <span className={`tx-num min-w-[3ch] text-[1.0625rem] font-bold ${urgent ? "text-bad" : ""}`}>{left}s</span>
    </span>
  );
}
