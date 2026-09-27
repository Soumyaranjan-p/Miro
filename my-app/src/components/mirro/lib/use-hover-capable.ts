"use client";

import { useEffect, useState } from "react";

export function useHoverCapable(): boolean {
  const [capable, setCapable] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading initial hover capability from matchMedia after mount
    setCapable(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCapable(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return capable;
}
