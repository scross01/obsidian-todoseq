# Introduction to TODOseq

## What is TODOseq?

TODOseq ("to-do-seek") is a lightweight, keyword-based task management plugin for Obsidian that brings the power of Logseq-style task tracking to your knowledge base. Unlike traditional checkbox-based task managers, TODOseq uses simple state keywords to define and manage tasks throughout your vault.

## Task Management Philosophy

TODOseq is inspired by the task management approaches used in [Logseq](https://docs.logseq.com/#/page/tasks) and [orgmode](https://orgmode.org/) where tasks are captured in context with the notes and journals they relate to. This allows for a more natural and flexible workflow, where tasks can be easily created, updated, and tracked without disrupting your note-taking process.

TODOseq scans your vault for lines that begin with specific keywords, extracts them, and presents them in a dedicated Task View panel within Obsidian. This approach allows you to maintain your existing note structure while gaining powerful task management capabilities.

### 1. Natural Language Task Capture

Instead of requiring specific checkbox syntax like `- [ ]`, TODOseq allows you to capture tasks using natural language keywords:

```markdown
TODO Write documentation
DOING Update sync script  
DONE Triage customer feedback
```

This approach is faster to type and more natural when taking notes or journaling.

### 2. State-Based Workflow

Tasks progress through defined state sequences rather than just being "checked" or "unchecked":

- **Basic workflow**: TODO → DOING → DONE → TODO
- **Deferred tasks**: LATER → NOW → DONE
- **Waiting tasks**: WAIT → IN-PROGRESS → DONE

### 3. Task priority and scheduling

```markdown
TODO Simple task

TODO [#A] Task with high priority
TODO [#B] Task with medium and scheduled date
SCHEDULED: <2025-01-15>

TODO [#C] Task with low priority and deadline date/time
DEADLINE: <2025-01-20 17:00>
```

## Why Use Keywords Instead of Checkboxes?

### Advantages of Keyword-Based Tasks

1. **Faster to type**: `TODO` is quicker than `- [ ]`
2. **More expressive**: State keywords convey more information than just checked/unchecked
3. **Better for note-taking**: Flows naturally in journaling and brainstorming
4. **Easier to read**: State is immediately visible without scanning for checkboxes
5. **More flexible**: Supports complex workflows beyond just todo/done

### When Checkboxes Are Still Useful

TODOseq supports can work with existing checkbox-based tasks when a task state keyword is added after the checkbox. For example:

```markdown
- [ ] TODO this is a task
- [ ] DOING this is an in progress task  
- [x] DONE this is a completed task
```

The checkbox state is automatically synchronized with the task's completion state when updated in the task view.

Checkboxes without the keywords are ignored by TODOseq. This allows you to mix traditional checkbox tasks with keyword-based tasks if desired.

```markdown
- [ ] DOING this task is tracked by TODOseq
    - [ ] subtask whithout state not tracked by TODOseq
    - [x] another untracked subtask
    - [ ] TODO important subtask tracked by TODOseq
```

## Logseq Compatibility

TODOseq is designed to be compatible with Logseq's task format, making it ideal If you're migrating your Logseq markdown files Obsidian, or even if you want to use both tools together. Existing task entries should work without modification:

### Dual Use

TODOseq allows you to maintain the same task format across both Logseq and Obsidian:

- **Same syntax**: All Logseq task patterns are supported
- **Same state sequences**: Task state transitions work identically
- **Same priority system**: `[#A]`, `[#B]`, `[#C]` tokens work the same
- **Same date formats**: SCHEDULED and DEADLINE dates are parsed identically

Some TODOseq features are not available in Logseq, the use of checkboxes before the task keyword, the use of custom state keywords, and the capture of tasks within code, quotes, and callouts blocks will not get identified as tasks if you return to Logseq.

*Note: the Logseq import relates to the original Markdown based version of Logseq. Migration from the newer Logseq database version format has not been tested.

## Getting Started

For detailed usage guides, see:

- [Task Entry Structure](task-entry.md) - Learn about task syntax and formats
- [Task View](task-view.md) - Understand how to use the dedicated task panel
- [Search Functionality](search.md) - Master advanced task filtering
