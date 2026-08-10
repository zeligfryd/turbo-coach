import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { RoutinesClient } from "@/components/training/routines-client";

export default function RoutinesPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/training"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Training
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Routines</h1>
        <p className="text-sm text-muted-foreground">
          Build and manage the routines you rotate through.
        </p>
      </div>
      <RoutinesClient />
    </div>
  );
}
