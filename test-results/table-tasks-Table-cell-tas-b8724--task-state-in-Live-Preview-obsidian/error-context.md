# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: table-tasks.test.ts >> Table cell tasks (experimental) >> keyword menu changes table cell task state in Live Preview
- Location: tests/integration/table-tasks.test.ts:104:3

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "DOING Table task one"
Received string:    "# Table Tasks Test·
| Task | Status | Priority |
|------|--------|----------|
| TODO Table task one | | |
| DOING Table task two with description<br>DESCRIPTION: Task two has a description | | |
| DONE Table task three | | |
| WAITING Table task four | | |·
## Multi-column table·
| ONE             | TWO                                                                        | THREE                                                                                        |
| --------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| DOING [#A] four | NOW [#B] five<br>DEADLINE: <2026-07-16 Thu><br>SCHEDULED: <2026-07-08 Wed> | IN-PROGRESS [#C] six<br>SCHEDULED: <2026-07-15 Wed 10:00 .+1y><br>DEADLINE: <2026-07-15 Wed> |
| seven           | eight                                                                      | nine                                                                                         |
"
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - generic [ref=e6]:
      - generic "Open quick switcher" [ref=e7]
      - generic "Open graph view" [ref=e8]
      - generic "Create new canvas" [ref=e9]
      - generic "Open today's daily note" [ref=e10]
      - generic "Insert template" [ref=e11]
      - generic "Open command palette" [ref=e12]
      - generic "Create new base" [ref=e13]
    - generic [ref=e14]:
      - separator [ref=e15]
      - generic [ref=e16]: test-vault
      - generic [ref=e29]:
        - generic [ref=e31]:
          - generic "Files" [ref=e32]
          - generic "Search" [ref=e35]
          - generic "Bookmarks" [ref=e38]
        - generic [ref=e46]:
          - generic [ref=e48]:
            - generic "New note" [ref=e49]
            - generic "New folder" [ref=e50]
            - generic "Change sort order" [ref=e51]
            - generic "Auto-reveal current file" [ref=e52]
            - generic "Expand all" [ref=e53]
          - generic [ref=e55]:
            - generic [ref=e57]: daily
            - generic [ref=e63]: projects
            - generic [ref=e69]: embedded-demo
            - generic [ref=e72]: external-change
            - generic [ref=e75]: inbox
            - generic [ref=e78]: recurrence
            - generic [ref=e81]: recurrence-deadline
            - generic [ref=e84]: recurrence-doing
            - generic [ref=e87]: smart-date
            - generic [ref=e90]: states
            - generic [ref=e93]: table-tasks
            - generic [ref=e96]: with-properties
    - generic [ref=e100]:
      - generic [ref=e101]:
        - generic [ref=e102]:
          - generic "embedded-demo" [ref=e103]
          - generic "smart-date" [ref=e106]:
            - generic [ref=e107]:
              - generic [ref=e108]: smart-date
              - generic "Close" [ref=e109]
          - generic "table-tasks" [ref=e110]
        - generic "New tab" [ref=e114]
      - generic [ref=e122]:
        - generic [ref=e123]:
          - generic [ref=e125]:
            - button "Navigate back" [ref=e126]
            - button "Navigate forward" [disabled] [ref=e127]
          - generic [ref=e128]: smart-date
          - generic [ref=e130]:
            - 'button "Current view: editing Click to read ⌘+Click to open to the right" [ref=e131]'
            - button "More options" [ref=e132]
        - generic [ref=e137]:
          - generic [ref=e138]: smart-date
          - textbox [active] [ref=e140]:
            - generic [ref=e141]: Smart Date Test
            - generic [ref=e146]:
              - checkbox [ref=e148]
              - generic [ref=e149]:
                - mark [ref=e150] [cursor=pointer]: TODO
                - text: Type a task with natural date here
    - generic [ref=e152]:
      - separator [ref=e153]
      - generic [ref=e154]:
        - generic [ref=e156]:
          - generic "Backlinks" [ref=e157]
          - generic "Outgoing links" [ref=e160]
          - generic "Tags" [ref=e163]
          - generic "All properties" [ref=e166]
          - generic "Outline" [ref=e169]
          - generic "TODOseq" [ref=e172]
        - generic [ref=e181]:
          - generic [ref=e182]:
            - generic [ref=e183]:
              - generic [ref=e184]: Search
              - generic [ref=e185]:
                - searchbox "Search tasks" [ref=e186]
                - generic "Match case" [ref=e187]
              - generic "Task List settings" [ref=e188]
            - generic [ref=e189]:
              - generic [ref=e190]: 26 of 26 tasks
              - combobox "Sort tasks by" [ref=e191]:
                - option "Default (file path)" [selected]
                - option "Scheduled date"
                - option "Deadline date"
                - option "Closed date"
                - option "Priority"
                - option "Urgency"
                - option "Keyword"
          - list [ref=e193]:
            - listitem [ref=e194]:
              - generic [ref=e196]:
                - checkbox [ref=e197]
                - generic [ref=e198]:
                  - button "TODO" [ref=e199] [cursor=pointer]
                  - text: Daily task 1
              - generic "daily/2026-08-06.md" [ref=e200]: 2026-08-06:3
            - listitem [ref=e201]:
              - generic [ref=e203]:
                - checkbox [ref=e204]
                - generic [ref=e205]:
                  - button "TODO" [ref=e206] [cursor=pointer]
                  - text: Buy groceries
              - generic "inbox.md" [ref=e207]: inbox:3
            - listitem [ref=e208]:
              - generic [ref=e210]:
                - checkbox [ref=e211]
                - generic [ref=e212]:
                  - button "TODO" [ref=e213] [cursor=pointer]
                  - text: "Review PR #123"
              - generic "inbox.md" [ref=e214]: inbox:4
            - listitem [ref=e215]:
              - generic [ref=e217]:
                - checkbox [checked] [ref=e218]
                - generic [ref=e219]:
                  - button "DONE" [ref=e220] [cursor=pointer]
                  - text: Write documentation
              - generic "inbox.md" [ref=e221]: inbox:5
            - listitem [ref=e222]:
              - generic [ref=e224]:
                - checkbox [ref=e225]
                - generic [ref=e226]:
                  - button "WAITING" [ref=e227] [cursor=pointer]
                  - text: For feedback on proposal
              - generic "inbox.md" [ref=e228]: inbox:6
            - listitem [ref=e229]:
              - generic [ref=e231]:
                - checkbox [ref=e232]
                - generic [ref=e233]:
                  - button "TODO" [ref=e234] [cursor=pointer]
                  - text: Implement feature A
              - generic "projects/alpha.md" [ref=e235]: alpha:3
            - listitem [ref=e236]:
              - generic [ref=e238]:
                - checkbox [ref=e239]
                - generic [ref=e240]:
                  - button "TODO" [ref=e241] [cursor=pointer]
                  - text: Fix bug in module B
              - generic "projects/alpha.md" [ref=e242]: alpha:4
            - listitem [ref=e243]:
              - generic [ref=e245]:
                - checkbox [checked] [ref=e246]
                - generic [ref=e247]:
                  - button "DONE" [ref=e248] [cursor=pointer]
                  - text: Deploy to staging
              - generic "projects/alpha.md" [ref=e249]: alpha:5
            - listitem [ref=e250]:
              - generic [ref=e252]:
                - checkbox [ref=e253]
                - generic [ref=e254]:
                  - button "TODO" [ref=e255] [cursor=pointer]
                  - text: Daily deadline task
              - generic [ref=e258]:
                - generic [ref=e259]: "Deadline:"
                - 'generic "Deadline: Today (Aug 6, 2026)" [ref=e260]': Today
                - 'generic "Advanced notice: -3d (appears 3 days ago)" [ref=e261]': ←
                - 'generic "Repeats: Every 1 day" [ref=e263]'
              - generic "recurrence-deadline.md" [ref=e264]: recurrence-deadline:3
            - listitem [ref=e265]:
              - generic [ref=e267]:
                - checkbox [ref=e268]
                - generic [ref=e269]:
                  - button "DOING" [ref=e270] [cursor=pointer]
                  - text: Recurring DOING task
              - generic [ref=e273]:
                - generic [ref=e274]: "Scheduled:"
                - 'generic "Scheduled: Today (Aug 6, 2026)" [ref=e275]': Today
                - 'generic "Repeats: Every 1 month" [ref=e277]'
              - generic "recurrence-doing.md" [ref=e278]: recurrence-doing:3
            - listitem [ref=e279]:
              - generic [ref=e281]:
                - checkbox [ref=e282]
                - generic [ref=e283]:
                  - button "TODO" [ref=e284] [cursor=pointer]
                  - text: Recurring daily task
              - generic [ref=e287]:
                - generic [ref=e288]: "Scheduled:"
                - 'generic "Scheduled: Today (Aug 6, 2026)" [ref=e289]': Today
                - 'generic "Repeats: Every 1 day" [ref=e291]'
              - generic "recurrence.md" [ref=e292]: recurrence:3
            - listitem [ref=e293]:
              - generic [ref=e295]:
                - checkbox [ref=e296]
                - generic [ref=e297]:
                  - button "TODO" [ref=e298] [cursor=pointer]
                  - text: Type a task with natural date here
              - generic "smart-date.md" [ref=e299]: smart-date:3
            - listitem [ref=e300]:
              - generic [ref=e302]:
                - checkbox [ref=e303]
                - generic [ref=e304]:
                  - button "TODO" [ref=e305] [cursor=pointer]
                  - text: State cycling task
              - generic "states.md" [ref=e306]: states:3
            - listitem [ref=e307]:
              - generic [ref=e309]:
                - checkbox [ref=e310]
                - generic [ref=e311]:
                  - button "DOING" [ref=e312] [cursor=pointer]
                  - text: In-progress task
              - generic "states.md" [ref=e313]: states:4
            - listitem [ref=e314]:
              - generic [ref=e316]:
                - checkbox [checked] [ref=e317]
                - generic [ref=e318]:
                  - button "DONE" [ref=e319] [cursor=pointer]
                  - text: Completed task
              - generic "states.md" [ref=e320]: states:5
            - listitem [ref=e321]:
              - generic [ref=e323]:
                - checkbox [ref=e324]
                - generic [ref=e325]:
                  - button "WAITING" [ref=e326] [cursor=pointer]
                  - text: Blocked task
              - generic "states.md" [ref=e327]: states:6
            - listitem [ref=e328]:
              - generic [ref=e330]:
                - checkbox [ref=e331]
                - generic [ref=e332]:
                  - button "DOING" [ref=e333] [cursor=pointer]
                  - text: Table task one
              - generic "table-tasks.md" [ref=e334]: table-tasks:5.1
            - listitem [ref=e335]:
              - generic [ref=e337]:
                - checkbox [ref=e338]
                - generic [ref=e339]:
                  - button "DOING" [ref=e340] [cursor=pointer]
                  - text: Table task two with description
              - generic [ref=e341]: Task two has a description
              - generic "table-tasks.md" [ref=e344]: table-tasks:6.1
            - listitem [ref=e345]:
              - generic [ref=e347]:
                - checkbox [checked] [ref=e348]
                - generic [ref=e349]:
                  - button "DONE" [ref=e350] [cursor=pointer]
                  - text: Table task three
              - generic "table-tasks.md" [ref=e351]: table-tasks:7.1
            - listitem [ref=e352]:
              - generic [ref=e354]:
                - checkbox [ref=e355]
                - generic [ref=e356]:
                  - button "WAITING" [ref=e357] [cursor=pointer]
                  - text: Table task four
              - generic "table-tasks.md" [ref=e358]: table-tasks:8.1
            - listitem [ref=e359]:
              - generic [ref=e361]:
                - checkbox [ref=e362]
                - generic [ref=e363]:
                  - button "DOING" [ref=e364] [cursor=pointer]
                  - generic "Priority high" [ref=e365]: A
                  - text: four
              - generic "table-tasks.md" [ref=e366]: table-tasks:14.1
            - listitem [ref=e367]:
              - generic [ref=e369]:
                - checkbox [ref=e370]
                - generic [ref=e371]:
                  - button "NOW" [ref=e372] [cursor=pointer]
                  - generic "Priority medium" [ref=e373]: B
                  - text: five
              - generic [ref=e374]:
                - generic [ref=e376]:
                  - generic [ref=e377]: "Scheduled:"
                  - 'generic "Scheduled: 29 days ago (Jul 8, 2026)" [ref=e378]': 29 days ago
                - generic [ref=e380]:
                  - generic [ref=e381]: "Deadline:"
                  - 'generic "Deadline: 21 days ago (Jul 16, 2026)" [ref=e382]': 21 days ago
              - generic "table-tasks.md" [ref=e383]: table-tasks:14.2
            - listitem [ref=e384]:
              - generic [ref=e386]:
                - checkbox [ref=e387]
                - generic [ref=e388]:
                  - button "IN-PROGRESS" [ref=e389] [cursor=pointer]
                  - generic "Priority low" [ref=e390]: C
                  - text: six
              - generic [ref=e391]:
                - generic [ref=e393]:
                  - generic [ref=e394]: "Scheduled:"
                  - 'generic "Scheduled: 22 days ago (Jul 15, 2026)" [ref=e395]': 22 days ago
                  - 'generic "Repeats: Every 1 year (from done)" [ref=e397]'
                - generic [ref=e399]:
                  - generic [ref=e400]: "Deadline:"
                  - 'generic "Deadline: 22 days ago (Jul 15, 2026)" [ref=e401]': 22 days ago
              - generic "table-tasks.md" [ref=e402]: table-tasks:14.3
            - listitem [ref=e403]:
              - generic [ref=e405]:
                - checkbox [ref=e406]
                - generic [ref=e407]:
                  - button "TODO" [ref=e408] [cursor=pointer]
                  - text: Property task one
              - generic "with-properties.md" [ref=e409]: with-properties:9
            - listitem [ref=e410]:
              - generic [ref=e412]:
                - checkbox [ref=e413]
                - generic [ref=e414]:
                  - button "DOING" [ref=e415] [cursor=pointer]
                  - text: Property task two
              - generic "with-properties.md" [ref=e416]: with-properties:10
            - listitem [ref=e417]:
              - generic [ref=e419]:
                - checkbox [checked] [ref=e420]
                - generic [ref=e421]:
                  - button "DONE" [ref=e422] [cursor=pointer]
                  - text: Property task three
              - generic "with-properties.md" [ref=e423]: with-properties:11
          - status [ref=e424]
  - generic [ref=e425]:
    - generic [ref=e426]: 0 backlinks
    - generic "Live Preview" [ref=e427]
    - generic [ref=e429]:
      - generic [ref=e430]: 73 words
      - generic [ref=e431]: 1,049 characters
    - generic "Uninitialized" [ref=e432]
    - generic [ref=e435]: 1 task
```

# Test source

```ts
  47  |     const bodyText = await page.locator('.todoseq-task-list').textContent();
  48  |     expect(bodyText).toContain('Table task one');
  49  |     expect(bodyText).toContain('Table task two with description');
  50  |     expect(bodyText).toContain('Table task three');
  51  |     expect(bodyText).toContain('Table task four');
  52  |   });
  53  | 
  54  |   test('displays description icon for table cell tasks with descriptions', async () => {
  55  |     const descIcons = page.locator('.todoseq-task-description-icon');
  56  |     const count = await descIcons.count();
  57  |     expect(count).toBeGreaterThanOrEqual(1);
  58  |   });
  59  | 
  60  |   test('command palette cycle changes state for table cell task in editor', async () => {
  61  |     // Open in TRUE source mode so the cursor stays in the row: Live Preview
  62  |     // re-aligns the table on cursor placement and moves the cursor to the
  63  |     // header row, so the cycle command operates on the wrong line there.
  64  |     await page.evaluate(async () => {
  65  |       const app = (window as any).app;
  66  |       const file = app.vault.getAbstractFileByPath('table-tasks.md');
  67  |       const leaf = app.workspace.getLeaf('tab');
  68  |       await leaf.openFile(file, { state: { mode: 'source', source: true } });
  69  |     });
  70  | 
  71  |     await page.waitForTimeout(500);
  72  | 
  73  |     await page.evaluate(() => {
  74  |       const app = (window as any).app;
  75  |       const leaf = app.workspace.getMostRecentLeaf();
  76  |       const editor = leaf.view.editor;
  77  |       let line = -1;
  78  |       for (let i = 0; i < editor.lineCount(); i++) {
  79  |         if (editor.getLine(i).includes('Table task one')) {
  80  |           line = i;
  81  |           break;
  82  |         }
  83  |       }
  84  |       if (line === -1) throw new Error('table task line not found');
  85  |       // Cursor at end of the row: the cycle handler falls back to the first
  86  |       // task cell on the line.
  87  |       editor.setCursor({ line, ch: editor.getLine(line).length });
  88  |     });
  89  | 
  90  |     await page.evaluate(() => {
  91  |       const app = (window as any).app;
  92  |       const cmd = app.commands.executeCommandById.bind(app.commands);
  93  |       cmd('todoseq:cycle-task-state');
  94  |     });
  95  | 
  96  |     await page.waitForTimeout(500);
  97  | 
  98  |     // Read the live editor buffer — app.vault.read can return pre-edit content
  99  |     // until Obsidian's autosave flushes source-mode writes to disk.
  100 |     const content = await readEditorContent(page);
  101 |     expect(content).toContain('DOING Table task one');
  102 |   });
  103 | 
  104 |   test('keyword menu changes table cell task state in Live Preview', async () => {
  105 |     // Open in default Live Preview mode (not true source mode). Table keywords
  106 |     // render as styled spans inside Obsidian's .table-cell-wrapper tree.
  107 |     await page.evaluate(async () => {
  108 |       const app = (window as any).app;
  109 |       const file = app.vault.getAbstractFileByPath('table-tasks.md');
  110 |       if (!file) throw new Error('table-tasks.md not found');
  111 |       const leaf = app.workspace.getLeaf('tab');
  112 |       await leaf.openFile(file);
  113 |     });
  114 | 
  115 |     // Confirm we are really in Live Preview (getMode() === 'source' is true in
  116 |     // both Live Preview and true source mode).
  117 |     const isLivePreview = await page.evaluate(() => {
  118 |       const app = (window as any).app;
  119 |       const view = app.workspace.getMostRecentLeaf()?.view;
  120 |       const sourceView = view?.containerEl?.querySelector(
  121 |         '.markdown-source-view',
  122 |       );
  123 |       return sourceView?.classList.contains('is-live-preview') ?? false;
  124 |     });
  125 |     expect(isLivePreview).toBe(true);
  126 | 
  127 |     const keyword = page
  128 |       .locator(
  129 |         '.workspace-leaf.mod-active .table-cell-wrapper .todoseq-keyword-formatted[data-task-keyword="TODO"]',
  130 |       )
  131 |       .first();
  132 |     await keyword.waitFor({ state: 'visible', timeout: 10_000 });
  133 | 
  134 |     // Allow the plugin's file-open contextmenu handler to attach (100ms delay).
  135 |     await page.waitForTimeout(300);
  136 | 
  137 |     await keyword.click({ button: 'right' });
  138 | 
  139 |     const doingItem = page
  140 |       .locator('.menu .menu-item-title', { hasText: 'DOING' })
  141 |       .first();
  142 |     await doingItem.waitFor({ state: 'visible', timeout: 5_000 });
  143 |     await doingItem.click();
  144 | 
  145 |     await page.waitForTimeout(300);
  146 |     const content = await readEditorContent(page);
> 147 |     expect(content).toContain('DOING Table task one');
      |                     ^ Error: expect(received).toContain(expected) // indexOf
  148 |     expect(content).not.toContain('TODO Table task one');
  149 |   });
  150 | 
  151 |   test('keyword menu changes table cell task state in Live Preview for cell with description', async () => {
  152 |     await page.evaluate(async () => {
  153 |       const app = (window as any).app;
  154 |       const file = app.vault.getAbstractFileByPath('table-tasks.md');
  155 |       if (!file) throw new Error('table-tasks.md not found');
  156 |       const leaf = app.workspace.getLeaf('tab');
  157 |       await leaf.openFile(file);
  158 |     });
  159 | 
  160 |     // Scope to the row containing the description so the DOING keyword there
  161 |     // is not confused with other DOING cells.
  162 |     const descRow = page
  163 |       .locator('.workspace-leaf.mod-active tr')
  164 |       .filter({ hasText: 'DESCRIPTION:' });
  165 |     const keyword = descRow.locator(
  166 |       '.todoseq-keyword-formatted[data-task-keyword="DOING"]',
  167 |     );
  168 |     await keyword.waitFor({ state: 'visible', timeout: 10_000 });
  169 |     await page.waitForTimeout(300);
  170 | 
  171 |     await keyword.click({ button: 'right' });
  172 | 
  173 |     const doneItem = page
  174 |       .locator('.menu .menu-item-title', { hasText: 'DONE' })
  175 |       .first();
  176 |     await doneItem.waitFor({ state: 'visible', timeout: 5_000 });
  177 |     await doneItem.click();
  178 | 
  179 |     await page.waitForTimeout(300);
  180 |     const content = await readEditorContent(page);
  181 |     expect(content).toContain('DONE Table task two with description');
  182 |     expect(content).not.toContain('DOING Table task two with description');
  183 |   });
  184 | 
  185 |   test('keyword menu state change in Live Preview removes CLOSED date when un-completing', async () => {
  186 |     await page.evaluate(async () => {
  187 |       const app = (window as any).app;
  188 |       const file = app.vault.getAbstractFileByPath('table-tasks.md');
  189 |       if (!file) throw new Error('table-tasks.md not found');
  190 |       const leaf = app.workspace.getLeaf('tab');
  191 |       await leaf.openFile(file);
  192 |     });
  193 | 
  194 |     // First complete the DOING task to add a CLOSED date
  195 |     await page.evaluate(() => {
  196 |       const app = (window as any).app;
  197 |       const cmd = app.commands.executeCommandById.bind(app.commands);
  198 |       app.plugins.plugins.todoseq.settings.trackClosedDate = true;
  199 |       const editor = app.workspace.activeLeaf?.view?.editor;
  200 |       for (let i = 0; i < editor.lineCount(); i++) {
  201 |         if (editor.getLine(i).includes('DOING Table task two with description')) {
  202 |           editor.setCursor({ line: i, ch: 5 });
  203 |           break;
  204 |         }
  205 |       }
  206 |       cmd('todoseq:cycle-task-state');
  207 |     });
  208 |     await page.waitForTimeout(600);
  209 |     let content = await readEditorContent(page);
  210 |     expect(content).toContain('DONE Table task two with description');
  211 |     expect(content).toContain('CLOSED:');
  212 | 
  213 |     // Now un-complete: DONE → TODO. Find the DONE keyword in the
  214 |     // description row (the row whose cell also contains DESCRIPTION:).
  215 |     const descRow = page
  216 |       .locator('.workspace-leaf.mod-active tr')
  217 |       .filter({ hasText: 'DESCRIPTION:' });
  218 |     // The description row's DONE keyword is inside a .table-cell-wrapper.
  219 |     // Use the wrapper to scope the search.
  220 |     const keyword = descRow
  221 |       .locator('.table-cell-wrapper')
  222 |       .first()
  223 |       .locator('.todoseq-keyword-formatted[data-task-keyword="DONE"]');
  224 |     await keyword.waitFor({ state: 'visible', timeout: 10_000 });
  225 |     await page.waitForTimeout(300);
  226 | 
  227 |     await keyword.click({ button: 'right' });
  228 |     await page
  229 |       .locator('.menu .menu-item-title', { hasText: 'TODO' })
  230 |       .first()
  231 |       .waitFor({ state: 'visible', timeout: 5_000 });
  232 |     await page
  233 |       .locator('.menu .menu-item-title', { hasText: 'TODO' })
  234 |       .first()
  235 |       .click();
  236 | 
  237 |     await page.waitForTimeout(600);
  238 |     content = await readEditorContent(page);
  239 |     expect(content).toContain('TODO Table task two with description');
  240 |     expect(content).not.toContain('CLOSED:');
  241 |   });
  242 | 
  243 |   test('keyword menu changes state for multi-column table cells', async () => {
  244 |     await page.evaluate(async () => {
  245 |       const app = (window as any).app;
  246 |       const file = app.vault.getAbstractFileByPath('table-tasks.md');
  247 |       if (!file) throw new Error('table-tasks.md not found');
```