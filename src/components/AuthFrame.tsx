import { ShieldCheck } from "lucide-react";

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="flex flex-col justify-between bg-[#0F172A] px-6 py-8 text-white lg:w-[42%] lg:px-12 lg:py-12">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-7 w-7 text-[#60A5FA]" />
          <span className="text-base font-semibold">Question Paper Bank</span>
        </div>
        <div className="hidden lg:block">
          <h2 className="text-3xl font-semibold leading-tight">Confidential examination papers, from setter to centre.</h2>
          <p className="mt-4 max-w-md text-sm text-slate-300">
            Role-isolated access, time-locked centre downloads and a tamper-evident audit trail — under the authority of the Controller of Examinations.
          </p>
        </div>
        <p className="hidden text-xs text-slate-500 lg:block">All activity on this system is logged.</p>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
