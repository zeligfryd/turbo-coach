import { ProtectedAppShell } from "@/components/layouts/protected-app-shell";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedAppShell
      contentClassName="flex-1 p-0"
      contentInnerClassName="max-w-none h-full"
      showFloatingCoach={false}
    >
      {children}
    </ProtectedAppShell>
  );
}
