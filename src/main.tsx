import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HomeApp } from "./components/home/HomeApp";
import { applyTheme } from "./lib/theme";
import "./styles/theme.css";

// Paint with the OS theme immediately; the stored preference takes over once
// settings arrive, so a dark desktop never flashes a white window.
applyTheme("system");

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <HomeApp />
    </StrictMode>,
  );
}
