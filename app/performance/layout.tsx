import { ProtectedAppShell } from "@/components/layouts/protected-app-shell";

export default async function PerformanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedAppShell
      contentClassName="flex-1 p-4 sm:p-6 min-h-0"
      contentInnerClassName="max-w-5xl mx-auto h-full flex flex-col min-h-0"
    >
      {children}
    </ProtectedAppShell>
  );
}
