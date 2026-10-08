import { AppPage } from "@/components/AppPage";
import { ScoreSimulator, ScoreStory } from "@/components/score";
import { loadApp, asUser } from "@/lib/page";
import { lineTransactions } from "@/lib/services/line";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ScorePage() {
  const { st, userId } = await loadApp();
  const { data: txns } = await asUser((tx) => lineTransactions(tx, userId));
  const { c, journey } = st;
  const cycleTx = st.open ? txns.filter((t) => t.cycleId === st.open!.id) : [];
  const spent = cycleTx.reduce((s, t) => s + t.amount, 0);
  const lateCycles = st.cycles.filter((x) => x.status === "settled" && x.onTime === false).length;

  const slides = [
    {
      kicker: `Cycle ${st.open?.n ?? st.settledCount} so far`,
      big: inr(spent),
      line: cycleTx.length ? `Across ${cycleTx.length} payment${cycleTx.length === 1 ? "" : "s"}. Every one of them builds your record once the bill is paid on time.` : "Nothing spent yet this cycle. Even one small spend, repaid on time, counts.",
    },
    {
      kicker: "Usage",
      big: `${st.util.pct}%`,
      line: st.util.pct <= c.utilisation_nudge_pct ? `Under the ${c.utilisation_nudge_pct}% line. That reads as in control.` : `Above the ${c.utilisation_nudge_pct}% line. Paying early brings it down, free.`,
    },
    {
      kicker: "Streak",
      big: `${st.streak} on time`,
      line: st.ladderNext ? `${st.ladderNext.remaining} more on-time cycle${st.ladderNext.remaining === 1 ? "" : "s"} to your next ladder step.` : "You've reached the top of the ladder.",
    },
    {
      kicker: "First score",
      big: journey.stage === "first_score" ? "Ready" : `${journey.cyclesToFirstScore} to go`,
      line: journey.stage === "first_score" ? "You have enough history for bureaus to score you." : `Bureaus usually need about ${c.first_score_cycle} cycles of history.`,
    },
  ];

  return (
    <AppPage st={st} title="Credit score">
      <ScoreStory slides={slides} />
      <section className="card p-4">
        <h3 className="text-[15px] font-[650]">Your journey to a first score</h3>
        <p className="mt-1 text-[13px] text-muted">
          {journey.stage === "first_score" ? `You've closed ${journey.closedCycles} cycles.` : `First score expected after cycle ${c.first_score_cycle}. ${journey.closedCycles} done.`}
        </p>
        <ol className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${journey.timeline.length}, minmax(0, 1fr))` }}>
          {journey.timeline.map((t) => (
            <li key={t.cycle} className="flex flex-col items-center gap-1">
              <span
                className={`flex h-8 w-full items-center justify-center rounded-[8px] text-[12px] font-bold ${
                  !t.done ? "border border-dashed border-line text-muted" : t.onTime ? "bg-teal text-white" : "bg-amber text-white"
                }`}
              >
                {t.cycle}
              </span>
              {t.cycle === c.first_score_cycle && <span className="text-[10px] font-bold text-teal">Score</span>}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[12px] text-muted">Green = paid on time · amber = late · dashed = still to come</p>
      </section>
      <ScoreSimulator firstScoreCycle={c.first_score_cycle} nudgePct={c.utilisation_nudge_pct} startOnTime={st.onTimeCount} startUtil={st.util.pct} />
      {lateCycles > 0 && <p className="text-center text-[12px] text-muted">{lateCycles} late cycle{lateCycles === 1 ? "" : "s"} on record. On-time cycles from here still count fully.</p>}
    </AppPage>
  );
}
