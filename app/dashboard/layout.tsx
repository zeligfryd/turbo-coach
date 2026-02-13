import { ProtectedAppShell } from "@/components/layouts/protected-app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedAppShell>{children}</ProtectedAppShell>;
}
