import { Suspense } from "react";
import LoginView from "./LoginView";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginView />
    </Suspense>
  );
}
