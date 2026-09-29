# Dashboards

Dashboard cards embed aggregated task counts directly in any note. Where an
[embedded task list](/embedded-task-lists) shows the tasks themselves, a
dashboard answers "where is my work concentrated?" — counts grouped by state,
priority, keyword, tag, or date bucket, with one-click drill-through into the
Task List.

Because cards aggregate with the same search engine the Task List uses, the
counts always agree with what the Task List shows for the same filter.

## Basic Usage

Create a code block with the `todoseq-dashboard` language:

````txt
```todoseq-dashboard
search: tag:project scheduled:due OR scheduled:overdue
group-by: priority
display: bar
title: Due & overdue
```
````

The card lists one row per group with a proportional bar and count. Click a
row to open the Task List with that group's filter applied; Cmd/Ctrl-click
opens it in a new tab.

## Code Block Parameters

- `search:` any valid search string (see [search](/search)). Tasks that do not
  match are excluded from the card before grouping. Defaults to all tasks
- `group-by:` one of `priority`, `state`, `keyword`, `tag`, `scheduled`, or
  `deadline`. Default is `state` (`group:` is an alias)
- `display:` one of `bar`, `column`, `donut`, `tiles`, or `heatmap`. Default is
  `bar`. `heatmap` requires `group-by: scheduled` or `deadline`
- `layout:` `card` (default) or `strip`. The strip layout drops the header and
  renders the query chip and group pills inline
- `title:` (optional) adds a custom title displayed above the card
- `show-query:` (optional) `show`, `hide`, `true`, or `false`. Controls the
  query chip under the title. Defaults to `show`
- `sort:` (optional) `fixed`, `count-desc`, `count-asc`, or `label`. Priority,
  state, and date buckets default to `fixed` (urgency order); keyword and tag
  default to `count-desc`
- `show-empty:` (optional) `show`, `hide`, `true`, or `false`. When enabled,
  groups with zero tasks are shown at 0 instead of being omitted. Defaults to
  `hide`
- `max-groups:` (optional) a positive integer. Truncates long tag/keyword
  lists and appends an "N more" footer. Defaults to `8`
- `color:` (optional) `semantic` (default) or `mono`. Semantic maps each
  attribute to its theme color (High red, overdue red, completed green, …);
  `mono` collapses all fills to accent steps
- `collapsed:` (optional) `true` or `false`. Starts the card collapsed behind
  its header. Defaults to `false`. Requires either `title:` to be set OR
  `show-query: true`
- `heatmap-window:` (optional) number of weeks for the heatmap window, 4–52.
  Defaults to `26`

Lines starting with `#` inside the block are treated as comments.

## Grouping

- **priority** — High / Medium / Low / None, from the task's `[#A]`/`[#B]`/`[#C]` token
- **state** — Active / Inactive / Waiting / Completed / Archived, using your
  [keyword settings](/settings) (never hardcoded)
- **keyword** — one column per task state actually present in the matched tasks
- **tag** — one group per tag. Tags can overlap, so column sums may exceed the
  card total; the header total explains this in its tooltip. The `#A`/`#B`/`#C`
  priority tags are excluded
- **scheduled** / **deadline** — five buckets in urgency order: Overdue,
  Due today, Next 7 days, Later, No date. Clicking a bucket opens the Task
  List with the matching date filter

## Display Forms

- **bar** — the default: one row per group with a color swatch, label, and a
  track filled proportionally to the largest group
- **column** — centered columns with the count above a rounded bar
- **donut** — an SVG ring with a legend; both slices and legend rows are
  clickable
- **tiles** — a responsive grid of tiles with the count in the group color
- **heatmap** — a GitHub-style calendar of upcoming due work (requires
  `group-by: scheduled` or `deadline`). Past days are dimmed, today is
  outlined, and each day is clickable. Use `heatmap-window:` to control how
  many weeks ahead are shown

Cards update automatically when tasks change anywhere in the vault — from the
editor, the Task List, other pages, or
[auto-archive](/auto-archive). When only counts change, the card patches its
numbers in place instead of redrawing, so hover, focus, and scroll survive.

On narrow panes and phones the layout adapts: labels truncate, the donut
legend drops below the ring, tiles wrap, and the heatmap scrolls horizontally.

## Examples

State pipeline as a donut:

````txt
```todoseq-dashboard
search: tag:work
group-by: state
display: donut
title: Work pipeline
```
````

Scheduled workload as tiles:

````txt
```todoseq-dashboard
group-by: scheduled
display: tiles
title: Scheduled workload
show-empty: show
```
````

Upcoming deadlines heatmap:

````txt
```todoseq-dashboard
group-by: deadline
display: heatmap
heatmap-window: 12
title: Due dates — next 3 months
```
````

Compact strip inline in a project note:

````txt
```todoseq-dashboard
search: tag:project
group-by: priority
layout: strip
```
````
