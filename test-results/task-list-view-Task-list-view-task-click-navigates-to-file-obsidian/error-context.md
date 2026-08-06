# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: task-list-view.test.ts >> Task list view >> task click navigates to file
- Location: tests/integration/task-list-view.test.ts:73:3

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "inbox"
Received string:    "smart-date"
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
          - generic "inbox" [ref=e103]:
            - generic [ref=e104]:
              - generic [ref=e105]: inbox
              - generic "Close" [ref=e106]
          - generic "smart-date" [ref=e107]
        - generic "New tab" [ref=e111]
      - generic [ref=e119]:
        - generic [ref=e120]:
          - generic [ref=e122]:
            - button "Navigate back" [ref=e123]
            - button "Navigate forward" [disabled] [ref=e124]
          - generic [ref=e125]: inbox
          - generic [ref=e127]:
            - 'button "Current view: editing Click to read ⌘+Click to open to the right" [ref=e128]'
            - button "More options" [ref=e129]
        - generic [ref=e134]:
          - generic [ref=e135]: inbox
          - textbox [ref=e137]:
            - generic [ref=e138]: Inbox
            - generic [ref=e144]:
              - checkbox [ref=e146]
              - generic [ref=e147]:
                - mark [ref=e148] [cursor=pointer]: TODO
                - text: Buy groceries
            - generic [ref=e149]:
              - checkbox [ref=e151]
              - generic [ref=e152]:
                - mark [ref=e153] [cursor=pointer]: TODO
                - text: "Review PR #123"
            - generic [ref=e154]:
              - checkbox [checked] [ref=e156]
              - generic [ref=e157]:
                - mark [ref=e158] [cursor=pointer]: DONE
                - text: Write documentation
            - generic [ref=e159]:
              - checkbox [ref=e161]
              - generic [ref=e162]:
                - mark [ref=e163] [cursor=pointer]: WAITING
                - text: For feedback on proposal
    - generic [ref=e165]:
      - separator [ref=e166]
      - generic [ref=e167]:
        - generic [ref=e169]:
          - generic "Backlinks" [ref=e170]
          - generic "Outgoing links" [ref=e173]
          - generic "Tags" [ref=e176]
          - generic "All properties" [ref=e179]
          - generic "Outline" [ref=e182]
          - generic "TODOseq" [ref=e185]
        - generic [ref=e194]:
          - generic [ref=e195]:
            - generic [ref=e196]:
              - generic [ref=e197]: Search
              - generic [ref=e198]:
                - searchbox "Search tasks" [ref=e199]
                - generic "Match case" [ref=e200]
              - generic "Task List settings" [ref=e201]
            - generic [ref=e202]:
              - generic [ref=e203]: 26 of 26 tasks
              - combobox "Sort tasks by" [ref=e204]:
                - option "Default (file path)" [selected]
                - option "Scheduled date"
                - option "Deadline date"
                - option "Closed date"
                - option "Priority"
                - option "Urgency"
                - option "Keyword"
          - list [ref=e206]:
            - listitem [ref=e207]:
              - generic [ref=e209]:
                - checkbox [ref=e210]
                - generic [ref=e211]:
                  - button "TODO" [ref=e212] [cursor=pointer]
                  - text: Daily task 1
              - generic "daily/2026-08-06.md" [ref=e213]: 2026-08-06:3
            - listitem [ref=e214]:
              - generic [ref=e216]:
                - checkbox [ref=e217]
                - generic [ref=e218]:
                  - button "TODO" [ref=e219] [cursor=pointer]
                  - text: Buy groceries
              - generic "inbox.md" [ref=e220]: inbox:3
            - listitem [ref=e221]:
              - generic [ref=e223]:
                - checkbox [ref=e224]
                - generic [ref=e225]:
                  - button "TODO" [ref=e226] [cursor=pointer]
                  - text: "Review PR #123"
              - generic "inbox.md" [ref=e227]: inbox:4
            - listitem [ref=e228]:
              - generic [ref=e230]:
                - checkbox [checked] [ref=e231]
                - generic [ref=e232]:
                  - button "DONE" [ref=e233] [cursor=pointer]
                  - text: Write documentation
              - generic "inbox.md" [ref=e234]: inbox:5
            - listitem [ref=e235]:
              - generic [ref=e237]:
                - checkbox [ref=e238]
                - generic [ref=e239]:
                  - button "WAITING" [ref=e240] [cursor=pointer]
                  - text: For feedback on proposal
              - generic "inbox.md" [ref=e241]: inbox:6
            - listitem [ref=e242]:
              - generic [ref=e244]:
                - checkbox [ref=e245]
                - generic [ref=e246]:
                  - button "TODO" [ref=e247] [cursor=pointer]
                  - text: Implement feature A
              - generic "projects/alpha.md" [ref=e248]: alpha:3
            - listitem [ref=e249]:
              - generic [ref=e251]:
                - checkbox [ref=e252]
                - generic [ref=e253]:
                  - button "TODO" [ref=e254] [cursor=pointer]
                  - text: Fix bug in module B
              - generic "projects/alpha.md" [ref=e255]: alpha:4
            - listitem [ref=e256]:
              - generic [ref=e258]:
                - checkbox [checked] [ref=e259]
                - generic [ref=e260]:
                  - button "DONE" [ref=e261] [cursor=pointer]
                  - text: Deploy to staging
              - generic "projects/alpha.md" [ref=e262]: alpha:5
            - listitem [ref=e263]:
              - generic [ref=e265]:
                - checkbox [ref=e266]
                - generic [ref=e267]:
                  - button "TODO" [ref=e268] [cursor=pointer]
                  - text: Daily deadline task
              - generic [ref=e271]:
                - generic [ref=e272]: "Deadline:"
                - 'generic "Deadline: Today (Aug 6, 2026)" [ref=e273]': Today
                - 'generic "Advanced notice: -3d (appears 3 days ago)" [ref=e274]': ←
                - 'generic "Repeats: Every 1 day" [ref=e276]'
              - generic "recurrence-deadline.md" [ref=e277]: recurrence-deadline:3
            - listitem [ref=e278]:
              - generic [ref=e280]:
                - checkbox [ref=e281]
                - generic [ref=e282]:
                  - button "DOING" [ref=e283] [cursor=pointer]
                  - text: Recurring DOING task
              - generic [ref=e286]:
                - generic [ref=e287]: "Scheduled:"
                - 'generic "Scheduled: Today (Aug 6, 2026)" [ref=e288]': Today
                - 'generic "Repeats: Every 1 month" [ref=e290]'
              - generic "recurrence-doing.md" [ref=e291]: recurrence-doing:3
            - listitem [ref=e292]:
              - generic [ref=e294]:
                - checkbox [ref=e295]
                - generic [ref=e296]:
                  - button "TODO" [ref=e297] [cursor=pointer]
                  - text: Recurring daily task
              - generic [ref=e300]:
                - generic [ref=e301]: "Scheduled:"
                - 'generic "Scheduled: Today (Aug 6, 2026)" [ref=e302]': Today
                - 'generic "Repeats: Every 1 day" [ref=e304]'
              - generic "recurrence.md" [ref=e305]: recurrence:3
            - listitem [ref=e306]:
              - generic [ref=e308]:
                - checkbox [ref=e309]
                - generic [ref=e310]:
                  - button "TODO" [ref=e311] [cursor=pointer]
                  - text: Type a task with natural date here
              - generic "smart-date.md" [ref=e312]: smart-date:3
            - listitem [ref=e313]:
              - generic [ref=e315]:
                - checkbox [ref=e316]
                - generic [ref=e317]:
                  - button "TODO" [ref=e318] [cursor=pointer]
                  - text: State cycling task
              - generic "states.md" [ref=e319]: states:3
            - listitem [ref=e320]:
              - generic [ref=e322]:
                - checkbox [ref=e323]
                - generic [ref=e324]:
                  - button "DOING" [ref=e325] [cursor=pointer]
                  - text: In-progress task
              - generic "states.md" [ref=e326]: states:4
            - listitem [ref=e327]:
              - generic [ref=e329]:
                - checkbox [checked] [ref=e330]
                - generic [ref=e331]:
                  - button "DONE" [ref=e332] [cursor=pointer]
                  - text: Completed task
              - generic "states.md" [ref=e333]: states:5
            - listitem [ref=e334]:
              - generic [ref=e336]:
                - checkbox [ref=e337]
                - generic [ref=e338]:
                  - button "WAITING" [ref=e339] [cursor=pointer]
                  - text: Blocked task
              - generic "states.md" [ref=e340]: states:6
            - listitem [ref=e341]:
              - generic [ref=e343]:
                - checkbox [ref=e344]
                - generic [ref=e345]:
                  - button "TODO" [ref=e346] [cursor=pointer]
                  - text: Table task one
              - generic "table-tasks.md" [ref=e347]: table-tasks:5.1
            - listitem [ref=e348]:
              - generic [ref=e350]:
                - checkbox [ref=e351]
                - generic [ref=e352]:
                  - button "DOING" [ref=e353] [cursor=pointer]
                  - text: Table task two with description
              - generic [ref=e354]: Task two has a description
              - generic "table-tasks.md" [ref=e357]: table-tasks:6.1
            - listitem [ref=e358]:
              - generic [ref=e360]:
                - checkbox [checked] [ref=e361]
                - generic [ref=e362]:
                  - button "DONE" [ref=e363] [cursor=pointer]
                  - text: Table task three
              - generic "table-tasks.md" [ref=e364]: table-tasks:7.1
            - listitem [ref=e365]:
              - generic [ref=e367]:
                - checkbox [ref=e368]
                - generic [ref=e369]:
                  - button "WAITING" [ref=e370] [cursor=pointer]
                  - text: Table task four
              - generic "table-tasks.md" [ref=e371]: table-tasks:8.1
            - listitem [ref=e372]:
              - generic [ref=e374]:
                - checkbox [ref=e375]
                - generic [ref=e376]:
                  - button "DOING" [ref=e377] [cursor=pointer]
                  - generic "Priority high" [ref=e378]: A
                  - text: four
              - generic "table-tasks.md" [ref=e379]: table-tasks:14.1
            - listitem [ref=e380]:
              - generic [ref=e382]:
                - checkbox [ref=e383]
                - generic [ref=e384]:
                  - button "NOW" [ref=e385] [cursor=pointer]
                  - generic "Priority medium" [ref=e386]: B
                  - text: five
              - generic [ref=e387]:
                - generic [ref=e389]:
                  - generic [ref=e390]: "Scheduled:"
                  - 'generic "Scheduled: 29 days ago (Jul 8, 2026)" [ref=e391]': 29 days ago
                - generic [ref=e393]:
                  - generic [ref=e394]: "Deadline:"
                  - 'generic "Deadline: 21 days ago (Jul 16, 2026)" [ref=e395]': 21 days ago
              - generic "table-tasks.md" [ref=e396]: table-tasks:14.2
            - listitem [ref=e397]:
              - generic [ref=e399]:
                - checkbox [ref=e400]
                - generic [ref=e401]:
                  - button "IN-PROGRESS" [ref=e402] [cursor=pointer]
                  - generic "Priority low" [ref=e403]: C
                  - text: six
              - generic [ref=e404]:
                - generic [ref=e406]:
                  - generic [ref=e407]: "Scheduled:"
                  - 'generic "Scheduled: 22 days ago (Jul 15, 2026)" [ref=e408]': 22 days ago
                  - 'generic "Repeats: Every 1 year (from done)" [ref=e410]'
                - generic [ref=e412]:
                  - generic [ref=e413]: "Deadline:"
                  - 'generic "Deadline: 22 days ago (Jul 15, 2026)" [ref=e414]': 22 days ago
              - generic "table-tasks.md" [ref=e415]: table-tasks:14.3
            - listitem [ref=e416]:
              - generic [ref=e418]:
                - checkbox [ref=e419]
                - generic [ref=e420]:
                  - button "TODO" [ref=e421] [cursor=pointer]
                  - text: Property task one
              - generic "with-properties.md" [ref=e422]: with-properties:9
            - listitem [ref=e423]:
              - generic [ref=e425]:
                - checkbox [ref=e426]
                - generic [ref=e427]:
                  - button "DOING" [ref=e428] [cursor=pointer]
                  - text: Property task two
              - generic "with-properties.md" [ref=e429]: with-properties:10
            - listitem [ref=e430]:
              - generic [ref=e432]:
                - checkbox [checked] [ref=e433]
                - generic [ref=e434]:
                  - button "DONE" [ref=e435] [cursor=pointer]
                  - text: Property task three
              - generic "with-properties.md" [ref=e436]: with-properties:11
          - status [ref=e437]
  - generic [ref=e438]:
    - generic [ref=e439]: 0 backlinks
    - generic "Live Preview" [ref=e440]
    - generic [ref=e442]:
      - generic [ref=e443]: 12 words
      - generic [ref=e444]: 65 characters
    - generic "Uninitialized" [ref=e445]
    - generic [ref=e448]: 1 task
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { getPage } from './helpers/session';
  3   | import { resetVaultState } from './helpers/test-reset';
  4   | import {
  5   |   openTodoseqPanel,
  6   |   getTaskCount,
  7   |   waitForTaskListVisible,
  8   | } from './helpers/assertions';
  9   | import { Page } from 'playwright';
  10  | 
  11  | let page: Page;
  12  | 
  13  | test.beforeAll(async () => {
  14  |   page = await getPage();
  15  | });
  16  | 
  17  | test.describe('Task list view', () => {
  18  |   test.beforeEach(async () => {
  19  |     await resetVaultState(page);
  20  |     await openTodoseqPanel(page);
  21  |     await waitForTaskListVisible(page);
  22  |   });
  23  | 
  24  |   test('shows tasks from all files', async () => {
  25  |     const taskCount = await getTaskCount(page);
  26  |     expect(taskCount).toBeGreaterThan(5);
  27  | 
  28  |     const bodyText = await page.locator('.todoseq-task-list').textContent();
  29  |     expect(bodyText).toContain('Buy groceries');
  30  |     expect(bodyText).toContain('Implement feature A');
  31  |     expect(bodyText).toContain('Daily task 1');
  32  |   });
  33  | 
  34  |   test('search filters tasks by text', async () => {
  35  |     const totalCount = await getTaskCount(page);
  36  | 
  37  |     const searchInput = page.locator('input[aria-label="Search tasks"]');
  38  |     await searchInput.fill('groceries');
  39  |     await page.waitForTimeout(500);
  40  | 
  41  |     const filteredCount = await getTaskCount(page);
  42  |     expect(filteredCount).toBeLessThan(totalCount);
  43  |     expect(filteredCount).toBeGreaterThanOrEqual(1);
  44  | 
  45  |     const bodyText = await page.locator('.todoseq-task-list').textContent();
  46  |     expect(bodyText).toContain('Buy groceries');
  47  |     expect(bodyText).not.toContain('Implement feature A');
  48  | 
  49  |     await searchInput.fill('');
  50  |     await page.waitForTimeout(500);
  51  |     const restoredCount = await getTaskCount(page);
  52  |     expect(restoredCount).toBe(totalCount);
  53  |   });
  54  | 
  55  |   test('search filters tasks by state DONE', async () => {
  56  |     const totalCount = await getTaskCount(page);
  57  | 
  58  |     const searchInput = page.locator('input[aria-label="Search tasks"]');
  59  |     await searchInput.fill('state:DONE');
  60  |     await page.waitForTimeout(500);
  61  | 
  62  |     const filteredCount = await getTaskCount(page);
  63  |     expect(filteredCount).toBeGreaterThanOrEqual(1);
  64  |     expect(filteredCount).toBeLessThan(totalCount);
  65  | 
  66  |     const bodyText = await page.locator('.todoseq-task-list').textContent();
  67  |     expect(bodyText).toContain('Write documentation');
  68  | 
  69  |     await searchInput.fill('');
  70  |     await page.waitForTimeout(500);
  71  |   });
  72  | 
  73  |   test('task click navigates to file', async () => {
  74  |     // Close any dropdowns that may be intercepting clicks.
  75  |     await page.evaluate(() => {
  76  |       document.querySelectorAll('.todoseq-dropdown.show').forEach((el) => {
  77  |         el.classList.remove('show');
  78  |       });
  79  |     });
  80  |     await page.waitForTimeout(200);
  81  | 
  82  |     const taskItem = page.locator('.todoseq-task-item', {
  83  |       hasText: 'Buy groceries',
  84  |     });
  85  |     await taskItem.click({ force: true });
  86  |     await page.waitForTimeout(1000);
  87  | 
  88  |     const activeFile = await page
  89  |       .locator('.workspace-leaf.mod-active .view-header-title')
  90  |       .textContent();
> 91  |     expect(activeFile).toContain('inbox');
      |                        ^ Error: expect(received).toContain(expected) // indexOf
  92  |   });
  93  | 
  94  |   test('sort dropdown changes task order', async () => {
  95  |     const getAllTaskTexts = async (): Promise<string[]> => {
  96  |       const items = page.locator('.todoseq-task-item');
  97  |       return items.allTextContents();
  98  |     };
  99  | 
  100 |     const orderBefore = await getAllTaskTexts();
  101 | 
  102 |     const sortDropdown = page.locator('select[aria-label="Sort tasks by"]');
  103 |     await sortDropdown.selectOption('sortByKeyword');
  104 |     await page.waitForTimeout(500);
  105 | 
  106 |     const orderAfter = await getAllTaskTexts();
  107 | 
  108 |     // Keyword sort groups by state (active > inactive > waiting > completed),
  109 |     // so the overall order should differ from the default filepath sort.
  110 |     // Compare full task lists rather than just the first item.
  111 |     expect(orderAfter).not.toEqual(orderBefore);
  112 | 
  113 |     await sortDropdown.selectOption('default');
  114 |     await page.waitForTimeout(500);
  115 |   });
  116 | });
  117 | 
```