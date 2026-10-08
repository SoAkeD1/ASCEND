import { StaffShell } from "@/components/StaffShell";
import { CohortTools, ConfigEditor, CreateTestUser, UserTools } from "@/components/admin";
import { requireStaffSession, actorOf } from "@/lib/auth/current";
import { withActor } from "@/lib/db/actor";
import { listConfig, listUsers, recentAudit } from "@/lib/services/admin";
import { demoMode } from "@/lib/clock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Ascend" };

export default async function AdminPage() {
  const s = await requireStaffSession(["admin"]);
  const { config, users, audit } = await withActor(actorOf(s), async (tx) => ({
    config: await listConfig(tx),
    users: await listUsers(tx),
    audit: await recentAudit(tx, 40),
  }));
  const demo = demoMode();
  const cohorts = [...new Set(users.map((u) => u.cohort))].sort().reverse();
  return (
    <StaffShell title="Admin" role="admin">
      {demo ? (
        <p className="rounded-[12px] bg-amber-soft px-4 py-3 text-[13px] text-amber-deep">
          <strong>Demo mode is on.</strong> These tools drive the real pipeline. They are hidden when DEMO_MODE is not &quot;true&quot;.
        </p>
      ) : (
        <p className="rounded-[12px] bg-[#F1F3EF] px-4 py-3 text-[13px] text-muted">Demo tools are off (DEMO_MODE is not &quot;true&quot;).</p>
      )}
      {demo && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CreateTestUser />
          <CohortTools cohorts={cohorts} />
        </div>
      )}
      <UserTools users={users} demo={demo} />
      <ConfigEditor rows={config.map((r) => ({ key: r.key, value: r.value, version: r.version, updatedAt: r.updatedAt.toISOString(), updatedBy: r.updatedBy }))} />
      <section className="card overflow-x-auto p-5">
        <h2 className="text-[16px] font-[700]">Audit log (latest 40)</h2>
        <table className="mt-3 w-full min-w-[720px] text-left text-[12px]">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="py-1.5">When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id} className="border-b border-line align-top">
                <td className="py-1.5 whitespace-nowrap">{a.at.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className="font-mono">{a.actor.slice(0, 18)}</td>
                <td className="font-semibold">{a.action}</td>
                <td className="font-mono">{a.entity.slice(0, 28)}</td>
                <td className="max-w-[360px] break-all font-mono text-muted">{JSON.stringify(a.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </StaffShell>
  );
}
