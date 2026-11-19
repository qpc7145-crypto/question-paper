import { AppShell } from "@/components/AppShell";
import { pageSession } from "@/lib/auth/page";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await pageSession();
  return <AppShell role={s.role} name={s.name} locked={s.role === "SETTER" && !s.pc}>{children}</AppShell>;
}
