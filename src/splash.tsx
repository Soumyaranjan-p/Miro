import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SplashApp } from "./components/splash/SplashApp";
import "./styles/splash.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <SplashApp />
    </StrictMode>,
  );
}
