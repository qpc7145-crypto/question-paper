import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { DisplayNameForm } from "@/components/DisplayNameForm";
import { pageSession } from "@/server/auth/page";

export default async function AccountSettingsPage() {
  const s = await pageSession();
  if (s.role === "CONTROLLER") redirect("/controller/settings");
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <DisplayNameForm />
        <ChangePasswordForm />
      </div>
    </>
  );
}
