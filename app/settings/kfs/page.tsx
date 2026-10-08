import { and, desc, eq, isNotNull } from "drizzle-orm";
import { AppPage } from "@/components/AppPage";
import { KfsView } from "@/components/KfsView";
import { loadApp, asUser } from "@/lib/page";
import { kfsDocuments } from "@/lib/db/schema";
import type { Kfs } from "@/lib/engine/kfs";

export const dynamic = "force-dynamic";

/** The exact KFS the user accepted, from its stored snapshot. Later config edits don't change it. */
export default async function MyKfsPage() {
  const { st, userId } = await loadApp();
  const { data: doc } = await asUser(async (tx) => {
    const [d] = await tx
      .select()
      .from(kfsDocuments)
      .where(and(eq(kfsDocuments.userId, userId), isNotNull(kfsDocuments.acceptedAt)))
      .orderBy(desc(kfsDocuments.version))
      .limit(1);
    return d ?? null;
  });
  return (
    <AppPage st={st} title="Your KFS" back="/settings">
      <section className="card p-4">{doc ? <KfsView kfs={doc.jsonSnapshot as Kfs} /> : <p>No accepted KFS found.</p>}</section>
    </AppPage>
  );
}
