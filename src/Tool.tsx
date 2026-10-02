// Tendshift: a shared care rota for family looking after a parent: medicines given, visits covered, appointments and costs.
import { useState } from "react";
import { moneyFmt } from "./lib/money";
import { shareLink, openLater, waLink } from "./lib/share";
import { uid, useStored } from "./lib/store";
import { useShared } from "./lib/useShared";
import { addDays, prettyDate, todayISO } from "./lib/time";
import { Section, Stat, Stats } from "./ui/kit";

const T = "tendshift";
type Med = { id: string; name: string; dose: string; times: string[] };
type Given = { med: string; time: string; date: string; by: string; at: string };
type Visit = { date: string; who: string };
type Appt = { id: string; date: string; time: string; what: string; who: string };
type Cost = { id: string; date: string; what: string; amount: number; paidBy: string };
type Care = { parent: string; family: string[]; meds: Med[]; given: Given[]; visits: Visit[]; appts: Appt[]; costs: Cost[]; notes: { date: string; by: string; text: string }[] };

const SAMPLE: Care = {
  parent: "Mum", family: ["Sami", "Leila", "Karim"],
  meds: [{ id: "m1", name: "Metformin", dose: "500 mg", times: ["08:00", "20:00"] }, { id: "m2", name: "Amlodipine", dose: "5 mg", times: ["08:00"] }, { id: "m3", name: "Vitamin D", dose: "1 tablet", times: ["13:00"] }],
  given: [{ med: "m1", time: "08:00", date: todayISO(), by: "Leila", at: "08:10" }, { med: "m2", time: "08:00", date: todayISO(), by: "Leila", at: "08:10" }],
  visits: [0, 1, 2, 3, 4, 5, 6].map(i => ({ date: addDays(todayISO(), i), who: ["Leila", "Sami", "Leila", "Karim", "", "Sami", "Karim"][i] })),
  appts: [{ id: "a1", date: addDays(todayISO(), 3), time: "10:30", what: "Cardiologist, Dr. Ben Amor", who: "Sami" }],
  costs: [{ id: "c1", date: addDays(todayISO(), -5), what: "Pharmacy", amount: 86, paidBy: "Leila" }, { id: "c2", date: addDays(todayISO(), -2), what: "Home nurse visit", amount: 60, paidBy: "Sami" }],
  notes: [{ date: todayISO(), by: "Leila", text: "Ate well at lunch. A bit dizzy after standing up, mention it to the cardiologist." }],
};

export default function Tendshift() {
  const shared = useShared<Care>();
  const [care, setCare] = useStored<Care>(T, "care", SAMPLE);
  const [me, setMe] = useStored(T, "me", "Leila");
  const [cur, setCur] = useStored(T, "cur", "TND");
  const [note, setNote] = useState("");
  const [na, setNa] = useState({ date: todayISO(), time: "10:00", what: "", who: "" });
  const [nc, setNc] = useState({ what: "", amount: "" });
  const [nm, setNm] = useState({ name: "", dose: "", times: "08:00" });
  const [merged, setMerged] = useState("");
  const money = moneyFmt(cur);

  if (shared.loading) return <p className="empty-note">Opening the care rota…</p>;
  if (shared.data) {
    const incoming = shared.data;
    return (
      <div className="panel stack" style={{ gap: 12 }}>
        <h2>Care update for {incoming.parent}</h2>
        <p>This link has the latest medicines given, visits, notes and costs from your family.</p>
        {merged ? <p className="pill good">{merged}</p> : <button className="btn primary" style={{ alignSelf: "flex-start" }} onClick={() => {
          // Merge: keep everything from both sides, newest wins for visits.
          const key = (g: Given) => g.med + g.date + g.time;
          setCare({ ...incoming, given: [...new Map([...care.given, ...incoming.given].map(g => [key(g), g])).values()], costs: [...new Map([...care.costs, ...incoming.costs].map(c => [c.id, c])).values()], appts: [...new Map([...care.appts, ...incoming.appts].map(a => [a.id, a])).values()], notes: [...new Map([...care.notes, ...incoming.notes].map(n => [n.date + n.by + n.text, n])).values()].sort((a, b) => b.date.localeCompare(a.date)) });
          setMerged("Added to your rota. Open Tendshift to see it."); history.replaceState(null, "", "/t/tendshift");
        }}>Add this update to my rota</button>}
        {merged && <a className="btn" href="/t/tendshift" style={{ alignSelf: "flex-start" }}>Open my rota</a>}
      </div>
    );
  }

  const today = todayISO();
  const doses = care.meds.flatMap(m => m.times.map(t => ({ m, t }))).sort((a, b) => a.t.localeCompare(b.t));
  const given = (medId: string, time: string) => care.given.find(g => g.med === medId && g.time === time && g.date === today);
  const nowHM = new Date().toTimeString().slice(0, 5);
  const missed = doses.filter(d => d.t < nowHM && !given(d.m.id, d.t));
  const set = (p: Partial<Care>) => setCare({ ...care, ...p });
  const week = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const visitOf = (d: string) => care.visits.find(v => v.date === d)?.who ?? "";
  const gaps = week.filter(d => !visitOf(d));
  const spent = care.family.map(f => ({ f, paid: care.costs.filter(c => c.paidBy === f).reduce((a, c) => a + c.amount, 0), visits: care.visits.filter(v => v.who === f && v.date <= today && v.date >= addDays(today, -30)).length }));
  const totalCost = spent.reduce((a, s) => a + s.paid, 0), fair = totalCost / Math.max(1, care.family.length);
  const summary = () => `${care.parent} today (${prettyDate(today)}):\n` + doses.map(d => `${given(d.m.id, d.t) ? "✓" : "○"} ${d.t} ${d.m.name} ${d.m.dose}${given(d.m.id, d.t) ? ` (${given(d.m.id, d.t)!.by})` : ""}`).join("\n") + (care.notes[0]?.date === today ? `\nNote: ${care.notes[0].text}` : "") + (gaps.length ? `\nNobody is down to visit on: ${gaps.slice(0, 4).map(prettyDate).join(", ")}` : "");

  return (
    <div className="stack">
      <Section title={`Caring for ${care.parent}`} aside={<button className="btn small primary" onClick={() => openLater(async () => waLink(`${summary()}\n\nFull update: ${await shareLink(T, care, "m=sync")}`))}>Send update to family</button>}>
        <Stats><Stat value={`${doses.filter(d => given(d.m.id, d.t)).length}/${doses.length}`} label="Doses given today" /><Stat value={missed.length} label="Missed so far" tone={missed.length ? "bad" : "good"} /><Stat value={gaps.length} label="Days without a visitor (2 weeks)" tone={gaps.length ? "warn" : "good"} /><Stat value={money(totalCost)} label="Shared costs" /></Stats>
        <div className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "0 0 160px" }}><span>I am</span><select id="ts-me" className="input" value={me} onChange={e => setMe(e.target.value)}>{care.family.map(f => <option key={f}>{f}</option>)}</select></label>
          <label className="field" style={{ flex: "0 0 160px" }}><span>Caring for</span><input id="ts-parent" className="input" value={care.parent} onChange={e => set({ parent: e.target.value })} /></label>
          <label className="field"><span>Family, separated by commas</span><input id="ts-fam" className="input" value={care.family.join(", ")} onChange={e => set({ family: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} /></label>
        </div>
      </Section>

      <div className="grid2">
        <Section title="Medicines today">
          <div className="stack" style={{ gap: 6 }}>
            {doses.map(({ m, t }) => { const g = given(m.id, t); const late = !g && t < nowHM; return (
              <div key={m.id + t} className="ts-dose" style={{ borderLeftColor: g ? "var(--good)" : late ? "var(--bad)" : "var(--line)" }}>
                <span className="num ts-time">{t}</span><div style={{ flex: 1 }}><strong>{m.name}</strong> <span className="note">{m.dose}</span>{g && <p className="note">Given by {g.by} at {g.at}</p>}</div>
                {g ? <button className="btn ghost small" onClick={() => set({ given: care.given.filter(x => x !== g) })}>Undo</button> : <button className="btn small primary" onClick={() => set({ given: [...care.given, { med: m.id, time: t, date: today, by: me, at: new Date().toTimeString().slice(0, 5) }] })}>Given</button>}
              </div>); })}
          </div>
          <details style={{ marginTop: 12 }}><summary className="note" style={{ cursor: "pointer" }}>Edit medicines</summary>
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              {care.meds.map(m => <div key={m.id} className="row"><span style={{ flex: 1 }}>{m.name} {m.dose} at {m.times.join(", ")}</span><button className="btn ghost small danger" onClick={() => set({ meds: care.meds.filter(x => x.id !== m.id) })}>Remove</button></div>)}
              <form className="row" onSubmit={e => { e.preventDefault(); if (!nm.name.trim()) return; set({ meds: [...care.meds, { id: uid(), name: nm.name.trim(), dose: nm.dose, times: nm.times.split(",").map(x => x.trim()).filter(Boolean) }] }); setNm({ name: "", dose: "", times: "08:00" }); }}>
                <input className="input" style={{ flex: 2 }} aria-label="Medicine" placeholder="Medicine" value={nm.name} onChange={e => setNm({ ...nm, name: e.target.value })} /><input className="input" style={{ flex: 1 }} aria-label="Dose" placeholder="Dose" value={nm.dose} onChange={e => setNm({ ...nm, dose: e.target.value })} /><input className="input" style={{ flex: 1 }} aria-label="Times" placeholder="08:00, 20:00" value={nm.times} onChange={e => setNm({ ...nm, times: e.target.value })} /><button className="btn small" type="submit">Add</button>
              </form>
            </div>
          </details>
        </Section>
        <Section title="Who visits when">
          <div className="ts-cal">{week.map(d => { const w = visitOf(d); return (
            <label key={d} className="ts-day" style={{ background: w ? "var(--sunk)" : "color-mix(in srgb, var(--warn) 18%, transparent)" }}>
              <span>{prettyDate(d)}</span>
              <select aria-label={`Visitor on ${d}`} value={w} onChange={e => set({ visits: [...care.visits.filter(v => v.date !== d), { date: d, who: e.target.value }] })}><option value="">Nobody yet</option>{care.family.map(f => <option key={f}>{f}</option>)}</select>
            </label>); })}</div>
        </Section>
      </div>

      <div className="grid2">
        <Section title="Appointments">
          {care.appts.filter(a => a.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map(a => <div key={a.id} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)", alignItems: "center" }}><span style={{ flex: 1 }}><strong>{prettyDate(a.date)} {a.time}</strong> {a.what}</span><span className="pill">{a.who || "Who takes her?"}</span><button className="btn ghost small danger" onClick={() => set({ appts: care.appts.filter(x => x.id !== a.id) })}>×</button></div>)}
          <form className="row" style={{ marginTop: 10, alignItems: "flex-end" }} onSubmit={e => { e.preventDefault(); if (!na.what.trim()) return; set({ appts: [...care.appts, { id: uid(), ...na }] }); setNa({ ...na, what: "" }); }}>
            <input type="date" className="input" style={{ flex: 1 }} aria-label="Date" value={na.date} onChange={e => setNa({ ...na, date: e.target.value })} /><input type="time" className="input" style={{ flex: 1 }} aria-label="Time" value={na.time} onChange={e => setNa({ ...na, time: e.target.value })} />
            <input className="input" style={{ flex: 2 }} aria-label="What" placeholder="Doctor or test" value={na.what} onChange={e => setNa({ ...na, what: e.target.value })} />
            <select className="input" style={{ flex: 1 }} aria-label="Who goes" value={na.who} onChange={e => setNa({ ...na, who: e.target.value })}><option value="">Who goes</option>{care.family.map(f => <option key={f}>{f}</option>)}</select><button className="btn small" type="submit">Add</button>
          </form>
        </Section>
        <Section title="Shared costs">
          <table className="t"><tbody>{spent.map(s => <tr key={s.f}><td>{s.f}</td><td className="r">{money(s.paid)}</td><td className="r" style={{ color: s.paid - fair < -0.5 ? "var(--bad)" : "var(--good)" }}>{s.paid - fair >= 0 ? "+" : ""}{money(s.paid - fair)}</td><td className="r note">{s.visits} visits this month</td></tr>)}</tbody></table>
          <form className="row" style={{ marginTop: 10 }} onSubmit={e => { e.preventDefault(); const a = parseFloat(nc.amount); if (!a) return; set({ costs: [...care.costs, { id: uid(), date: today, what: nc.what || "Expense", amount: a, paidBy: me }] }); setNc({ what: "", amount: "" }); }}>
            <input className="input" style={{ flex: 2 }} aria-label="What" placeholder="Pharmacy, taxi…" value={nc.what} onChange={e => setNc({ ...nc, what: e.target.value })} /><input className="input num" style={{ flex: 1 }} aria-label="Amount" placeholder="Amount" value={nc.amount} onChange={e => setNc({ ...nc, amount: e.target.value })} /><button className="btn small" type="submit">I paid this</button>
          </form>
          <label className="field" style={{ marginTop: 8, maxWidth: 120 }}><span>Currency</span><input className="input" value={cur} onChange={e => setCur(e.target.value.toUpperCase().slice(0, 3))} /></label>
        </Section>
      </div>
      <Section title="Notes">
        <form className="row" onSubmit={e => { e.preventDefault(); if (!note.trim()) return; set({ notes: [{ date: today, by: me, text: note.trim() }, ...care.notes] }); setNote(""); }}>
          <input id="ts-note" className="input" style={{ flex: 1 }} aria-label="Note" placeholder="How was she today?" value={note} onChange={e => setNote(e.target.value)} /><button className="btn small" type="submit">Add note</button>
        </form>
        <div className="stack" style={{ gap: 6, marginTop: 10 }}>{care.notes.slice(0, 20).map((n, i) => <p key={i}><span className="note">{prettyDate(n.date)} · {n.by}</span><br />{n.text}</p>)}</div>
      </Section>
      <style>{`.ts-dose{display:flex;gap:12px;align-items:center;padding:8px 0 8px 10px;border-left:4px solid;border-bottom:1px solid var(--line)}.ts-time{font-family:var(--mono);font-size:15px;min-width:48px}
      .ts-cal{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px}.ts-day{display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:8px;font-size:13px}.ts-day select{border:1px solid var(--line);background:var(--surface);border-radius:6px;padding:4px;font-size:13px}`}</style>
    </div>
  );
}
