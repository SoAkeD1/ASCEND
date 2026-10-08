import Link from "next/link";
import { AppPage } from "@/components/AppPage";
import { FamilyControls } from "@/components/family";
import { Icon } from "@/components/Icon";
import { loadApp, asUser } from "@/lib/page";
import { listFamilyLinks } from "@/lib/services/family";
import { siteOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const { st, userId } = await loadApp();
  const { data: links } = await asUser((tx) => listFamilyLinks(tx, userId));
  const origin = siteOrigin();
  return (
    <AppPage st={st} title="Family View" back="/home">
      <div>
        <h2 className="h-title">Show your progress, not your spending</h2>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">Share a read-only link with a parent or guardian. You choose; you can turn it off any time.</p>
      </div>
      <section className="grid grid-cols-2 gap-2.5 text-[13px]">
        <div className="card p-3.5">
          <p className="font-[650] text-teal">They see</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {["Your first name", "On-time status", "Your streak", "Ladder progress", "Score journey stage"].map((x) => (
              <li key={x} className="flex items-center gap-1.5">
                <Icon name="check" size={14} className="text-teal" />
                {x}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-3.5">
          <p className="font-[650] text-amber">They never see</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {["What you bought", "Where you spent", "Amounts spent", "Amounts owed", "Your limit"].map((x) => (
              <li key={x} className="flex items-center gap-1.5">
                <Icon name="x" size={14} className="text-amber" />
                {x}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <FamilyControls
        origin={origin}
        links={links.map((l) => ({ ...l, createdAt: l.createdAt.toISOString(), revokedAt: l.revokedAt?.toISOString() ?? null, lastViewedAt: l.lastViewedAt?.toISOString() ?? null }))}
      />
      <section className="card flex items-center gap-3 p-4">
        <Icon name="family" className="text-teal" />
        <p className="flex-1 text-[13px]">Parents worried about debt or shady apps? Send them our plain-language explainer, in English and Hindi.</p>
        <a
          className="btn-secondary min-h-[40px] px-3 text-[13px]"
          target="_blank"
          rel="noopener noreferrer"
          href={`https://wa.me/?text=${encodeURIComponent(`What is Ascend? A simple explainer for parents: ${origin}/parents`)}`}
        >
          WhatsApp
        </a>
      </section>
      <Link href="/parents" className="btn-link self-center">
        Open the parent explainer
      </Link>
    </AppPage>
  );
}
