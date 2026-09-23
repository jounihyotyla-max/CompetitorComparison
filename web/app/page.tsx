"use client";
import { useMemo, useState } from "react";
import {
  COLLECTIONS, Cell, Competitor, FieldDefinition, Market, Review as ReviewT, SourceDocument, Verdict, cellId,
} from "@cc/shared";
import CellPopover from "@/components/CellPopover";
import Overview, { type Sel } from "@/components/Overview";
import Review from "@/components/Review";
import SettingsPanel from "@/components/SettingsPanel";
import SignIn from "@/components/SignIn";
import Sources from "@/components/Sources";
import { AuthProvider, useAuth } from "@/lib/auth";
import { fmtDate, useById, useCollection } from "@/lib/data";

type Tab = "overview" | "battlecards" | "marketing" | "sources" | "review" | "settings";
const TABS: [Tab, string, boolean][] = [
  ["overview", "Overview", true], ["battlecards", "Battlecards", false], ["marketing", "Marketing", false],
  ["sources", "Sources & inputs", true], ["review", "Review", true], ["settings", "Settings", true],
];

export default function Page() {
  return <AuthProvider><Gate /></AuthProvider>;
}

function Gate() {
  const { user, loading, ready } = useAuth();
  if (loading || (user && !ready)) return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}><span className="muted">Loading…</span></main>;
  if (!user) return <SignIn />;
  return <Workspace />;
}

function Workspace() {
  const { user, role, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [group, setGroup] = useState<string>("All");
  const [selected, setSelected] = useState<Sel | null>(null);

  const fields = useCollection(COLLECTIONS.fields, FieldDefinition);
  const competitors = useCollection(COLLECTIONS.competitors, Competitor);
  const markets = useCollection(COLLECTIONS.markets, Market);
  const cells = useCollection(COLLECTIONS.cells, Cell);
  const verdicts = useCollection(COLLECTIONS.verdicts, Verdict);
  const documents = useCollection(COLLECTIONS.documents, SourceDocument);
  const reviews = useCollection(COLLECTIONS.reviews, ReviewT);
  const openReviews = reviews.docs.filter((r) => r.status === "open").length;
  const docMap = useById(documents.docs);
  const compMap = useById(competitors.docs);
  const fieldMap = useById(fields.docs);

  const rivals = competitors.docs.filter((c) => !c.isSelf && c.status === "active").map((c) => c.name);
  const lastUpdate = useMemo(() => cells.docs.reduce((m, c) => (c.updatedAt > m ? c.updatedAt : m), ""), [cells.docs]);
  // Switcher groups come from the markets registry: "All", then each distinct Market.group in order.
  const groups = useMemo(() => {
    const seen = new Set<string>(["All"]);
    for (const m of [...markets.docs].sort((a, b) => a.order - b.order)) if (m.id !== "GLOBAL" && m.group) seen.add(m.group);
    return [...seen];
  }, [markets.docs]);
  const anyError = [fields, competitors, cells, verdicts, documents].map((x) => x.error).find(Boolean);

  const sel = selected && compMap.get(selected.competitorId) && fieldMap.get(selected.fieldId)
    ? { competitor: compMap.get(selected.competitorId)!, field: fieldMap.get(selected.fieldId)!, marketId: selected.marketId,
        cell: cells.docs.find((c) => c.id === cellId(selected.competitorId, selected.fieldId, selected.marketId)),
        verdict: verdicts.docs.find((v) => v.id === cellId(selected.competitorId, selected.fieldId, selected.marketId)) }
    : null;

  return (
    <div className="ws">
      <header className="title-block">
        <div>
          <div className="kicker">Nofence · internal</div>
          <h2>Nofence competitor analytics</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {rivals.length ? `${rivals.length} competitor${rivals.length === 1 ? "" : "s"}: ${rivals.join(", ")}` : "No competitors yet"} · {lastUpdate ? `updated ${fmtDate(lastUpdate)}` : "no data yet"} · {documents.docs.length} source{documents.docs.length === 1 ? "" : "s"} · click any cell to see where it comes from
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {groups.length > 1 && (
            <div className="seg" role="radiogroup" aria-label="Market">
              {groups.map((g) => (
                <label key={g} className="seg-opt"><input type="radio" name="market" value={g} checked={group === g} onChange={() => setGroup(g)} /><span>{g}</span></label>
              ))}
            </div>
          )}
          <span className="muted" style={{ fontSize: 12 }}>{user?.email} · {role}</span>
          <button className="btn" type="button" onClick={signOut} style={{ fontSize: 13, padding: "6px 10px" }}>Sign out</button>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map(([id, label, on]) => (
          <button key={id} className="tab" role="tab" aria-selected={tab === id} disabled={!on} title={on ? undefined : "Coming in a later phase"} onClick={() => setTab(id)}>{label}{id === "review" && openReviews > 0 && <span className="count">{openReviews}</span>}</button>
        ))}
      </nav>

      <main className="ws-main">
        {anyError && <p className="bad" style={{ fontSize: 13 }}>{anyError}</p>}
        {tab === "overview" && (
          fields.loading || cells.loading ? <p className="muted">Loading…</p> :
          <Overview fields={fields.docs} competitors={competitors.docs} markets={markets.docs} cells={cells.docs} verdicts={verdicts.docs} group={group} selected={selected} onSelect={setSelected} />
        )}
        {tab === "review" && <Review reviews={reviews.docs} competitors={competitors.docs} fields={fields.docs} documents={docMap} />}
        {tab === "sources" && <Sources documents={documents.docs} competitors={competitors.docs} markets={markets.docs} />}
        {tab === "settings" && <SettingsPanel fields={fields.docs} competitors={competitors.docs} documents={documents.docs} />}
      </main>

      {sel && <CellPopover {...sel} documents={docMap} onClose={() => setSelected(null)} />}
    </div>
  );
}
