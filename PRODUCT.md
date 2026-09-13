# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Obsidian users who want keyword-based task capture inside ordinary notes — people already writing in Markdown who prefer plain lines like `TODO Write report` over checkbox ceremony. Includes Logseq and Org-mode users dual-using or migrating a vault, and journalers who want tasks in context with the notes they relate to.

Secondary: developers who also collect `// TODO` comments from code files into the same Task List.

## Product Purpose

TODOseq scans an Obsidian vault for lines that begin with state keywords (`TODO`, `DOING`, `DONE`, `LATER`, `NOW`, `WAIT`, …), extracts them into a unified Task List panel, and keeps those tasks interactive in Edit and Reading views. Success means capture stays as fast as typing a word in a note, while search, urgency, dates, and embedded lists make the vault actionable without a second system.

## Positioning

Keyword-based task tracking for Obsidian without checkbox syntax. The mechanism is the keyword itself: state lives in the note line, not in a separate database UI. Inspired by Emacs Org-mode and Logseq; compatible enough for dual-use vaults. Free and open source (MIT).

## Operating Context

- Obsidian desktop and mobile (plugin is not desktop-only)
- Community Plugins install path; local vault files under `.obsidian/plugins/todoseq` for dev builds
- Markdown notes, daily notes, code files, optional Org-mode experimental files
- Task List sidebar panel; command palette; right-click context menus
- Docs site on GitHub Pages (VitePress) at the project docs URL
- GitHub README as the first contact for many prospective users

## Capabilities and Constraints

Confirmed capabilities:

- State keywords with group behavior (active / inactive / waiting / completed), including custom keywords
- Priorities `[#A]` / `[#B]` / `[#C]`; subtask progress `[1/3]`
- Natural-language dates converted to structured Org-style `SCHEDULED:` / `DEADLINE:` / `CLOSED:` / `STARTED:`
- Repeating tasks; urgency scoring and sort
- Search with boolean/group syntax and saved-style filters
- Embedded `todoseq` code blocks for live in-note lists
- Code-comment TODO extraction across many languages
- Editor and Reader keyword formatting and click-to-cycle
- i18n via Obsidian UI language (no separate plugin language setting)

Constraints:

- Checkboxes without a state keyword are ignored by TODOseq
- Multi-line task descriptions are not supported (`DESCRIPTION:` is a single line)
- Org-mode file support is experimental and opt-in
- Docs and marketing must not invent benchmarks, download counts, or features not in the plugin/docs

Open / undecided product facts: none required for docs landing work.

## Brand Commitments

- Product name: **TODOseq** (pronounced “to-do-seek”)
- Obsidian-adjacent: feel native to the Obsidian ecosystem without mirroring Obsidian chrome exactly
- Unique personality from the product’s own vocabulary (keyword chips / TODO–DOING–DONE language), not from unrelated decoration
- Free and open source; MIT
- Voice: plain, direct, technical-friendly; no hype filler

## Evidence on Hand

- Live plugin behavior and screenshots under `docs/assets/` and root `screenshot.png`
- Animated demo: `docs/assets/todoseq-task-entry.gif`
- Light/dark product stills: `docs/assets/todoseq-screenshot-light.png`, `docs/assets/todoseq-screenshot-dark.png`
- Docs home and guides under `docs/`
- Manifest description: “Lightweight keyword-based task tracker using Logseq style keywords.”
- Absence to respect: no official customer logos, testimonials, or published usage metrics — do not fabricate them

## Product Principles

1. Tasks live in notes as plain text; the panel is a view, not a second database of record
2. Keywords are the interface — faster to type and more informative than checkbox on/off
3. Stay Obsidian-native in interaction and theming; personality comes from task language
4. Prefer progressive power (dates, urgency, search, embeds) over ceremony in the capture path
5. Keep docs and marketing claims equal to what the plugin actually does

## Accessibility & Inclusion

- Docs site must remain readable in light and dark themes and at mobile widths
- Primary CTAs need visible focus and adequate contrast
- Respect `prefers-reduced-motion` for animated product demos
- Plugin UI already follows Obsidian theme variables; docs should not invent a conflicting a11y floor
