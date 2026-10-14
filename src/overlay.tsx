import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OverlayApp } from "./components/overlay/OverlayApp";
import { applyTheme } from "./lib/theme";
import "./styles/theme.css";

applyTheme("system");

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <OverlayApp />
    </StrictMode>,
  );
}
