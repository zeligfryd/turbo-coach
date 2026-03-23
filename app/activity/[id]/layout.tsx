import { ProtectedAppShell } from "@/components/layouts/protected-app-shell";

export default async function ActivityLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedAppShell
      contentClassName="flex-1 p-4 sm:p-6 min-h-0 overflow-auto"
      contentInnerClassName="max-w-6xl mx-auto"
    >
      {children}
    </ProtectedAppShell>
  );
}
