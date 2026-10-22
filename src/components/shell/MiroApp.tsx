import { useEffect, useState, type ReactNode } from "react";
import { ipc } from "../../lib/ipc";
import { FoxMascot } from "./FoxMascot";
import { PageHome } from "./PageHome";
import { PlaceholderPage, type PageId } from "./PlaceholderPage";
import {
  IconGear,
  IconHome,
  IconIncident,
  IconKeyboard,
  IconNormal,
  IconStats,
  IconSun,
} from "./Icons";

const MIRO_SECTIONS: Array<{ id: PageId; label: string; icon: ReactNode }> = [
  { id: "home", label: "Home", icon: <IconHome /> },
  { id: "statistics", label: "Statistics", icon: <IconStats /> },
  { id: "incident", label: "Incident mode", icon: <IconIncident /> },
  { id: "normal", label: "Normal mode", icon: <IconNormal /> },
  { id: "settings", label: "Settings", icon: <IconGear /> },
];

const ISLAND_SECTIONS: Array<{ id: PageId; label: string; icon: ReactNode }> = [
  { id: "island-general", label: "General", icon: <IconSun /> },
  { id: "island-shortcuts", label: "Shortcuts", icon: <IconKeyboard /> },
];

function Sidebar({
  page,
  onNavigate,
  normalMode,
}: {
  page: PageId;
  onNavigate: (next: PageId) => void;
  normalMode: boolean;
}) {
  return (
    <aside className="miro-sidebar">
      <div className="miro-sidebar__brand">
        <FoxMascot size={34} />
        <span>Miro</span>
      </div>

      <SectionLabel>Flow</SectionLabel>
      <nav className="miro-sidebar__group">
        {MIRO_SECTIONS.map((item) => (
          <SidebarItem key={item.id} active={item.id === page} onClick={() => onNavigate(item.id)}>
            {item.icon}
            <span>{item.label}</span>
          </SidebarItem>
        ))}
      </nav>

      <SectionLabel>Island</SectionLabel>
      <nav className="miro-sidebar__group">
        {ISLAND_SECTIONS.map((item) => (
          <SidebarItem key={item.id} active={item.id === page} onClick={() => onNavigate(item.id)}>
            {item.icon}
            <span>{item.label}</span>
          </SidebarItem>
        ))}
      </nav>

      <div className="miro-sidebar__status" role="status">
        <span className="miro-sidebar__dot" />
        {normalMode ? "Normal mode is on" : "Normal mode is off"}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="miro-sidebar__label">{children}</div>;
}

function SidebarItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`miro-sidebar__item${active ? " is-active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MiroApp() {
  const [page, setPage] = useState<PageId>("home");
  const [modeOn, setModeOn] = useState(true);
  const [userName, setUserName] = useState("");

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

  return (
    <div className="miro-shell">
      <Sidebar page={page} onNavigate={setPage} normalMode={modeOn} />
      <main className="miro-main">
        {page === "home" ? (
          <PageHome userName={userName} modeOn={modeOn} onModeChange={setModeOn} />
        ) : (
          <PlaceholderPage id={page} />
        )}
      </main>
    </div>
  );
}
