# Embedded Task Lists

The TODOseq plugin supports rendering task lists directly within your notes using code blocks. This feature allows you to create dynamic, interactive task lists that are filtered and sorted according to your specifications.

## Basic Usage

To create an embedded task list, use a code block with the `todoseq` language:

```todoseq
search: tag:project1
sort: Priority
```

## Code Block Parameters

### Search Query

The `search:` parameter accepts any valid TODOseq search query:

```todoseq
search: tag:project1 AND content:"example"
```

```todoseq
search: state:TODO OR state:DOING
```

```todoseq
search: priority:high AND due:today
```

### Sort Method

The `sort:` parameter accepts any valid TODOseq sort method:

```todoseq
sort: Priority
```

```todoseq
sort: Urgency
```

```todoseq
sort: Due Date
```

```todoseq
sort: File
```

### Combined Parameters

You can combine multiple parameters:

```todoseq
search: tag:project1 AND content:"example"
sort: Priority
```

```todoseq
search: state:TODO
sort: Due Date
```

## Interactive Features

### Toggle Task State

Click the checkbox next to a task to toggle its state between TODO and DONE:

```todoseq
search: tag:project1
sort: Priority
```

The task will be updated in the original file, and the embedded list will refresh automatically.

### Navigate to Task

Click on the task text (excluding the checkbox) to navigate to the task's location in the original file:

```todoseq
search: tag:project1
sort: Priority
```

This will open the file and scroll to the task's line.

### Refresh List

The list automatically refreshes when:
- Tasks are modified in the vault
- Files are created, deleted, or renamed
- Settings are changed

You can also manually refresh by clicking the refresh button in the header.

## Examples

### Project Tasks

Show all TODO tasks for a specific project:

```todoseq
search: tag:project1 AND state:TODO
sort: Priority
```

### High Priority Tasks

Show all high-priority tasks:

```todoseq
search: priority:high
sort: Urgency
```

### Due Today

Show tasks due today:

```todoseq
search: due:today
sort: Due Date
```

### Custom Search

Show tasks with specific content:

```todoseq
search: content:"review" AND state:TODO
sort: File
```

## Error Handling

If there's an error parsing the search query or sort method, an error message will be displayed:

```todoseq
search: invalid query syntax
sort: Invalid Sort
```

The error message will indicate what went wrong and suggest how to fix it.

## Performance

Embedded task lists are optimized for performance:
- **Debounced updates**: Rapid file changes are batched to prevent excessive refreshes
- **Caching**: Search results are cached for 5 seconds to reduce computation
- **Targeted refresh**: Only affected code blocks are refreshed when tasks change

## Independence

Embedded task lists are independent from the main task list view:
- Changes in embedded lists don't affect the main task list view
- Changes in the main task list view don't affect embedded lists
- Each embedded list maintains its own state and refreshes independently

## Best Practices

### Use Descriptive Search Queries

Be specific with your search queries to show relevant tasks:

```todoseq
search: tag:project1 AND state:TODO AND due:next-week
sort: Priority
```

### Choose Appropriate Sort Methods

Select sort methods that match your workflow:

```todoseq
search: tag:project1
sort: Due Date
```

### Limit Results

For large vaults, consider limiting results with specific search criteria:

```todoseq
search: tag:project1 AND state:TODO AND priority:high
sort: Urgency
```

### Use Multiple Lists

Create multiple embedded lists for different views of your tasks:

```todoseq
search: tag:project1 AND state:TODO
sort: Priority
```

```todoseq
search: tag:project1 AND state:DOING
sort: Urgency
```

```todoseq
search: tag:project1 AND state:DONE
sort: Due Date
```

## Technical Details

### Code Block Processing

The plugin registers a markdown code block processor for the `todoseq` language. When Obsidian encounters a code block with this language, it renders the task list using the specified parameters.

### Event Handling

The plugin monitors vault events to keep embedded task lists up-to-date:
- **File modification**: Triggers refresh of affected code blocks
- **File creation**: Triggers refresh of all code blocks
- **File deletion**: Triggers refresh of all code blocks
- **File rename**: Triggers refresh of all code blocks

### State Management

Each embedded task list maintains its own state:
- **Task cache**: Filtered and sorted tasks are cached for 5 seconds
- **Event listeners**: DOM event listeners are attached to each task item
- **Cleanup**: Event listeners are properly cleaned up when the code block is destroyed

## Limitations

- **Read-only in reading view**: Task interactions (checkboxes, navigation) only work in reading view
- **No editing**: Tasks cannot be edited directly in the embedded list (only state changes)
- **No sorting options UI**: Sort methods must be specified in the code block (no dropdown menu)

## Future Enhancements

Potential future enhancements:
- Sorting options dropdown in reading view
- Task editing capabilities
- Custom styling options
- Support for more complex search queries
- Export functionality
