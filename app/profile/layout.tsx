import { ProtectedAppShell } from "@/components/layouts/protected-app-shell";

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedAppShell>{children}</ProtectedAppShell>;
}
