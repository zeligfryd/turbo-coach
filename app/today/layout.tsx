import { ProtectedAppShell } from "@/components/layouts/protected-app-shell";

export default async function TodayLayout({ children }: { children: React.ReactNode }) {
  // The only mobile-first surface in the app: logging happens on a phone,
  // planning does not.
  return (
    <ProtectedAppShell contentInnerClassName="max-w-lg mx-auto">{children}</ProtectedAppShell>
  );
}
