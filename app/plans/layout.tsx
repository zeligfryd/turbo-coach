import { ProtectedAppShell } from "@/components/layouts/protected-app-shell";

export default async function PlansLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedAppShell>{children}</ProtectedAppShell>;
}
