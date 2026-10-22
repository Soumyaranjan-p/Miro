import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MiroApp } from "./components/shell/MiroApp";
import "./styles/theme.css";
import "./components/shell/shell.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <MiroApp />
    </StrictMode>,
  );
}
