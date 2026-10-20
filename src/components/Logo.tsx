/** Miro's mark: the mascot avatar, generated into public/logo.png by
 * scripts/generate-icons.py - the same artwork as the window and tray icons. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      alt="Miro"
      style={{ borderRadius: Math.max(6, size * 0.22), display: "block" }}
    />
  );
}
