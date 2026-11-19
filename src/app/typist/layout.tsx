import { AppShell } from "@/components/AppShell";
import { pageSession } from "@/lib/auth/page";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await pageSession("TYPIST");
  return <AppShell role="TYPIST" name={s.name}>{children}</AppShell>;
}
