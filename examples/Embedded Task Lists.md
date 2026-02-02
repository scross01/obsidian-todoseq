The TODOseq plugin supports rendering task lists directly within your notes using code blocks. This feature allows you to create dynamic, interactive task lists that are filtered and sorted according to your specifications.

## Basic Usage

To create an embedded task list, use a code block with the `todoseq` language:

```todoseq
search: scheduled:due
sort: priority
```

## Code Block Parameters

- `search:` any valid search string.
- `sort:` one of `filepath`, `scheduled`, `deadline`, `priority` or `urgency`.
- `completed:` (optional) overrides "Completed tasks" setting. `show`, `hide`, `sort-to-end`.
- `future:` (optional) overrides "Future dated tasks" setting. `show-all`, `show-upcoming`, `hide`, `sort-to-end`.
- `limit:` (optional) set the display limit to result the number of results shown.
- `title:` (optional) adds a custom title displayed above the task list.
- `show-file:` (optional) `true` or `false`. Controls whether to show the source file info column. Defaults to `true` (responsive layout).
- `show-query:` (optional) `true` or `false`. Controls whether to show the search query and filter parameters in the header.

```todoseq
title: Example
search: state:DOING
sort: filepath
completed: hide
future: sort-to-end
limit: 5
show-query: true
show-file: true
```

### Search Query

The `search:` parameter accepts any valid TODOseq search query:

```todoseq
search: content:"example"
```

### Sort Method

The `sort:` parameter accepts any valid TODOseq sort method:

- `filepath` lists tasks in their natural order based on the file path and line number.
- `scheduled` - sort by scheduled date
- `deadline` - sort by deadline date
- `priority` - sort by priority
- `urgency` - sort by urgency (see [urgency](urgency.md))

```todoseq
sort: Priority
limit: 10
```

```todoseq
sort: Urgency
limit: 10
```

```todoseq
sort: scheduled
limit: 5
```

```todoseq
sort: filepath
limit: 5
```

### Combined Parameters

You can combine multiple parameters:

```todoseq
search: content:"example"
sort: Priority
```

```todoseq
search: state:TODO
sort: scheduled
limit: 5
```

## Interactive Features

### Toggle Task State

Click the checkbox next to a task to toggle its state between TODO and DONE:
The task will be updated in the original file, and the embedded list will refresh automatically.

### Navigate to Task

Click on the task text (excluding the checkbox) to navigate to the task's location in the original file. This will open the file and scroll to the task's line.

### Refresh List

The list automatically refreshes when:
- Tasks are modified in the vault
- Files are created, deleted, or renamed
- Settings are changed

## Empty Lists

```todoseq
search: bogus
```
## Error Handling

If there's an error parsing the search query or sort method, an error message will be displayed:

```todoseq
sort: invalid
```

```todoseq
future: invalid
```

```todoseq
completed: invalid
```

```todoseq
limit: invalid
```

The error message indicate what went wrong and suggest how to fix it.
