/** Embedded-list notes: a working embed, an empty result, and a bad option. */
export const EMBED_SEEDS: Record<string, string> = {
  'Embedded Demo.md': `An embedded list is a normal code block, so it can live anywhere a note does — and it keeps itself in step with the tasks it matches.

## Live embed

Tasks matching the embed below update live:

\`\`\`todoseq
search: tag:phoenix
sort: urgency
title: Phoenix Tasks
\`\`\`
`,
  'Empty Demo.md': `When a query matches nothing, the embed says so instead of rendering blank.

## No matches

\`\`\`todoseq
search: tag:nonexistent-tag-xyz
\`\`\`
`,
  'Error Demo.md': `An unusable option is reported in place rather than failing silently.

## Bad sort method

\`\`\`todoseq
sort: not-a-sort-option
\`\`\`
`,
};
