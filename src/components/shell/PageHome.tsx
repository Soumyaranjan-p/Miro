import { useState } from "react";
import { IconCheck, IconMagnifier } from "./Icons";

const HISTORY_MOCK: Array<{ when: string; text: string }> = [
  { when: "09:41", text: "Standup notes: shipped the island, inflamming the tray..." },
  { when: "08:17", text: "Dear Ms. Palley, thank you for the quick turnaround on..." },
  { when: "Yesterday", text: "Salt, butter, flour and two eggs for the pancake batter" },
];

export function PageHome({
  userName,
  modeOn,
  onModeChange,
}: {
  userName: string;
  modeOn: boolean;
  onModeChange: (next: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const rows = HISTORY_MOCK.filter((row) =>
    row.text.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="miro-page">
      {/* hero */}
      <section className="miro-card miro-hero">
        <h1>Hello {userName || "friend"}</h1>
        <p>Hold Right Ctrl anywhere, speak, let go: it&apos;s pasted.</p>
        <button type="button" className="miro-button">
          <span className="miro-button__dot" />
          Open chat
        </button>
      </section>

      {/* modes */}
      <section className="miro-card">
        <h2 className="miro-card__title">Pick your mode</h2>
        <div className="miro-mode">
          <div>
            <strong>Turn on dictation</strong>
            <p>Hold Right Ctrl in any app, speak, let go: words paste where you type.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={modeOn}
            className={`miro-toggle${modeOn ? " is-on" : ""}`}
            onClick={() => onModeChange(!modeOn)}
          >
            <span />
          </button>
        </div>
        <div className="miro-mode">
          <div>
            <strong>Incident mode</strong>
            <p>Quieter retries and tighter privacy keeps for on-call work.</p>
          </div>
          <button type="button" className="miro-button miro-button--solid">
            Activate
          </button>
        </div>
      </section>

      {/* history + stats */}
      <section className="miro-grid">
        <div className="miro-grid__history">
          <div className="miro-grid__head">
            <span className="miro-grid__label">History</span>
            <label className="miro-search">
              <IconMagnifier />
              <input
                type="search"
                placeholder="Search dictations"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="miro-card miro-history">
            {rows.length > 0 ? (
              rows.map((row) => (
                <div key={row.text} className="miro-history__row">
                  <span className="miro-history__when">{row.when}</span>
                  <span>{row.text}</span>
                </div>
              ))
            ) : (
              <p className="miro-history__empty">
                Your dictations will show here. Hold Right Ctrl in any app and speak.
              </p>
            )}
          </div>
        </div>

        <div className="miro-card miro-stats">
          <div className="miro-stats__item">
            <strong>128</strong>
            <span>words dictated</span>
          </div>
          <div className="miro-stats__item">
            <strong>34</strong>
            <span>words/min</span>
          </div>
          <div className="miro-stats__item">
            <strong>5</strong>
            <span>days in a row</span>
          </div>
          <div className="miro-stats__foot">
            <IconCheck />
            Unlimited and free
          </div>
        </div>
      </section>
    </div>
  );
}
