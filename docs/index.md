---
title: TODOseq for Obsidian
outline: false
---

<div class="ts-hero">
  <div class="ts-hero-copy">
    <h1 class="ts-h1">TODOseq for Obsidian</h1>
    <p class="ts-tagline">Keyword-based task management. No checkboxes required.</p>
    <p class="ts-sub">
      Scan your vault for plain lines that start with
      <code>TODO</code>, <code>DOING</code>, and <code>DONE</code>.
      Collect them into one Task List. Keep writing in ordinary notes —
      inspired by Emacs Org-mode and Logseq. Free and open source.
    </p>
    <p class="ts-ctas">
      <a class="ts-btn ts-btn-primary" href="https://obsidian.md/plugins?id=todoseq">Install TODOseq</a>
      <a class="ts-btn ts-btn-ghost" href="./introduction.html">View docs</a>
      <a class="ts-btn ts-btn-ghost" href="https://github.com/scross01/obsidian-todoseq">Star on GitHub</a>
    </p>
  </div>
  <div class="ts-hero-media ts-media">
    <img class="ts-hero-gif" src="./assets/todoseq-task-entry.gif" alt="Click a TODO keyword in Obsidian to cycle its task state" />
  </div>
</div>

## Why TODOseq?

<div class="ts-grid ts-grid-why">

<div class="ts-card">
<h3>No checkbox ceremony</h3>
<p>Write <code>TODO Write report</code> as a plain line anywhere in your vault. The keyword is the task.</p>
</div>

<div class="ts-card">
<h3>Org-mode &amp; Logseq friendly</h3>
<p>Existing Logseq lines work as-is. <code>SCHEDULED:</code> / <code>DEADLINE:</code> dates are supported. Dual-use a vault or migrate gradually.</p>
</div>

<div class="ts-card">
<h3>One Task List for the vault</h3>
<p>Search, urgency sort, priorities, natural-language dates, repeats, embedded lists, and code-comment TODOs — collected into a single panel.</p>
</div>

</div>

## Examples

Tasks are just lines in your notes:

```markdown
TODO [#A] Finish quarterly report #work tomorrow
SCHEDULED: <2026-01-31>

DOING [#B] Review pull requests #coding

DONE Submit expense report
```

Click any task keyword (or press `Ctrl+Enter`) to cycle its state in both Edit and Reading views, right in your note.

## Installation

### From Obsidian Community Plugins

1. Open **Settings → Community plugins** and make sure community plugins are enabled
2. Click **Browse**, search for **"TODOseq"**
3. Click **Install**, then **Enable**

Once enabled, the Task List opens in the right sidebar. You can always reopen it with the command palette: **TODOseq: Show task list**.

<a class="ts-btn ts-btn-primary" href="https://obsidian.md/plugins?id=todoseq">Install TODOseq from Obsidian</a>

<details>
<summary>Manual (development build)</summary>

1. Clone the repository into your vault's `.obsidian/plugins` directory
2. Run `npm install` and `npm run build` in the repository root
3. Enable the plugin in **Settings → Community plugins**

</details>

## Documentation

<div class="ts-grid ts-grid-docs">

<div class="ts-doc-group">
<h3>Start</h3>
<ul>
<li><a href="introduction.html">Introduction &amp; Philosophy</a><p>Task management approach and Logseq compatibility</p></li>
<li><a href="task-list.html">Task List</a><p>Using the dedicated task panel</p></li>
<li><a href="task-entry.html">Task Entry</a><p>Task syntax, keywords, and lifecycle</p></li>
</ul>
</div>

<div class="ts-doc-group">
<h3>Work in notes</h3>
<ul>
<li><a href="editor.html">Editor Integration</a><p>Task display and interaction in the Markdown editor</p></li>
<li><a href="reader.html">Reader View</a><p>Task styling and interaction in Reading mode</p></li>
<li><a href="embedded-task-lists.html">Embedded Task Lists</a><p>Render live task lists inside notes</p></li>
<li><a href="moving-tasks.html">Moving Tasks</a><p>Move tasks between notes and dates</p></li>
<li><a href="command-palette.html">Command Palette</a><p>Commands for common actions</p></li>
</ul>
</div>

<div class="ts-doc-group">
<h3>Configure</h3>
<ul>
<li><a href="search.html">Search</a><p>Advanced search syntax and filters</p></li>
<li><a href="settings.html">Settings</a><p>Configuration options and customization</p></li>
<li><a href="sort-methods.html">Sort Methods</a><p>How tasks are ordered in the panel</p></li>
<li><a href="urgency.html">Task Urgency</a><p>Urgency sorting and configuration</p></li>
<li><a href="warning-periods.html">Warning Periods</a><p>Control when tasks appear before their dates</p></li>
<li><a href="import.html">Import</a><p>Bring tasks in from other formats</p></li>
<li><a href="experimental-features.html">Experimental Features</a><p>Org-mode file support and more</p></li>
</ul>
</div>

</div>

## Contributing

TODOseq is free, open-source software.

- Found a bug? Open an [issue](https://github.com/scross01/obsidian-todoseq/issues)
- Want to improve it? See [Contributing](https://github.com/scross01/obsidian-todoseq/blob/main/CONTRIBUTING.md)

## License

MIT License - see [LICENSE](https://github.com/scross01/obsidian-todoseq/blob/main/LICENSE) for details.
