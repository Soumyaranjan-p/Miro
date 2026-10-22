export type PageId =
  | "home"
  | "statistics"
  | "incident"
  | "normal"
  | "settings"
  | "island-general"
  | "island-shortcuts";

type PlaceholderId = Exclude<PageId, "home">;

const COPY: Record<PlaceholderId, { title: string; body: string; bullets: string[] }> = {
  statistics: {
    title: "Statistics",
    body: "How the fox is helping you speak with keys.",
    bullets: ["Words dictated", "Words per minute", "Longest streak"],
  },
  incident: {
    title: "Incident mode",
    body: "On-call notes, transcribed quietly in the background.",
    bullets: ["Keep local audio", "Never paste on error", "Silent retry"],
  },
  normal: {
    title: "Normal mode",
    body: "The everyday mode: hold the shortcut, speak, release.",
    bullets: ["Hold Right Ctrl", "Paste at the caret", "Local whisper"],
  },
  settings: {
    title: "Settings",
    body: "The whole box of dials - being rebuilt in this style.",
    bullets: ["Microphone", "Model", "Cleanup rules"],
  },
  "island-general": {
    title: "Island · General",
    body: "The notch pill pinned to the top of your screen.",
    bullets: ["Show the island", "Position: top-centre", "Hide when idle"],
  },
  "island-shortcuts": {
    title: "Island · Shortcuts",
    body: "What triggers what, at a glance.",
    bullets: ["Dictation: hold Right Ctrl", "Cancel: Esc", "Island reveal: hover"],
  },
};

const MOCK_ROWS: Array<{ when: string; detail: string }> = [
  { when: "Today, 09:41", detail: "Model · small.en · English" },
  { when: "Yesterday, 18:02", detail: "Model · small.en · English" },
  { when: "2 days ago, 10:13", detail: "Model · base.en · English" },
];

export function PlaceholderPage({ id }: { id: PlaceholderId }) {
  const copy = COPY[id];
  return (
    <div className="miro-page">
      <header className="miro-page__head">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
      </header>

      <section className="miro-card">
        <ul className="miro-list">
          {copy.bullets.map((bullet) => (
            <li key={bullet} className="miro-list__row">
              <span>{bullet}</span>
              <span className="miro-list__muted">mock</span>
            </li>
          ))}
        </ul>
      </section>

      {id === "statistics" ? (
        <section className="miro-card">
          <StatRow values={MOCK_STATS} />
        </section>
      ) : null}

      {id === "island-shortcuts" ? (
        <section className="miro-card">
          <ul className="miro-list">
            {MOCK_ROWS.map((row) => (
              <li key={row.when} className="miro-list__row">
                <span>{row.when}</span>
                <span className="miro-list__muted">{row.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const MOCK_STATS: Array<{ value: string; label: string }> = [
  { value: "128", label: "words dictated" },
  { value: "34", label: "words/min" },
  { value: "5", label: "days in a row" },
];

function StatRow({ values }: { values: Array<{ value: string; label: string }> }) {
  return (
    <div className="miro-stats">
      {values.map((item) => (
        <div key={item.label} className="miro-stats__item">
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
