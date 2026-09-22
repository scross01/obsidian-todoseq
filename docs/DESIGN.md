---
name: TODOseq docs site
description: Docs and marketing visual system for the TODOseq VitePress site. Not used by the plugin UI.
colors:
  accent: '#6D28D9'
  accent-hover: '#5B21B6'
  accent-ink: '#FFFFFF'
  accent-dark: '#7C3AED'
  accent-hover-dark: '#8B5CF6'
  accent-ink-dark: '#FFFFFF'
  ink: '#1F1F1F'
  ink-muted: '#5C5C66'
  ink-dark: '#ECECF1'
  ink-muted-dark: '#B3B3C0'
  surface: '#F6F6F8'
  surface-dark: '#1E1E23'
  line: '#E4E4EC'
  line-dark: '#2C2C33'
typography:
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '16px'
    fontWeight: '400'
    lineHeight: '1.6'
  display:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '2.25rem'
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: '-0.02em'
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: '0.8rem'
    fontWeight: '600'
rounded:
  sm: '8px'
  md: '10px'
  pill: '999px'
spacing:
  sm: '8px'
  md: '16px'
  lg: '24px'
  xl: '40px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-ink}'
    rounded: '{rounded.sm}'
    padding: '0.62rem 1.35rem'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.sm}'
    padding: '0.62rem 1.35rem'
  media:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.md}'
    padding: '0'
---

# Design System: TODOseq docs site

## Overview

**Scope:** This file governs **only** the VitePress docs/marketing site (`docs/`, landing, guides, README visual echo if any). The Obsidian plugin UI is specified in the repo-root [`DESIGN.md`](../DESIGN.md) and must not be restyled from this file.

**Creative North Star: "The Quiet Journal"**

TODOseq’s docs visual world is the calm of a well-kept paper journal: plain lines, quiet surfaces, no ceremony. Personality stays out of the chrome — product truth lives in real UI demos and the note syntax itself, not in decorative keyword pills (those read as plugin UI and are misleading).

Aesthetic philosophy: **restrained and Obsidian-adjacent.** Docs and marketing feel native to the Obsidian ecosystem without cloning Obsidian chrome. One saturated accent (violet), neutral paper/ink, hairline borders, soft elevation only on product media. Anti-references: purple gradient heroes, emoji section headers, six equal feature-card walls, marketing keyword chips that fake plugin appearance, competing filled CTAs, center-stacked marketing paragraphs.

**Key Characteristics:**

- Modes: Persuade (landing) + Read (guides)
- No decorative keyword-chip motif on marketing surfaces
- Left-aligned editorial reading path on Persuade surfaces
- One filled primary CTA (Install); View docs + Star as secondary
- Product media is the animated demo only; framed, never filtered
- Filled buttons use high-contrast violet + white ink in both themes
- VitePress/Inter as the workhorse type; no second display face required

**The Two-World Rule.** Never import plugin theme variables as brand color here, and never export Journal Violet / `--ts-*` tokens into plugin CSS. Screenshots in docs must show real theme-native plugin UI.

## Colors

Palette character: neutral journal paper and ink, with one Obsidian-family violet accent used sparingly. Decorative keyword-state colors are not used on marketing chrome.

### Primary

- **Journal Violet** (`#6D28D9` light / `#7C3AED` dark): Primary filled CTAs and focus rings. Ink on filled violet is always `#FFFFFF` (`--ts-accent-ink`) for readable contrast in both themes. Hover `#5B21B6` light / `#8B5CF6` dark.

### Neutral

- **Ink** (`#1F1F1F` / `#ECECF1`): Headings and strong text.
- **Muted ink** (`#5C5C66` / `#B3B3C0`): Supporting copy.
- **Paper / soft surface** (`#F6F6F8` / `#1E1E23`): Cards, image wells, table headers.
- **Rule** (`#E4E4EC` / `#2C2C33`): Borders and dividers.

### Named Rules

**The One Violet Rule.** Filled violet is reserved for the primary Install action (hero + at most one mid-page repeat). Secondary actions (View docs, Star) are outline buttons.

**The No-Fake-UI Rule.** Do not render marketing pills that imitate plugin keyword styling; show real product media instead.

## Typography

**Display / Body Font:** Inter (VitePress default) with `ui-sans-serif, system-ui, sans-serif` fallback  
**Label / Mono Font:** VitePress mono stack for code samples only

**Character:** Workhorse UI type with a quiet journal register — tight tracking on the landing H1, generous measure on supporting copy. Personality comes from layout and real product media, not a decorative display face or chip motif.

### Hierarchy

- **Display** (700, ~2.25rem, lh 1.2, tracking -0.02em): Landing H1 only; left-aligned.
- **Tagline** (700, ~1.9rem / 1.55rem mobile): One-line product promise.
- **Body** (400, ~1.02rem, lh 1.6): Hero subcopy max ~36–44rem measure.
- **Card title** (600–700, ~1.02rem): Feature cards.

### Named Rules

**The No-Center-Wall Rule.** Long persuasive paragraphs are not center-aligned stacks. Read surfaces may center short titles if VitePress does; body measure stays scannable.

## Layout

Docs site is VitePress: nav, optional sidebar on guides, single content column. Landing hero is **stacked**: left-aligned promise + CTAs, then the animated demo at **full content width** beneath the buttons (not a side-by-side media column). Spacing rhythm is 8px-based; section gaps 2.5–3.5rem. Feature grids use auto-fit columns with ~10px card radius. Guide pages inherit default VP density; this system only adds chrome consistency (images, tables), not a new grid.

## Elevation & Depth

Hybrid: flat journal surfaces by default; soft elevation only under product media and landing cards.

### Shadow Vocabulary

- **Media lift** (`box-shadow: 0 12px 40px rgba(0,0,0,.12)` light; softer in dark): Screenshots and hero GIF only.
- **Card rest**: border on soft surface; no heavy drop shadow.

### Named Rules

**The Product-Only Lift Rule.** Shadows lift evidence (real UI), not decorative panels.

## Shapes

Corner language: buttons `8px`, cards/media `10px`. Borders are 1px hairlines in the rule color. No gradient blobs, no large radii on page sections.

## Components

### Buttons

- **Shape:** 8px radius; padding `0.62rem 1.35rem`; 600 weight.
- **Primary:** `background: var(--ts-accent)`, `color: var(--ts-accent-ink)` (**white** in both themes). Must beat VitePress `.vp-doc a` link colors (use `a.ts-btn-primary` specificity). Hover uses `--ts-accent-hover`. Visible `:focus-visible` ring in accent.
- **Ghost / secondary:** transparent, 1px `--ts-line` border, ink text; hover borders/text shift to accent. Used for View docs and Star on GitHub.
- **Text link:** default VP link treatment; underline offset for readability.

### Cards / Containers

- **Corner:** 10px
- **Background:** `--ts-surface`
- **Border:** 1px `--ts-line`
- **Padding:** ~1.2rem 1.25rem
- **Shadow:** none at rest

### Media

- Prefer the animated product demo (`todoseq-task-entry.gif`) on the **landing hero only**; guide pages use stills (full workspace shots via `{.ts-img-full}`)
- Landing hero is the only full-bleed media under CTAs; do not stack a static still beside it
- 10px radius, 1px `--ts-line`, media lift shadow, `background: var(--ts-surface)`
- Guide image scale: **unclassified default `min(100%, 400px)`**; popup menus/pickers `{.ts-img-detail}` (`min(100%, 320px)`); horizontal strips `{.ts-img-wide}` (`min(100%, 480px)`); full workspace captures `{.ts-img-full}` (100%)
- Variants must use `:not(.ts-hero-gif):not(.ts-hero-still)` so they outrank the default rule
- Never invert, filter, or recolor real Obsidian screenshots
- Respect `prefers-reduced-motion` if a still fallback is ever reintroduced

### Navigation

- VitePress default nav/sidebar; Install remains an external link
- Sidebar may group destinations but must not invent new product IA

## Do's and Don'ts

### Do:

- **Do** use `--ts-accent` + white `--ts-accent-ink` for filled primary CTAs in both themes; override VP link colors on `a.ts-btn`.
- **Do** lead Persuade surfaces with a left-aligned promise, Install primary, View docs + Star secondary, and the animated product demo.
- **Do** frame product media with the shared treatment.
- **Do** keep keyword-state colors out of marketing chrome.

### Don't:

- **Don't** center long hero paragraph stacks or stack four equal filled CTAs.
- **Don't** put Star/GitHub as a lone CTA in a bottom Support section.
- **Don't** use `var(--vp-c-brand-1)` or light-on-light / dark-on-dark button pairings.
- **Don't** add purple gradients, emoji headers, decorative keyword pills, or isometric illustration systems.
- **Don't** filter screenshots or invent testimonials/metrics.
- **Don't** ship a second display font from a CDN unless product truth requires it.
- **Don't** apply this system to plugin CSS or in-app UI — use the root [`DESIGN.md`](../DESIGN.md).
