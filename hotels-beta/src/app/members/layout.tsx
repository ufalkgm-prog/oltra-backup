import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import PageShell from "@/components/site/PageShell";
import { MembersDataProvider } from "@/lib/members/MembersDataProvider";
import { createClient } from "@/lib/supabase/server";
import "./members.css";

export default async function MembersLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/members");
  }

  return (
    <PageShell current="members">
      <MembersDataProvider>{children}</MembersDataProvider>
    </PageShell>
  );
}