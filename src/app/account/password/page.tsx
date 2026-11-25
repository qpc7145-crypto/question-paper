import { redirect } from "next/navigation";

export default function OldChangePasswordPage() {
  redirect("/account/settings");
}
