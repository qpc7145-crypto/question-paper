import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { pageSession } from "@/lib/auth/page";

export default async function AccountSettingsPage() {
  const s = await pageSession();
  if (s.role === "CONTROLLER") redirect("/controller/settings");
  return (
    <>
      <PageHeader title="Settings" />
      <ChangePasswordForm />
    </>
  );
}
