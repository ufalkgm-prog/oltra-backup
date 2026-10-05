import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { safeNext } from "@/lib/members/safeNext";
import PageShell from "@/components/site/PageShell";
import { MembersDataProvider } from "@/lib/members/MembersDataProvider";
import { createClient } from "@/lib/supabase/server";
import "./members.css";

export const metadata: Metadata = {
  title: "Members",
  description: "Your myOLTRA member area.",
};

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
    // Back to the members page that was asked for (set by middleware.ts).
    const path = safeNext((await headers()).get("x-oltra-members-path"));
    redirect(`/login?next=${encodeURIComponent(path)}`);
  }

  return (
    <PageShell current="members">
      <MembersDataProvider>{children}</MembersDataProvider>
    </PageShell>
  );
}
