import { ImageResponse } from "next/og";
import { SITE_TAGLINE } from "@/lib/seo";

export const alt = "Mirro — Motion for modern interfaces";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Site-wide Open Graph / Twitter card image. Generated at build time so the
 * social preview never 404s.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0b",
          color: "#fafafa",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 60% 60% at 50% 42%, rgba(255,77,41,0.20), transparent 70%)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 9999,
              border: "9px solid #ff4d29",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 9999,
                background: "#ff4d29",
              }}
            />
          </div>
          <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: -2 }}>Mirro</div>
        </div>
        <div style={{ marginTop: 26, fontSize: 40, color: "#ff6a45" }}>{SITE_TAGLINE}</div>
        <div style={{ marginTop: 22, fontSize: 26, color: "#8e939c" }}>
          Animated React icons, components &amp; UI blocks — copy, paste, ship.
        </div>
      </div>
    ),
    size,
  );
}
