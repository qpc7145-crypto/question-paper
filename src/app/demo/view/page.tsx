"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { renderPaperDocument } from "@/lib/render-paper";

// Design preview only: paper previews, centre downloads and model papers are rendered here,
// in the browser, from the same sample data the rest of the preview uses. The in-browser
// demo backend applies the real routes' checks (role, ownership, status, unlock time) first.
function View() {
  const src = useSearchParams().get("src") ?? "";
  const [state, setState] = useState<{ html?: string; error?: string }>({});

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "1") return setState({ error: "Not found" });
    (async () => {
      try {
        const { demoViewPaper, demoInstitution } = await import("@/lib/demo/api");
        const { paper: p, banner, watermark } = await demoViewPaper(src);
        const fileNote = p.format === "FILE" ? "Design preview — this paper was uploaded as a file; the full system serves the file itself." : "Design preview — sample paper";
        setState({
          html: renderPaperDocument(
            { ...p, subject: { ...p.subject, examDate: new Date(p.subject.examDate) } },
            { institution: demoInstitution(), watermark, banner: banner ? `${banner} · ${fileNote}` : fileNote },
          ),
        });
      } catch (e) {
        setState({ error: (e as Error).message });
      }
    })();
  }, [src]);

  if (state.html) return <iframe title="Paper" srcDoc={state.html} className="fixed inset-0 h-full w-full border-0" />;
  return (
    <div className="grid min-h-screen place-items-center bg-[#F8FAFC] p-4">
      <div className="card max-w-md p-7">
        {state.error ? (
          <>
            <h1 className="mb-2 text-lg font-semibold">This paper can’t be opened</h1>
            <p className="mb-4 text-sm text-muted">{state.error}</p>
            <a className="text-sm font-medium text-[#1D4ED8]" href="/">← Back to your dashboard</a>
          </>
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </div>
    </div>
  );
}

export default function DemoViewPage() {
  return (
    <Suspense>
      <View />
    </Suspense>
  );
}
