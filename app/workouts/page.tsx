import { redirect } from "next/navigation";

export default function WorkoutsPage() {
  // Redirect to presets by default
  redirect("/workouts/presets");
}
