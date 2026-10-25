import { AdminConsole } from "@/features/admin/AdminConsole";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  // for whoever runs the collection: nothing here is for a search engine to find
  robots: { index: false, follow: false },
};

/** The console where the collection is launched and looked after. It needs the chain and nothing else. */
export default function AdminPage() {
  return <AdminConsole />;
}
