"use client";

import { useEffect, type EffectCallback } from "react";

/**
 * Runs an effect exactly once on mount (and its cleanup on unmount).
 *
 * This is the sanctioned escape hatch for one-time external-system sync —
 * DOM integration, browser API subscriptions, third-party lifecycles — where
 * `useEffect` with an empty dependency array would otherwise be used.
 * See no-use-effect.md.
 */
export function useMountEffect(effect: EffectCallback): void {
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(effect, []);
  /* eslint-enable react-hooks/exhaustive-deps */
}
