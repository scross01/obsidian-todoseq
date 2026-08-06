# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: table-tasks.test.ts >> Table cell tasks (experimental) >> keyword menu changes state for multi-column table cells
- Location: tests/integration/table-tasks.test.ts:243:3

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "DONE [#B] five<br>DEADLINE:"
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
| DONE [#A] four | NOW [#B] five<br>DEADLINE: <2026-07-16 Thu><br>SCHEDULED: <2026-07-08 Wed> | IN-PROGRESS [#C] six<br>SCHEDULED: <2026-07-15 Wed 10:00 .+1y><br>DEADLINE: <2026-07-15 Wed> |
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
                  - button "TODO" [ref=e333] [cursor=pointer]
                  - text: Table task one
              - generic "table-tasks.md" [ref=e334]: table-tasks:5.1
            - listitem [ref=e335]:
              - generic [ref=e337]:
                - checkbox [checked] [ref=e338]
                - generic [ref=e339]:
                  - button "DONE" [ref=e340] [cursor=pointer]
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
                  - button "NOW" [ref=e364] [cursor=pointer]
                  - generic "Priority medium" [ref=e365]: B
                  - text: five
              - generic [ref=e366]:
                - generic [ref=e368]:
                  - generic [ref=e369]: "Scheduled:"
                  - 'generic "Scheduled: 29 days ago (Jul 8, 2026)" [ref=e370]': 29 days ago
                - generic [ref=e372]:
                  - generic [ref=e373]: "Deadline:"
                  - 'generic "Deadline: 21 days ago (Jul 16, 2026)" [ref=e374]': 21 days ago
              - generic "table-tasks.md" [ref=e375]: table-tasks:14.2
            - listitem [ref=e376]:
              - generic [ref=e378]:
                - checkbox [ref=e379]
                - generic [ref=e380]:
                  - button "IN-PROGRESS" [ref=e381] [cursor=pointer]
                  - generic "Priority low" [ref=e382]: C
                  - text: six
              - generic [ref=e383]:
                - generic [ref=e385]:
                  - generic [ref=e386]: "Scheduled:"
                  - 'generic "Scheduled: 22 days ago (Jul 15, 2026)" [ref=e387]': 22 days ago
                  - 'generic "Repeats: Every 1 year (from done)" [ref=e389]'
                - generic [ref=e391]:
                  - generic [ref=e392]: "Deadline:"
                  - 'generic "Deadline: 22 days ago (Jul 15, 2026)" [ref=e393]': 22 days ago
              - generic "table-tasks.md" [ref=e394]: table-tasks:14.3
            - listitem [ref=e395]:
              - generic [ref=e397]:
                - checkbox [checked] [ref=e398]
                - generic [ref=e399]:
                  - button "DONE" [ref=e400] [cursor=pointer]
                  - generic "Priority high" [ref=e401]: A
                  - text: four
              - generic "table-tasks.md" [ref=e402]: table-tasks:14.1
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
      - generic [ref=e431]: 1,048 characters
    - generic "Uninitialized" [ref=e432]
    - generic [ref=e435]: 1 task
```

# Test source

```ts
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
  248 |       const leaf = app.workspace.getLeaf('tab');
  249 |       await leaf.openFile(file);
  250 |     });
  251 | 
  252 |     // Find the NOW keyword directly (unique in the fixture).
  253 |     const keyword = page
  254 |       .locator('.workspace-leaf.mod-active .todoseq-keyword-formatted')
  255 |       .filter({ hasText: 'NOW' });
  256 |     await keyword.waitFor({ state: 'visible', timeout: 10_000 });
  257 |     await page.waitForTimeout(300);
  258 | 
  259 |     await keyword.click({ button: 'right' });
  260 |     await page
  261 |       .locator('.menu .menu-item-title', { hasText: 'DONE' })
  262 |       .first()
  263 |       .waitFor({ state: 'visible', timeout: 5_000 });
  264 |     await page
  265 |       .locator('.menu .menu-item-title', { hasText: 'DONE' })
  266 |       .first()
  267 |       .click();
  268 | 
  269 |     await page.waitForTimeout(600);
  270 |     const content = await readEditorContent(page);
> 271 |     expect(content).toContain('DONE [#B] five<br>DEADLINE:');
      |                     ^ Error: expect(received).toContain(expected) // indexOf
  272 |     expect(content).not.toContain('NOW [#B] five');
  273 |   });
  274 | });
  275 | 
```