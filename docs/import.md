# Import Tasks

Existing markdown checkbox based tasks in the Obsidian Vault will not be recognized by TODOseq unless they already have a matching keyword after the checkbox

```markdown
- [ ] this is not recognised as a task

- [ ] TODO this is captured as a TODOseq task
```

## Manual Import

A simple way to bring existing tasks into TODOseq is to do a find and replace to add the `TODO` keyword.

For each page in the vault that you want to capture checkbox based tasks from:

Select **Edit > Replace** from the Obsidian menu

- Find "`- [ ] `"
- Replace "`- [ ] TODO `"

Click the **Replace All** button to add the keyword to all checkboxes in the page.
