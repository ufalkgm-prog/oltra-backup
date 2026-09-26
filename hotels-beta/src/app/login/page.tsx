import { Suspense } from "react";
import PageShell from "@/components/site/PageShell";
import LandingBackground from "@/components/site/LandingBackground";
import LoginView from "./LoginView";

/* The landing page's slideshow and site header, not a plain page of its own
   (Ulrik, 2026-09-26): the login panel sits over the same photos. */
export default function LoginPage() {
  return (
    <PageShell current="" disableBackground>
      <LandingBackground />
      <Suspense fallback={null}>
        <LoginView />
      </Suspense>
    </PageShell>
  );
}
