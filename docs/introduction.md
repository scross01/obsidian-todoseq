# Introduction to TODOseq

## What is TODOseq?

TODOseq ("to-do-seek") is a lightweight, keyword-based task management plugin for Obsidian that brings the power of Logseq-style task tracking to your knowledge base. Unlike traditional checkbox-based task managers, TODOseq uses simple state keywords to define and manage tasks throughout your vault.

## Task Management Philosophy

TODOseq is inspired by the task management approaches used in [Logseq](https://docs.logseq.com/#/page/tasks) and [orgmode](https://orgmode.org/), focusing on:

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

TODO [#A] Complex task with priority
TODO [#B] Task with scheduled date
SCHEDULED: <2025-01-15>

TODO [#C] Task with deadline
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

TODOseq supports both formats and can work with existing checkbox-based tasks:

```markdown
- [ ] TODO this is a task
- [ ] DOING this is an in progress task  
- [x] DONE this is a completed task
```

The checkbox state is automatically synchronized with the task's completion state when updated in the task view.

## Logseq Compatibility

TODOseq is designed to be fully compatible with Logseq's task format, making it ideal for:

### Migration from Logseq

If you're migrating your Logseq markdown files from Logseq to Obsidian, your existing task files should work without modification:

### Dual Use Workflow

TODOseq allows you to maintain the same task format across both Logseq and Obsidian:

- **Same syntax**: All Logseq task patterns are supported
- **Same state sequences**: Task state transitions work identically
- **Same priority system**: `[#A]`, `[#B]`, `[#C]` tokens work the same
- **Same date formats**: SCHEDULED and DEADLINE dates are parsed identically

## Target Audience

TODOseq is ideal for:

- **Logseq users migrating to Obsidian** who want to keep their task format
- **Orgmode users** who prefer keyword-based task management
- **Journalers and note-takers** who want quick task capture

## Getting Started

If you're new to keyword-based task management, we recommend:

1. Start with simple `TODO` tasks in your notes
2. Experiment with state cycling (TODO → DOING → DONE)
3. Add priorities to important tasks
4. Try scheduled and deadline dates for time-sensitive work
5. Explore the powerful search and filtering capabilities

For detailed usage guides, see:

- [Task Entry Structure](task-entry-structure.md) - Learn about task syntax and formats
- [Task View](task-view.md) - Understand how to use the dedicated task panel
- [Search Functionality](search-functionality.md) - Master advanced task filtering
