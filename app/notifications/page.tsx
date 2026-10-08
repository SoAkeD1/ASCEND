import { and, eq, isNull } from "drizzle-orm";
import { AppPage } from "@/components/AppPage";
import { loadApp, asUser } from "@/lib/page";
import { listNotifications } from "@/lib/services/account";
import { notifications } from "@/lib/db/schema";
import { notificationCopy } from "@/lib/copy";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** In-app notices. They go to the user only; nothing is ever sent to anyone else. */
export default async function NotificationsPage() {
  const { st, userId } = await loadApp();
  const { data: list } = await asUser(async (tx) => {
    const rows = await listNotifications(tx, userId);
    await tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return rows;
  });
  return (
    <AppPage st={st} title="Reminders" back="/home">
      {list.length === 0 ? (
        <p className="card p-4 text-[14px] text-muted">Nothing yet. Reminders about your bills appear here, and only you see them.</p>
      ) : (
        <ul className="card divide-y divide-line px-4">
          {list.map((n) => (
            <li key={n.id} className="py-3">
              <p className={`text-[14px] ${n.readAt ? "" : "font-[650]"}`}>{notificationCopy(n.template, n.payload as Record<string, unknown>, st.c)}</p>
              <p className="text-[12px] text-muted">{shortDate(n.sentOn)}</p>
            </li>
          ))}
        </ul>
      )}
    </AppPage>
  );
}
