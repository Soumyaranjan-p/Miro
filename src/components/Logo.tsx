/** Miro's mark: an ink plate holding three ember voice bars and a text caret. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label="Miro">
      <rect x="0" y="0" width="24" height="24" rx="6.2" fill="#16181D" />
      <rect x="6.2" y="9.5" width="1.8" height="5" rx="0.9" fill="#FF4D2E" />
      <rect x="9.3" y="6.25" width="1.8" height="11.5" rx="0.9" fill="#FF4D2E" />
      <rect x="12.4" y="8.4" width="1.8" height="7.2" rx="0.9" fill="#FF4D2E" />
      <rect x="16" y="6.25" width="1.8" height="11.5" rx="0.9" fill="#EDEEF0" />
    </svg>
  );
}
