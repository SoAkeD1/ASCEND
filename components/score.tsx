"use client";

import { useEffect, useState } from "react";
import { illustrativeBand } from "@/lib/engine/score";

/** Auto-advancing story built from this cycle's real numbers (passed in as ready sentences). */
export function ScoreStory({ slides }: { slides: { kicker: string; big: string; line: string }[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setI((i + 1) % slides.length), 6000);
    return () => clearTimeout(t);
  }, [i, slides.length]);
  const s = slides[i];
  return (
    <section aria-label="Score story" className="relative overflow-hidden rounded-hero bg-ink p-5 text-white">
      <div className="flex gap-1">
        {slides.map((_, k) => (
          <span key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            {k < i && <span className="block h-1 w-full bg-white" />}
            {k === i && <span key={i} className="block h-1 animate-asc-story bg-white" />}
          </span>
        ))}
      </div>
      <button type="button" className="mt-5 block w-full text-left" onClick={() => setI((i + 1) % slides.length)} aria-label="Next story">
        <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#9BE0C9]">{s.kicker}</p>
        <p key={i} className="mt-2 animate-asc-in text-[34px] font-[780] leading-tight tracking-[-0.03em] num">
          {s.big}
        </p>
        <p className="mt-2 min-h-[44px] text-[14px] leading-relaxed text-white/75">{s.line}</p>
      </button>
    </section>
  );
}

export function ScoreSimulator({ firstScoreCycle, nudgePct, startOnTime, startUtil }: { firstScoreCycle: number; nudgePct: number; startOnTime: number; startUtil: number }) {
  const max = firstScoreCycle * 2;
  const [onTime, setOnTime] = useState(Math.min(startOnTime, max));
  const [late, setLate] = useState(0);
  const [util, setUtil] = useState(startUtil);
  const band = illustrativeBand({ onTimeCycles: onTime, lateCycles: late, utilisationPct: util }, { first_score_cycle: firstScoreCycle, utilisation_nudge_pct: nudgePct });
  const color = band === "Strong" ? "text-teal" : band === "Good" ? "text-teal-soft" : band === "Fair" ? "text-amber" : "text-muted";
  const Slider = ({ id, label, value, set, min, maxV, suffix }: { id: string; label: string; value: number; set: (n: number) => void; min: number; maxV: number; suffix: string }) => (
    <div>
      <div className="flex justify-between text-[13px]">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        <span className="num">
          {value}
          {suffix}
        </span>
      </div>
      <input id={id} type="range" min={min} max={maxV} value={value} onChange={(e) => set(Number(e.target.value))} className="w-full accent-[#0F5C4D]" />
    </div>
  );
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-[650]">What if…</h3>
        <span className="rounded-full bg-[#F1F3EF] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Illustrative</span>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <Slider id="sim-on" label="On-time cycles" value={onTime} set={setOnTime} min={0} maxV={max} suffix="" />
        <Slider id="sim-late" label="Late cycles" value={late} set={setLate} min={0} maxV={firstScoreCycle} suffix="" />
        <Slider id="sim-util" label="Usage of limit" value={util} set={setUtil} min={0} maxV={100} suffix="%" />
      </div>
      <p className="mt-3 text-[13px] text-muted">Projected band</p>
      <p className={`text-[26px] font-[780] ${color}`}>{band}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Not a real score. Bureaus use their own models; this shows the direction of the two habits that matter most: paying on time and keeping usage under {nudgePct}%.
      </p>
    </section>
  );
}
