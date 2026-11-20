"use client";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle } from "lucide-react";

type Opts = { title?: string; confirmLabel?: string; danger?: boolean };

// In-app replacement for window.confirm: `if (!(await confirmAction("Send?"))) return;`
export function confirmAction(message: string, opts: Opts = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (v: boolean) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(<Dialog message={message} {...opts} onDone={done} />);
  });
}

function Dialog({ message, title = "Please confirm", confirmLabel = "Confirm", danger, onDone }: Opts & { message: string; onDone: (v: boolean) => void }) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ok.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onDone(false);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onDone(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" className="card w-full max-w-md p-6 shadow-xl">
        <div className="flex gap-3">
          <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${danger ? "text-red-600" : "text-amber-600"}`} />
          <div>
            <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
            <p id="confirm-body" className="mt-1 text-sm text-muted">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => onDone(false)}>Cancel</button>
          <button ref={ok} className={danger ? "btn-primary bg-red-600 hover:bg-red-700" : "btn-primary"} onClick={() => onDone(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
