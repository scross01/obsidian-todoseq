---
name: TODOseq
description: Keyword-based task management for Obsidian. No checkboxes required.
colors:
  accent: "#7C3AED"
  accent-hover: "#6D28D9"
  accent-ink: "#FFFFFF"
  accent-dark: "#A78BFA"
  accent-hover-dark: "#C4B5FD"
  accent-ink-dark: "#1E1B2E"
  ink: "#1F1F1F"
  ink-muted: "#5C5C66"
  ink-dark: "#ECECF1"
  ink-muted-dark: "#B3B3C0"
  surface: "#F6F6F8"
  surface-dark: "#1E1E23"
  line: "#E4E4EC"
  line-dark: "#2C2C33"
  kw-todo: "#C2410C"
  kw-doing: "#1D4ED8"
  kw-done: "#15803D"
  kw-wait: "#6D28D9"
  kw-todo-dark: "#FB923C"
  kw-doing-dark: "#93C5FD"
  kw-done-dark: "#86EFAC"
  kw-wait-dark: "#C4B5FD"
typography:
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: "400"
    lineHeight: "1.6"
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: "700"
    lineHeight: "1.2"
    letterSpacing: "-0.02em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.8rem"
    fontWeight: "600"
rounded:
  sm: "8px"
  md: "10px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.sm}"
    padding: "0.62rem 1.35rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.62rem 1.35rem"
  chip:
    backgroundColor: "tinted state color"
    textColor: "state color"
    rounded: "{rounded.pill}"
    padding: "0.2rem 0.55rem"
  media:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0"
---

# Design System: TODOseq

## Overview

**Creative North Star: "The Quiet Journal"**

TODOseq’s visual world is the calm of a well-kept paper journal opened inside Obsidian: plain lines, clear state words, no ceremony. Personality is not decoration — it is the product’s own vocabulary (`TODO`, `DOING`, `DONE`) treated as small monospace marks on the page. Surfaces stay quiet so the keyword and the note text can lead.

Aesthetic philosophy: **restrained and Obsidian-adjacent.** Docs and marketing should feel native to the Obsidian ecosystem without cloning Obsidian chrome. One saturated accent (violet), neutral paper/ink, hairline borders, soft elevation only on product media. Anti-references confirmed by the brief: purple gradient heroes, emoji section headers, six equal feature-card walls, competing filled CTAs, center-stacked marketing paragraphs.

**Key Characteristics:**

- Keyword chips as the only signature motif
- Left-aligned editorial reading path on Persuade surfaces
- Single primary action (Install) per conversion zone
- Product screenshots/GIF framed, never filtered
- VitePress/Inter as the workhorse type; no second display face required

## Colors

Palette character: neutral journal paper and ink, with one Obsidian-family violet accent used sparingly, plus semantic state colors that echo task keywords.

### Primary

- **Journal Violet** (`#7C3AED` light / `#A78BFA` dark): Primary filled CTAs, focus rings, link emphasis on docs surfaces. Dark-theme ink on filled violet is `#1E1B2E` (`--ts-accent-ink`), never raw `#fff`.

### Neutral

- **Ink** (`#1F1F1F` / `#ECECF1`): Headings and strong text.
- **Muted ink** (`#5C5C66` / `#B3B3C0`): Supporting copy.
- **Paper / soft surface** (`#F6F6F8` / `#1E1E23`): Cards, image wells, table headers.
- **Rule** (`#E4E4EC` / `#2C2C33`): Borders and dividers.

### Keyword state accents

- **TODO orange** (`#C2410C` / `#FB923C`): `TODO` chips.
- **DOING blue** (`#1D4ED8` / `#93C5FD`): `DOING` / `NOW` chips.
- **DONE green** (`#15803D` / `#86EFAC`): `DONE` chips.
- **WAIT/LATER violet** (`#6D28D9` / `#C4B5FD`): waiting/deferred chips.

Plugin UI (in Obsidian) continues to use theme variables (`--interactive-accent`, fallback `#7f6df2` in `styles.css`) rather than inventing a second brand purple inside the app.

### Named Rules

**The One Violet Rule.** Filled violet is reserved for the primary Install action (hero + at most one mid-page repeat). Secondary actions are outline or text links.

**The Chip Cap Rule.** Keyword chips appear as at most one cluster per section. They are a signature, not wallpaper.

## Typography

**Display / Body Font:** Inter (VitePress default) with `ui-sans-serif, system-ui, sans-serif` fallback  
**Label / Mono Font:** VitePress mono stack for keywords, chips, and code

**Character:** Workhorse UI type with a quiet journal register — tight tracking on the landing H1, generous measure on supporting copy. Personality comes from layout and chips, not a decorative display face.

### Hierarchy

- **Display** (700, ~2.25rem, lh 1.2, tracking -0.02em): Landing H1 only; left-aligned.
- **Tagline** (700, ~1.9rem / 1.55rem mobile): One-line product promise.
- **Body** (400, ~1.02rem, lh 1.6): Hero subcopy max ~36–44rem measure.
- **Card title** (600–700, ~1.02rem): Feature cards.
- **Label / chip** (600, ~0.8rem, mono): Keyword chips and eyebrow labels.

### Named Rules

**The No-Center-Wall Rule.** Long persuasive paragraphs are not center-aligned stacks. Read surfaces may center short titles if VitePress does; body measure stays scannable.

## Layout

Docs site is VitePress: nav, optional sidebar on guides, single content column. Landing uses a two-column hero from ~900px (copy left, media right); stacks copy → CTAs → media on small screens. Spacing rhythm is 8px-based; section gaps 2.5–3.5rem. Feature grids use auto-fit columns with ~10px card radius. Guide pages inherit default VP density; this system only adds chrome consistency (images, tables), not a new grid.

## Elevation & Depth

Hybrid: flat journal surfaces by default; soft elevation only under product media and landing cards.

### Shadow Vocabulary

- **Media lift** (`box-shadow: 0 12px 40px rgba(0,0,0,.12)` light; softer in dark): Screenshots and hero GIF only.
- **Card rest**: border on soft surface; no heavy drop shadow.

### Named Rules

**The Product-Only Lift Rule.** Shadows lift evidence (real UI), not decorative panels.

## Shapes

Corner language: buttons `8px`, cards/media `10px`, keyword chips fully pill (`999px`). Borders are 1px hairlines in the rule color. No gradient blobs, no large radii on page sections.

## Components

### Buttons

- **Shape:** 8px radius; padding `0.62rem 1.35rem`; 600 weight.
- **Primary:** `background: var(--ts-accent)`, `color: var(--ts-accent-ink)`. Hover uses `--ts-accent-hover`. Visible `:focus-visible` ring in accent.
- **Ghost / secondary:** transparent or soft surface, 1px `--ts-line` border, ink text; hover borders/text shift to accent.
- **Text link:** default VP link treatment; underline offset for readability.

### Chips

- **Style:** mono ~0.8rem, 600, pill radius, soft tinted background using the matching keyword state token.
- **Use:** eyebrow labels (neutral surface + muted ink) and one keyword strip on the landing page.

### Cards / Containers

- **Corner:** 10px
- **Background:** `--ts-surface`
- **Border:** 1px `--ts-line`
- **Padding:** ~1.2rem 1.25rem
- **Shadow:** none at rest

### Media

- Product images/GIF: 10px radius, 1px `--ts-line`, media lift shadow, `background: var(--ts-surface)`
- Never invert, filter, or recolor real Obsidian screenshots
- Animated demos respect `prefers-reduced-motion` (static still fallback)

### Navigation

- VitePress default nav/sidebar; Install remains an external link
- Sidebar may group destinations but must not invent new product IA

## Do's and Don'ts

### Do:

- **Do** use `--ts-accent` / `--ts-accent-ink` for filled primary CTAs in both themes.
- **Do** lead Persuade surfaces with a left-aligned promise, one primary CTA, and real product media (prefer the animated demo).
- **Do** keep keyword chips rare and semantic.
- **Do** frame every product screenshot with the shared media treatment.
- **Do** leave plugin UI on Obsidian theme variables.

### Don't:

- **Don't** center long hero paragraph stacks or stack four equal filled CTAs.
- **Don't** use `var(--vp-c-brand-1)` + hardcoded `#fff` for docs primary buttons.
- **Don't** add purple gradients, emoji headers, or isometric illustration systems.
- **Don't** filter screenshots or invent testimonials/metrics.
- **Don't** ship a second display font from a CDN unless product truth requires it.
