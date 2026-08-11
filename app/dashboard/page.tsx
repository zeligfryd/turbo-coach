import { redirect } from "next/navigation";

/**
 * /dashboard was a second home screen showing six coverage areas, all reading
 * "never". Today does the job; this keeps existing links working.
 */
export default function DashboardPage() {
  redirect("/today");
}
