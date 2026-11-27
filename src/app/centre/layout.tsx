import { AppShell } from "@/components/AppShell";
import { pageSession } from "@/server/auth/page";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await pageSession("SUPERINTENDENT");
  return <AppShell role="SUPERINTENDENT" name={s.name}>{children}</AppShell>;
}
