import { AppShell } from "@/components/AppShell";
import { pageSession } from "@/server/auth/page";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await pageSession("SETTER");
  return <AppShell role="SETTER" name={s.name} locked={!s.pc}>{children}</AppShell>;
}
