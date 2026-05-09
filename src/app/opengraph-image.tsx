/**
 * Root OpenGraph / Twitter card image — 1200 × 630
 *
 * Generated server-side via ImageResponse (next/og) so no static PNG is needed.
 * Uses the Heebo fonts already bundled in public/fonts/ for Hebrew text support.
 *
 * Next.js automatically wires the generated URL into:
 *   <meta property="og:image" …>
 *   <meta name="twitter:image" …>
 * for every route under src/app/ that doesn't have its own opengraph-image file.
 */

import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";

// Run in Node.js so we can read font files from the filesystem.
export const runtime     = "nodejs";
export const alt         = 'SignDeal – ניהול חוזים לסוכני נדל"ן';
export const size        = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Load Heebo fonts (Hebrew + Latin) from public/fonts/
  const fontBold    = readFileSync(join(process.cwd(), "public/fonts/Heebo-Bold.ttf"));
  const fontRegular = readFileSync(join(process.cwd(), "public/fonts/Heebo-Regular.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width:      "100%",
          height:     "100%",
          display:    "flex",
          position:   "relative",
          background: "linear-gradient(135deg, #312e81 0%, #1e1b4b 55%, #0d0a2a 100%)",
          fontFamily: "Heebo",
          overflow:   "hidden",
          // Layer 1: establish RTL as the base direction for the entire image.
          // Satori's UBA paragraph resolver reads this when determining the
          // base direction of every descendant block that doesn't set its own.
          direction:   "rtl",
          unicodeBidi: "embed",
        }}
      >
        {/* ── Decorative glows ─────────────────────────────────────────────── */}
        {/* Top-right warm glow */}
        <div
          style={{
            position:     "absolute",
            top:          -140,
            right:        -100,
            width:        480,
            height:       480,
            borderRadius: "50%",
            background:   "rgba(99,102,241,0.28)",
            display:      "flex",
          }}
        />
        {/* Bottom-left cool glow */}
        <div
          style={{
            position:     "absolute",
            bottom:       -180,
            left:         -80,
            width:        560,
            height:       560,
            borderRadius: "50%",
            background:   "rgba(55,48,163,0.45)",
            display:      "flex",
          }}
        />
        {/* Center ambient */}
        <div
          style={{
            position:     "absolute",
            top:          160,
            left:         340,
            width:        520,
            height:       520,
            borderRadius: "50%",
            background:   "rgba(79,70,229,0.12)",
            display:      "flex",
          }}
        />

        {/* ── Main content ─────────────────────────────────────────────────── */}
        {/*
          Layer 2: repeat RTL on the column container.
          flexDirection: "column" is unaffected by direction (it stacks items
          vertically either way). alignItems: "center" centres them on the
          cross-axis, which is also direction-agnostic. So this is safe to add.
        */}
        <div
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            width:          "100%",
            height:         "100%",
            padding:        "60px 120px",
            direction:      "rtl",
            unicodeBidi:    "embed",
          }}
        >
          {/* Logo mark */}
          <div
            style={{
              display:         "flex",
              alignItems:      "center",
              justifyContent:  "center",
              width:           84,
              height:          84,
              borderRadius:    22,
              background:      "rgba(255,255,255,0.10)",
              border:          "1.5px solid rgba(255,255,255,0.22)",
              marginBottom:    30,
            }}
          >
            {/* Checkmark — matches the app's logo mark */}
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
              <polyline
                points="20 6 9 17 4 12"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Brand name */}
          <div
            style={{
              fontSize:      82,
              fontWeight:    700,
              color:         "white",
              letterSpacing: "-2px",
              lineHeight:    1,
              marginBottom:  22,
            }}
          >
            SignDeal
          </div>

          {/* Accent divider */}
          <div
            style={{
              width:        72,
              height:       2,
              background:   "rgba(165,180,252,0.55)",
              borderRadius: 1,
              marginBottom: 30,
              display:      "flex",
            }}
          />

          {/* Hebrew tagline — Heebo has full Hebrew glyph coverage */}
          {/*
            Layer 3 (the decisive one): unicodeBidi: "embed" opens a new
            explicit directional embedding at level 1 (RTL). This tells
            Satori's UBA that the paragraph base direction for every run
            of text inside this block is RTL — fixing word order for the
            neutral comma/space characters between Hebrew words.

            The U+200F (RIGHT-TO-LEFT MARK) prepended to the string is an
            invisible RTL character that pins the paragraph's "first strong
            character" to RTL, ensuring correct resolution even if Satori's
            UBA version ignores the CSS embedding level.
          */}
          <div
            style={{
              fontSize:    35,
              fontWeight:  400,
              color:       "rgba(199,210,254,1)",
              textAlign:   "center",
              maxWidth:    820,
              lineHeight:  1.45,
              direction:   "rtl",
              unicodeBidi: "embed",
              // Satori needs display:"flex" only when a div has >1 child node.
              // With a single string expression child we can skip it.
            }}
          >
            {/*
              Single string expression = one React child node (Satori-safe).
              ‏ = RIGHT-TO-LEFT MARK — invisible character that acts as
              the first strong directional character, pinning UBA paragraph
              base direction to RTL before any Hebrew or neutral glyph is seen.
            */}
            {"‏מערכת חוזים, חתימות ותשלומים למתווכים"}
          </div>

          {/* Domain */}
          <div
            style={{
              marginTop:     38,
              fontSize:      22,
              fontWeight:    400,
              color:         "rgba(129,140,248,0.85)",
              letterSpacing: "0.6px",
            }}
          >
            signdeal.co.il
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Heebo", data: fontBold,    weight: 700, style: "normal" },
        { name: "Heebo", data: fontRegular, weight: 400, style: "normal" },
      ],
    },
  );
}
