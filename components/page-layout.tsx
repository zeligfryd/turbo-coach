import { NavBar } from "./nav-bar";
import { ThemeSwitcher } from "./theme-switcher";

interface PageLayoutProps {
  children: React.ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <NavBar />
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5 w-full">{children}</div>
        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}
