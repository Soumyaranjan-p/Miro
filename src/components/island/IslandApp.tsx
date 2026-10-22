import { FoxMascot } from "../shell/FoxMascot";
import "./island.css";

const PILLS: Array<{ tone: "green" | "orange" | "purple" | "red" }> = [
  { tone: "green" },
  { tone: "orange" },
  { tone: "purple" },
  { tone: "red" },
];

/** The notch island: fox in a wizard hat on the left, a 2x2 pill grid right. */
export function IslandApp() {
  return (
    <main className="miro-island" aria-label="Miro island">
      <FoxMascot size={40} variant="wizard" />
      <div className="miro-island__pills" role="presentation">
        {PILLS.map((pill) => (
          <span key={pill.tone} className={`miro-island__pill miro-island__pill--${pill.tone}`} />
        ))}
      </div>
    </main>
  );
}
