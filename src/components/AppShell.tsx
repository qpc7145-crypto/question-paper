"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, BookOpen, Building2, FileText, FolderOpen, GraduationCap, LayoutDashboard, LogOut,
  Menu, Settings, ShieldCheck, UserCircle, Users, X,
} from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/constants";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const NAV: Record<Role, NavItem[]> = {
  CONTROLLER: [
    { href: "/controller", label: "Dashboard", icon: LayoutDashboard },
    { href: "/controller/papers", label: "Papers", icon: FileText },
    { href: "/controller/subjects", label: "Subjects & Assignment", icon: GraduationCap },
    { href: "/controller/users", label: "Accounts", icon: Users },
    { href: "/controller/centres", label: "Centres", icon: Building2 },
    { href: "/controller/resources", label: "Syllabus & Models", icon: FolderOpen },
    { href: "/controller/reports", label: "Reports", icon: BarChart3 },
    { href: "/controller/settings", label: "Settings", icon: Settings },
  ],
  SETTER: [
    { href: "/setter", label: "My Papers", icon: FileText },
    { href: "/setter/resources", label: "Syllabus & Model Papers", icon: BookOpen },
    { href: "/setter/biodata", label: "Bio-Data", icon: UserCircle },
  ],
  TYPIST: [{ href: "/typist", label: "Assigned Papers", icon: FileText }],
  SUPERINTENDENT: [
    { href: "/centre", label: "Exam Papers", icon: FileText },
    { href: "/centre/profile", label: "Centre & Bio-Data", icon: UserCircle },
  ],
};

export function AppShell({ role, name, children, locked = false }: { role: Role; name: string; children: React.ReactNode; locked?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const home = NAV[role][0].href;
  // Controllers change their password on /controller/settings; other roles get a personal Settings page.
  const items = role === "CONTROLLER" ? NAV[role] : [...NAV[role], { href: "/account/settings", label: "Settings", icon: Settings }];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Main">
      {items.map((it) => {
        const active = it.href === home ? pathname === home : pathname.startsWith(it.href);
        const disabled = locked && it.href !== "/setter/biodata";
        const Icon = it.icon;
        return disabled ? (
          <span key={it.href} className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-500" title="Complete your bio-data first">
            <Icon className="h-4 w-4" /> {it.label}
          </span>
        ) : (
          <Link
            key={it.href}
            href={it.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150 ${active ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
          >
            <Icon className="h-4 w-4" /> {it.label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-[#0F172A]">
      <div className="flex items-center gap-2.5 border-b border-white/10 px-5 py-4">
        <ShieldCheck className="h-6 w-6 text-[#60A5FA]" aria-hidden />
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Question Paper Bank</p>
          <p className="text-[11px] text-slate-400">Examination Management</p>
        </div>
      </div>
      {nav}
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-medium text-white">{name}</p>
        <p className="truncate text-xs text-slate-400">{ROLE_LABEL[role]}</p>
        <button onClick={logout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all duration-150 hover:bg-white/10">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
          <button className="absolute left-[16.5rem] top-3 rounded-md bg-white p-1.5" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-[#0F172A] px-4 py-3 text-white lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded p-1 hover:bg-white/10">
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold">Question Paper Bank</span>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
