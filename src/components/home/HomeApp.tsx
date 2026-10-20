import { useEffect, useState } from "react";
import { useSettings } from "../../lib/hooks";
import { MascotHome } from "./MascotHome";
import { SettingsApp } from "../settings/SettingsApp";
import { IconBackArrow } from "../icons";
import "./home.css";

/**
 * The home window: the mascot stage, with the existing settings app one
 * gear click behind it. Nothing here changes how dictation itself works.
 */
export function HomeApp() {
  const { settings, error, update } = useSettings();
  const [screen, setScreen] = useState<"home" | "settings">("home");

  useEffect(() => {
    if (screen === "home") {
      document.documentElement.dataset.view = "home";
    } else {
      delete document.documentElement.dataset.view;
    }
    return () => {
      delete document.documentElement.dataset.view;
    };
  }, [screen]);

  if (!settings) {
    return (
      <div className="miro-home" data-testid="home-loading">
        <div className="miro-home__haze" />
        <div
          className="flex h-full items-center justify-center text-[12.5px]"
          style={{ color: "rgb(234 238 251 / 0.5)" }}
        >
          {error ? `Settings could not be read: ${error}` : "Loading\u2026"}
        </div>
      </div>
    );
  }

  if (screen === "settings") {
    return (
      <div className="miro-home-settings">
        <div className="miro-home-settings__bar">
          <button
            type="button"
            className="miro-home-settings__back"
            onClick={() => setScreen("home")}
          >
            <IconBackArrow size={15} />
            Back
          </button>
        </div>
        <div className="miro-home-settings__scroll">
          <SettingsApp />
        </div>
      </div>
    );
  }

  return (
    <MascotHome
      settings={settings}
      update={update}
      onOpenSettings={() => setScreen("settings")}
    />
  );
}
