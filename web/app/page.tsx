"use client";
import { useMemo, useState } from "react";
import {
  COLLECTIONS, Cell, Competitor, FieldDefinition, Market, SourceDocument, Verdict, cellId, type MarketId,
} from "@cc/shared";
import CellPopover from "@/components/CellPopover";
import Overview, { type Sel } from "@/components/Overview";
import SettingsPanel from "@/components/SettingsPanel";
import SignIn from "@/components/SignIn";
import Sources from "@/components/Sources";
import ThemeToggle from "@/components/ThemeToggle";
import { AuthProvider, useAuth } from "@/lib/auth";
import { fmtDate, useById, useCollection } from "@/lib/data";

type Tab = "overview" | "battlecards" | "marketing" | "sources" | "review" | "settings";
const TABS: [Tab, string, boolean][] = [
  ["overview", "Overview", true], ["battlecards", "Battlecards", false], ["marketing", "Marketing", false],
  ["sources", "Sources & inputs", true], ["review", "Review", false], ["settings", "Settings", true],
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
  const [market, setMarket] = useState<MarketId>("GLOBAL");
  const [selected, setSelected] = useState<Sel | null>(null);

  const fields = useCollection(COLLECTIONS.fields, FieldDefinition);
  const competitors = useCollection(COLLECTIONS.competitors, Competitor);
  const markets = useCollection(COLLECTIONS.markets, Market);
  const cells = useCollection(COLLECTIONS.cells, Cell);
  const verdicts = useCollection(COLLECTIONS.verdicts, Verdict);
  const documents = useCollection(COLLECTIONS.documents, SourceDocument);
  const docMap = useById(documents.docs);
  const compMap = useById(competitors.docs);
  const fieldMap = useById(fields.docs);

  const rivals = competitors.docs.filter((c) => !c.isSelf && c.status === "active").map((c) => c.name);
  const title = rivals.length ? `Nofence vs ${rivals.length <= 2 ? rivals.join(" and ") : `${rivals.slice(0, -1).join(", ")} and ${rivals.at(-1)}`}` : "Nofence vs the field";
  const lastUpdate = useMemo(() => cells.docs.reduce((m, c) => (c.updatedAt > m ? c.updatedAt : m), ""), [cells.docs]);
  const sortedMarkets = [...markets.docs].sort((a, b) => a.order - b.order);
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
          <div className="kicker">Competitor comparison</div>
          <h2 style={{ margin: "4px 0" }}>{title}</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            {lastUpdate ? `Updated ${fmtDate(lastUpdate)}` : "No data yet"} · {documents.docs.length} source{documents.docs.length === 1 ? "" : "s"} · Click any cell to see where it comes from
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {sortedMarkets.length > 0 && (
            <div className="seg" role="radiogroup" aria-label="Market" style={{ fontSize: 12 }}>
              {sortedMarkets.map((m) => (
                <label key={m.id} className="seg-opt"><input type="radio" name="market" value={m.id} checked={market === m.id} onChange={() => setMarket(m.id)} /><span>{m.id === "GLOBAL" ? "All" : m.id.replace("_", "/")}</span></label>
              ))}
            </div>
          )}
          <ThemeToggle />
          <span className="muted" style={{ fontSize: 12 }}>{user?.email} · {role}</span>
          <button className="btn btn-secondary" type="button" onClick={signOut} style={{ fontSize: 12 }}>Sign out</button>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map(([id, label, on]) => (
          <button key={id} className="tab" role="tab" aria-selected={tab === id} disabled={!on} title={on ? undefined : "Coming in a later phase"} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      <main className="ws-main">
        {anyError && <p className="bad" style={{ fontSize: 13 }}>{anyError}</p>}
        {tab === "overview" && (
          fields.loading || cells.loading ? <p className="muted">Loading…</p> :
          <Overview fields={fields.docs} competitors={competitors.docs} cells={cells.docs} verdicts={verdicts.docs} market={market} selected={selected} onSelect={setSelected} />
        )}
        {tab === "sources" && <Sources documents={documents.docs} competitors={competitors.docs} />}
        {tab === "settings" && <SettingsPanel fields={fields.docs} competitors={competitors.docs} />}
      </main>

      {sel && <CellPopover {...sel} documents={docMap} onClose={() => setSelected(null)} />}
    </div>
  );
}
