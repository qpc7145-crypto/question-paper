"use client";
import { useEffect, useState } from "react";

// Live countdown. `offsetMs` corrects for client clock skew using the server's time.
export function useNow(offsetMs: number, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offsetMs), intervalMs);
    return () => clearInterval(t);
  }, [offsetMs, intervalMs]);
  return now;
}

export function formatRemaining(ms: number) {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d > 0 ? `${d}d ` : ""}${pad(h)}:${pad(m)}:${pad(sec)}`;
}
