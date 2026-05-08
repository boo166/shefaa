---
version: alpha
name: MedFlow Clinical UI
description: Dense, bilingual enterprise healthcare SaaS — cool slate neutrals, saturated blue primary, semantic status colors, and restrained elevation.

colors:
  canvas: "#f1f5f9"
  canvas-dark: "#121517"
  surface: "#ffffff"
  surface-dark: "#161b22"
  surface-raised-dark: "#1c232b"
  foreground: "#141821"
  foreground-dark: "#e8eaed"
  primary: "#2563eb"
  primary-dark: "#3b82f6"
  on-primary: "#ffffff"
  secondary-surface: "#f1f5f9"
  secondary-surface-dark: "#1c232b"
  secondary-foreground: "#334155"
  secondary-foreground-dark: "#e2e8f0"
  muted: "#eef2f6"
  muted-dark: "#1c232b"
  muted-foreground: "#64748b"
  muted-foreground-dark: "#94a3b8"
  accent-hover: "#eef2f6"
  accent-hover-dark: "#1c232b"
  border: "#e2e8f0"
  border-dark: "#2d3748"
  ring: "#2563eb"
  ring-dark: "#3b82f6"
  destructive: "#ef4444"
  destructive-dark: "#ef5350"
  on-destructive: "#ffffff"
  success: "#059669"
  success-dark: "#10b981"
  on-success: "#ffffff"
  warning: "#f59e0b"
  warning-dark: "#fbbf24"
  on-warning: "#ffffff"
  on-warning-dark: "#121517"
  info: "#0ea5e9"
  info-dark: "#38bdf8"
  on-info: "#ffffff"
  sidebar-background: "#ffffff"
  sidebar-background-dark: "#161b22"
  sidebar-foreground: "#64748b"
  sidebar-foreground-dark: "#94a3b8"
  sidebar-accent: "#f1f5f9"
  sidebar-accent-dark: "#1c232b"
  overlay-scrim: "#141821"
  chart-1: "#2563eb"
  chart-2: "#059669"
  chart-3: "#f59e0b"
  chart-4: "#0ea5e9"
  chart-5: "#8b5cf6"

typography:
  font-sans-stack:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5rem
  font-arabic-stack:
    fontFamily: Cairo
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5rem
  font-mono-stack:
    fontFamily: JetBrains Mono
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5rem
  label-2xs:
    fontFamily: Inter
    fontSize: 0.625rem
    fontWeight: 600
    lineHeight: 0.875rem
    letterSpacing: 0.08em
  table-header:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 500
    lineHeight: 1rem
    letterSpacing: 0.05em
  body-default:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25rem
  label-default:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 500
    lineHeight: 1.25rem
  section-title:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 600
    lineHeight: 1.25rem
  page-title:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.75rem
    letterSpacing: -0.025em
  kpi-value:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 2rem
    letterSpacing: -0.025em

rounded:
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  xxl: 16px
  full: 9999px

spacing:
  unit-base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  page-padding-x-mobile: 16px
  page-padding-x-desktop: 24px
  page-padding-y-mobile: 16px
  page-padding-y-desktop: 24px
  topbar-height: 56px
  sidebar-width: 240px
  sidebar-collapsed-width: 48px

motion:
  duration-instant: 75ms
  duration-fast: 150ms
  duration-normal: 200ms
  duration-slow: 300ms
  duration-skeleton-loop: 2000ms
  easing-standard-out: cubic-bezier(0, 0, 0.2, 1)
  easing-standard-in-out: cubic-bezier(0.4, 0, 0.2, 1)
  easing-emphasized-decelerate: cubic-bezier(0.0, 0.0, 0.2, 1)
  easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1)

elevation:
  shadow-xs-light: "0 1px 2px 0 rgba(0, 0, 0, 0.05)"
  shadow-sm-light: "0 1px 3px 0 rgba(0, 0, 0, 0.07), 0 1px 2px -1px rgba(0, 0, 0, 0.07)"
  shadow-md-light: "0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.08)"
  shadow-lg-light: "0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.06)"
  shadow-xl-light: "0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.06)"
  shadow-2xl-light: "0 25px 50px -12px rgba(0, 0, 0, 0.16)"
  shadow-inner-light: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)"
  shadow-xs-dark: "0 1px 2px 0 rgba(0, 0, 0, 0.30)"
  shadow-sm-dark: "0 1px 3px 0 rgba(0, 0, 0, 0.35), 0 1px 2px -1px rgba(0, 0, 0, 0.35)"
  shadow-md-dark: "0 4px 6px -1px rgba(0, 0, 0, 0.35), 0 2px 4px -2px rgba(0, 0, 0, 0.35)"
  shadow-lg-dark: "0 10px 15px -3px rgba(0, 0, 0, 0.35), 0 4px 6px -4px rgba(0, 0, 0, 0.25)"
  shadow-xl-dark: "0 20px 25px -5px rgba(0, 0, 0, 0.35), 0 8px 10px -6px rgba(0, 0, 0, 0.25)"
  focus-ring-double: "0 0 0 2px {colors.canvas}, 0 0 0 4px {colors.ring}"

z-index:
  base: 0
  raised: 1
  dropdown: 50
  sticky: 60
  overlay: 70
  modal: 80
  notification: 90
  tooltip: 100

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-default}"
    rounded: "{rounded.sm}"
    padding: 12px
  button-primary-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-default}"
    rounded: "{rounded.sm}"
    padding: 12px
  input-field:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    typography: "{typography.body-default}"
    rounded: "{rounded.sm}"
    height: 36px
  card-static:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: 20px
  card-static-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.foreground-dark}"
    rounded: "{rounded.lg}"
    padding: 20px
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: 20px
  modal-overlay:
    backgroundColor: "{colors.overlay-scrim}"
    typography: "{typography.body-default}"
  topbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    height: "{spacing.topbar-height}"
    padding: 16px
---

## Overview

MedFlow presents as a **precise, high-density clinical operations suite**: schedules, ledgers, records, and admin workflows in one shell. The visual stance is **confident but calm**—enterprise SaaS without ornament. Cool slate neutrals establish trust and neutrality in a healthcare context; a single **saturated blue** carries all primary actions and wayfinding emphasis. Status semantics (success, warning, danger, info) are **explicit and saturated** so ward and billing states read instantly in peripheral vision.

The interface is **bilingual-ready**: Latin UI defaults to a grotesque sans with subtle stylistic sets enabled for clarity; Arabic switches to a readable humanist/geometric Arabic companion at the same optical scale. Density favors **14px body text** and compact vertical rhythm so tables and forms dominate without feeling cramped. Motion is **barely noticeable**: short fades and scales for overlays, never theatrical transitions on data.

Dark mode inverts value relationships: near-black canvas, lifted cards one step lighter, slightly brighter primary for contrast on dark grounds, and heavier shadows so elevation remains legible.

## Colors

**Neutrals** — The page canvas is a cool light gray (not pure white), keeping glare down during long sessions. Cards and chrome surfaces read as clean white in light mode; borders are a hair softer than text for hierarchy without harsh grids.

**Brand** — Primary blue anchors CTAs, links, active navigation, focus rings, and chart series one. No secondary brand hue competes; “emphasis” beyond primary uses semantic colors or neutral fills.

**Semantics** — Emerald signals completion and positive ledger states; amber signals pending or caution; red signals destructive actions and errors; sky signals informational banners. In dark mode, success, warning, and info tones lift slightly in lightness for WCAG-friendly pairing; warning foreground flips to dark text on the brighter amber ground.

**Sidebar** — Mirrors card neutrals with a dedicated muted label color so navigation recedes until hovered or marked active (primary tint).

**Data visualization** — Five distinct hues (blue, emerald, amber, sky, violet) stay separated on charts; they intentionally align with brand and semantic language where possible.

## Typography

**Families** — Latin stack centers on **Inter** with selective OpenType features for refined digits and punctuation. Arabic stack centers on **Cairo**, preserving weight harmony with Latin at matching sizes. Monospace (**JetBrains Mono** first) serves IDs, codes, and tabular numeric alignment—not prose.

**Scale & roles** — Default reading size is **0.875rem (14px)** with ~1.25 line height: optimized for tables and forms. Page titles sit at **1.25rem semibold** with tight tracking. Section titles inside cards are **small but semibold**—they read as UI chrome, not editorial headings. Table headers are **uppercase, tracked, 12px** for scanability. KPI numerals use **1.5rem semibold** with tight tracking; combine with tabular lining figures for financial columns.

**Rules of thumb** — Avoid large body text for core workflows; reserve **1rem** for rare long-form help. Do not use heavyweight headings (`h1`–`h6`) as styling shortcuts—map visual hierarchy to the roles above.

## Layout

**Grid & rhythm** — Spacing derives from a **4px** base. Page gutters widen slightly on large breakpoints. Vertical rhythm between sections favors **20px** stacks; within forms, **16px** between groups and **8px** between label and control.

**Chrome** — A fixed **56px** top bar anchors global actions and context switching. Primary navigation uses a **240px** sidebar width; icon-only collapse targets **48px** where space is constrained.

**Tables** — Prefer full-width data surfaces with sticky headers only when datasets are tall; row hover uses a subtle neutral wash; selected rows use a **very light primary tint**—never strong fills.

**RTL** — Mirror directional layouts (navigation, actions, trailing icons); maintain numeric and code directionality where clinically required.

## Elevation & Depth

Elevation is **restrained**: most surfaces are flat with **1px borders** defining edges. Shadows escalate only for transient layers—dropdowns, popovers, hover on KPI cards, interactive cards, and modals.

Light-mode shadows use **low-contrast black alphas** (roughly 5–8%) stacked in twin layers for soft diffusion. Dark-mode shadows deepen opacity (~30–35%) so floated panels still separate from near-black canvas.

Modal overlays use a **semi-transparent dark scrim** plus light backdrop blur for depth without obscuring context.

Focus rings are **2px** outlines in primary color with **2px** outer separation—doubled ring pattern acceptable where contrast demands separation from adjacent borders.

## Shapes

Corner radii derive from a **6px** base token: inputs and small controls tighten slightly (**4px**); standard buttons land near **6px**; cards and stat tiles expand to **8–12px**; pills and circular affordances use **full** rounding.

The overall impression is **rounded-modern**, not bubbly—radii stay smaller than consumer social apps to signal professionalism.

## Components

**Buttons** — Primary buttons fill brand blue with white label text; default height aligns with **36px** inputs for horizontal pairing. Ghost and outline variants rely on border tokens; destructive actions pull danger red with identical sizing for muscle memory.

**Inputs** — Compact height, subtle shadow-xs, ring-based focus (no harsh inset). Invalid states tint border and ring toward destructive with light destructive wash—not only color swaps.

**Cards** — Default cards are border-forward; optional hover promotes to **md** shadow and slightly stronger border. KPI tiles (`stat-card`) use larger radius and hover elevation—signals “glanceable metric.”

**Tables** — Uppercase muted headers, row hover wash, thin dividers at ~60% border opacity, last row without bottom rule.

**Badges & status** — Compact pills with **inset ring** outline; pair hue with text label—never color-only state.

**Dialogs** — Modal content scales in quickly (**150ms**) with ease-out; overlay fades concurrently. Sheet / sidebar animations slide **250–300ms** with decelerated easing.

**Skeleton** — Prefer diagonal **shimmer** over bare pulse for loading content areas; pulse reserved for tiny inline placeholders.

**Icons** — Single icon library; sizes stepped **12 → 14 → 16 → 20 → 24 → 32 → 48px** from indicators to empty-state illustration scale.

## Do's and Don'ts

**Do**

- Keep body copy at **14px** for dense workflows; use semantic color tokens for every state.
- Use **tabular figures** for currency, counts, and dates in grids.
- Maintain **visible keyboard focus** on all interactive controls.
- Test **light and dark** contrast for semantic badges and chart lines.
- Respect **reduced motion**: rely on opacity/transform micro-motions that degrade gracefully.

**Don't**

- Introduce extra accent hues for “variety”—primary plus semantics already encode meaning.
- Hardcode raw hex or RGB in components—tokens preserve theme parity.
- Use **large headline elements** for routine page titles inside the app shell.
- Animate layout-critical dimensions on every interaction—reserve motion for feedback and spatial context changes.
- Rely on **color alone** for status; always include text or icon semantics.
