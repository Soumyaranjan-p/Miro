import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { IslandApp } from "./components/island/IslandApp";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <IslandApp />
    </StrictMode>,
  );
}
