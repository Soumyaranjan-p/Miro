"use client";

import { useState } from "react";
import { useMountEffect } from "./use-mount-effect";

export function useHoverCapable(): boolean {
  const [capable, setCapable] = useState(false);

  useMountEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    // Reading the initial hover capability after mount avoids a hydration mismatch.
    setCapable(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCapable(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });

  return capable;
}
