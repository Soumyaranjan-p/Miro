import { useEffect, useState, type ReactNode } from "react";
import { ipc } from "../../lib/ipc";
import { useReducedMotion, useRuntimeStatus, useSettings } from "../../lib/hooks";
import { LiveFox, type FoxState } from "./LiveFox";
import { PageHome } from "./PageHome";
import { PageShortcuts } from "./PageShortcuts";
import { PageSettings } from "./PageSettings";
import { PageStatistics } from "./PageStatistics";
import { IconGear, IconHome, IconKeyboard, IconStats } from "./Icons";

export type PageId = "home" | "statistics" | "shortcuts" | "settings";

const PAGES: Array<{ id: PageId; label: string; icon: ReactNode }> = [
  { id: "home", label: "Home", icon: <IconHome /> },
  { id: "statistics", label: "Statistics", icon: <IconStats /> },
  { id: "shortcuts", label: "Shortcuts", icon: <IconKeyboard /> },
  { id: "settings", label: "Settings", icon: <IconGear /> },
];

function Sidebar({
  page,
  onNavigate,
  incidentActive,
  onToggleMode,
}: {
  page: PageId;
  onNavigate: (next: PageId) => void;
  incidentActive: boolean;
  onToggleMode: () => void;
}) {
  return (
    <aside className="msh-sidebar">
      <div className="msh-sidebar__brand">
        <SidebarFox />
        <span className="msh-sidebar__brand-name">Miro</span>
      </div>

      <nav className="msh-sidebar__group" aria-label="Sections">
        {PAGES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`msh-sidebar__item${item.id === page ? " is-active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <button
        type="button"
        className={`msh-modepill${incidentActive ? " is-incident" : ""}`}
        onClick={onToggleMode}
        title={incidentActive ? "Back to Normal mode" : "Switch to Incident mode"}
      >
        <span className="msh-modepill__dot" aria-hidden />
        <span>{incidentActive ? "Incident mode" : "Normal mode"}</span>
        <span className="msh-modepill__hint">{incidentActive ? "on" : "on"}</span>
      </button>
    </aside>
  );
}

/**
 * The sidebar avatar mirrors the engine, not the page: incident mode shows on
 * every page so the state is never missed.
 */
function SidebarFox(): ReactNode {
  const { settings } = useSettings();
  const { status } = useRuntimeStatus(8_000);
  const incident = settings?.homeMode === "intent";
  const state: FoxState = incident ? "incident" : status?.engine.state === "failed" ? "error" : "normal";
  return <LiveFox size={34} state={state} reducedMotion label="Miro the fox" />;
}

function greeting(userName: string): string {
  const hour = new Date().getHours();
  const partOfDay =
    hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const tagline = "ready when you are";
  return userName ? `${partOfDay}, ${userName} — ${tagline}` : `${partOfDay} — ${tagline}`;
}

export function MiroApp() {
  const [page, setPage] = useState<PageId>("home");
  const [userName, setUserName] = useState("");
  const { settings } = useSettings();
  const reducedMotion = useReducedMotion();
  const incidentActive = settings?.homeMode === "intent";

  useEffect(() => {
    let cancelled = false;
    void ipc
      .getUserName()
      .then((name) => {
        if (!cancelled) setUserName(name);
      })
      .catch(() => {
        if (!cancelled) setUserName("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleMode = () => {
    void ipc.switchMode(incidentActive ? "home" : "intent").catch(() => undefined);
  };

  return (
    <div className="msh-app" data-motion={reducedMotion ? "reduced" : "full"}>
      <Sidebar page={page} onNavigate={setPage} incidentActive={incidentActive} onToggleMode={toggleMode} />
      <main className="msh-main">
        {page === "home" ? (
          <PageHome greeting={greeting(userName)} onNavigateToStatistics={() => setPage("statistics")} />
        ) : page === "statistics" ? (
          <PageStatistics />
        ) : page === "shortcuts" ? (
          <PageShortcuts />
        ) : (
          <PageSettings />
        )}
      </main>
    </div>
  );
}
