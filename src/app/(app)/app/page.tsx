import { redirect } from "next/navigation";

// /app is the old address. Savings is the first page now.
export default function AppPage() {
  redirect("/savings");
}
