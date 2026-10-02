# DESIGN.md: Rubik WebUI

Sources: taste-skill (minimalist), impeccable.style, awesome-design-md (Raycast, Linear).

## 1. Visual theme and atmosphere
Calm, precise tool. The chrome is near-monochrome so the six sticker colors are the only saturated
thing on screen. Dark and light themes; default follows the OS; the user toggle is remembered.

## 2. Color palette and roles
| Token | Dark | Light | Role |
|---|---|---|---|
| `--canvas` | #0B0C0E | #F7F7F5 | page background |
| `--surface` | #111214 | #FFFFFF | panels |
| `--elevated` | #16181B | #F1F1EF | buttons, keycaps, inputs |
| `--selected` | #1B1D21 | #E9E9E6 | active tab/row, pressed toggle |
| `--hairline` | #23262A | #E4E4E0 | 1px borders |
| `--ring` | #34373C | #C9CBCF | ring lines, hover borders |
| `--mute` | #6E727A | #6E727A | captions, hints |
| `--body` | #C9CBCF | #3A3D42 | body text |
| `--ink` | #F2F3F5 | #16181B | headings, active ring, focus ring |
| `--cta-bg` / `--cta-fg` | #F2F3F5 / #0B0C0E | #16181B / #F7F7F5 | the one primary action per tab |
| `--success` `--danger` `--warning` | #59D499 #FF6161 #FFC533 | #1F9D63 #D93C3C #B7791F | status text; backgrounds at 12% via color-mix |

Stickers (both themes): U #F4F4F2, R #E0352B, F #18B35A, D #FFD23F, L #FF8A1F, B #1E6BFF; plastic #141518.
White and yellow dots get a 1px `--pale-dot-edge` stroke so they read on light backgrounds.

## 3. Typography
Be Vietnam Pro for UI (11px captions, 12–13px body, 14px brand, 18px headings; weights 400/500/600).
JetBrains Mono for move notation, timers, counts and code. Never Inter, never serif.

## 4. Component styling
- Primary CTA: `--cta-bg`, 32px tall, radius 8px, weight 600. One per tab.
- Secondary button `.btn`: `--elevated` + 1px `--hairline`, hover border `--ring`, active `scale(0.98)`.
- Keycap `.keycap`: mono 12px, 32px square minimum, radius 6px; pressed toggle uses CTA colors.
- Pill tabs: transparent, active `--selected` background, radius 999px.
- Panel `.panel`: `--surface`, 1px `--hairline`, radius 10px, padding 10–12px. Never nest panels.
- Alert: status color text on a 12% tint of the same color, radius 8px, inline under the field.

## 5. Layout principles
4px spacing grid (4, 6, 8, 10, 12, 16, 24). ≥1100px: two columns (play area 1.45fr, tab panel 1fr).
760–1100px: tab panel 340px wide. <760px: one column, tabs below the ring diagram.

## 6. Depth and elevation
No drop shadows. Depth comes from the surface ladder (canvas → surface → elevated → selected) plus 1px hairlines.

## 7. Do's and don'ts
Do: one accent role (the CTA); concrete copy ("Màu đỏ có 10 ô, cần đúng 9"); animate only transform/opacity
with `cubic-bezier(0.16,1,0.3,1)`; honor reduced motion; keep every control keyboard-reachable.

Don't: pure #000, purple/neon gradients, glows, emoji, nested cards, chip soup, pulsing dots,
disabled buttons without a reason shown, more than one primary button per view.

## 8. Responsive behavior
Breakpoints 760px and 1100px. Touch targets ≥32px. The 3D view uses Pointer Events and `touch-action: none`.

## 9. Agent prompt guide
"Use the tokens in src/ui/theme.css only. Dark canvas #0B0C0E, panels #111214 with 1px #23262A borders,
white CTA, mono notation in JetBrains Mono, sticker colors only inside the cube, rings and net."
