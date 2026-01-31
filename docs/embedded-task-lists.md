# Embedded Task Lists

The TODOseq plugin supports rendering filtered task lists directly within your notes using special code blocks. This feature allows you to create dynamic, interactive task lists that are filtered and sorted according to your specifications.

## Basic Usage

To create an embedded task list, use a code block with the `todoseq` language:

````txt
```todoseq
search: file:"Test Priorities"
sort: priority
```
````

![TODOseq embedded task list example](assets/todoseq-embedded-list-example.png)

## Code Block Parameters

Using the following parameters within the `todoseq` code block you define which tasks are displayed.

- `search:` any valid search string (see [search](/search.html))
- `sort:` one of `filepath`, `scheduled`, `deadline`, `priority` or `urgency`.
- `completed:` (optional) one of `show`, `hide`, `sort-to-end`. Overrides the "Completed tasks" setting.
- `future:` (optional) one of `show-all`, `show-upcoming`, `hide`, `sort-to-end`. Overrides the overrides "Future dated tasks" setting.
- `show-file:` (optional) `true` or `false`. Controls whether to show the source file info column. Defaults to `true` (responsive layout).
- `limit:` (optional) set the display limit to result the number of results shown.

Example:

````txt
```todoseq
search: file:Project1 OR tag:project1
sort: filepath
completed: hide
future: show-upcoming
limit: 5
```
````

### Search Query

The `search:` parameter accepts any valid TODOseq search query:

Example:

````txt
```todoseq
search: tag:project1 AND content:"example"
```

```todoseq
search: state:TODO OR state:DOING
```

```todoseq
search: priority:high AND due:today
```
````

### Sort Method

The `sort:` parameter controls how tasks are ordered. Valid options are:

- `filepath` - Sort by file path (default)
- `scheduled` - Sort by scheduled date
- `deadline` - Sort by deadline date
- `priority` - Sort by priority (high → low)
- `urgency` - Sort by urgency score (high → low)

Example:

````txt
```todoseq
search: scheduled:today
sort: priority
```
````

### Completed Tasks

The `completed:` parameter controls how completed tasks are displayed. This overrides the global "Completed tasks" setting:

- `show` - Show all completed tasks (default)
- `hide` - Hide completed tasks
- `sort-to-end` - Sort completed tasks to the end of the list

````txt
```todoseq
search: scheduled:due OR deadline:due OR priority:high
completed: sort-to-end
```
````

### Future Tasks

The `future:` parameter controls how future-dated tasks are displayed. This overrides the global "Future dated tasks" setting:

- `show-all` - Show all future tasks (default)
- `show-upcoming` - Show only upcoming tasks (within 7 days)
- `hide` - Hide all future tasks
- `sort-to-end` - Sort future tasks to the end of the list

````txt
```todoseq
search: tag:project1 OR tag:project1
future: show-upcoming
```
````

### Limit Results

The `limit:` parameter limits the number of tasks displayed:

````txt
```todoseq
search: file:Project1 OR tag:project1
limit: 10
```
````

### Show File Info

The `show-file:` parameter controls whether to display the source file information column:

- `true` - Show file info (default, responsive layout)
- `false` - Always hide file info

````txt
```todoseq
search: tag:project1
show-file: false
```
````

### Combined Parameters

You can combine multiple parameters:

````txt
```todoseq
search: (file:Project1 OR tag:project1) AND content:"example"
sort: priority
completed: hide
future: show-all
show-file: false
limit: 10
```
````

## Visual Date Indicators

The task lists provides subtle visual cues to help you quickly identify task urgency based on scheduled and deadline dates. When a task has either a scheduled or deadline date, you'll see a gentle background color that indicates its time sensitivity without being distracting.

Tasks with dates that have passed appear with a soft red background, making it easy to spot what needs immediate attention. Tasks due today show a warm orange background, helping you focus on today's priorities. For tasks coming up within the next week, you'll see a soft green background that signals they're on your radar. Tasks with dates further out in the future maintain their default appearance, keeping your view clean and uncluttered.

## Interactive Features

### Toggle Task State

Click the checkbox next to a task to toggle its state between TODO and DONE:
The task will be updated in the original file, and the embedded list will refresh automatically.

### Change Task State

Right click on the task keyword to select the desired state. The task will be updated in the original file, and the embedded list will refresh automatically.

### Navigate to Task

Click on the task text to navigate to the task's location in the original file.

**Simple click** opens the file in the current active page or brining the existing open page into focus.

**Shift-click** creates a new split pane and opens the file there. This is perfect for when you want to reference the task while working on something else in your main workspace.

**Ctrl/Cmd-click** always opens the file in a brand new tab, ensuring you have a fresh workspace for the task without disrupting your current view.

In all cases, TODOseq navigates to the exact line containing the task and focuses the editor for immediate editing.

## Error Handling

If no tasks are found of the search query is invalid  
![TODOseq embedded list no tasks found](/assets/todoseq-embedded-list-empty.png)
If there's an with one of the sort or filters options, an error message will be displayed accordingly. The error message indicate what went wrong and suggest how to fix it.
![TODOseq embedded task list errors ](./assets/todoseq-embedded-list-error.png)
