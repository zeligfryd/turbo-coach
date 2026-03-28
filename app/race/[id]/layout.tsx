import { ProtectedAppShell } from "@/components/layouts/protected-app-shell";

export default function RaceLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedAppShell>{children}</ProtectedAppShell>;
}
