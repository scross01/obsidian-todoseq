# Task View

The Task View is the central interface for managing all your tasks across your Obsidian vault. It provides a comprehensive overview of your tasks and powerful tools for task management.

## Opening the Task View

**Note**: The Task View behavior has been updated for better user experience. - The left ribbon icon has been removed since v0.7.0. The right sidebar is now the default location for the TOODseq task list.

### Automatic Opening

The Task View automatically opens in the right sidebar when the TODOseq plugin is enabled.

You can drag and drop the panel to reposition it within the Obsidian interface, such as moving to different panel location, or making it a floating window.

### Command Palette

1. Open the command palette with `Ctrl/Cmd + P`
2. Search for "TODOseq: Show TODO tasks"
3. Select the command to open/show the Task View in the right sidebar

### Keyboard Shortcut

- You can assign a custom keyboard shortcut to the "TODOseq: Show TODO tasks" in Obsidian's Hotkeys settings.

## Task View Interface

The Task View consists of several key components:

### 1. Search and Settings Toolbar

Located at the top of the Task View, the toolbar contains:

- **Search field**: Live filtering of tasks as you type
- **Case sensitivity toggle**: Button to toggle case-sensitive search
- **View mode icons**: Three buttons for different task display modes
- **Sort method dropdown**: Choose how tasks are ordered
- **Task count**: Shows "X of Y tasks" based on current filters

### 2. Task List

The main area displays all detected tasks with the following information:

- **Checkbox**: Visual indicator of completion status
- **State keyword**: Colored badge showing task state (TODO, DOING, DONE, etc.)
  Right click the badge to see all next state options
- **Priority badge**: Shows `[#A]`, `[#B]`, or `[#C]` if present
- **Task text**: The full text of the task
- **File path**: Shows the file name and line number location of the task in your vault. Hover the mouse over it to see the full path.

## Task Interactions

### Clicking the State Keyword

Clicking the colored state keyword cycles the task through its state sequence:

- **Basic workflow**: TODO → DOING → DONE → TODO
- **Deferred tasks**: LATER → NOW → DONE
- **Waiting tasks**: WAIT → IN-PROGRESS → DONE
- **Cancelled tasks**: CANCELED → TODO

### Using the Checkbox

The checkbox provides a simple toggle between completed and incomplete states:

- **Check the box**: Task state changes to DONE
- **Uncheck the box**: Task state changes to TODO
- **Automatic synchronization**: Both the keyword and checkbox are updated

### Right-Click Context Menu

Right-click any **task keyword** to see all available state options in a popup menu:

- Shows all possible states for the current task type
- Allows direct selection of any state
- Provides quick access to less commonly used states

### Opening Source Location

Click anywhere on the task row (except the checkbox or keyword) to:

- Jump to the exact file containing the task
- Navigate to the specific line number
- Focus the editor on the task for easy editing

Shif-click to open the file in a new split pane.

## Sort Methods

Choose how tasks are ordered using the sort method dropdown:

### 1. Default (File Path + Line Number)

- Tasks sorted alphabetically by vault file path and file name
- Within each file, tasks sorted by line number

### 2. Scheduled Date

- Tasks sorted by their SCHEDULED date
- Tasks without scheduled dates appear at the end
- Earlier dates appear first

### 3. Deadline Date

- Tasks sorted by their DEADLINE date
- Tasks without deadline dates appear at the end
- Earlier deadlines appear first

### 4. Priority

- Tasks sorted by priority: High (`[#A]`) > Medium (`[#B]`) > Low (`[#C]`) > No priority
- Within each priority level, tasks sorted by file path and line number

## Search Functionality

The search field provides powerful live filtering of tasks.

See [Search Functionality](search.md) for details.

## Task Display and Styling

### Completed Task Indicators

- Tasks with DONE, CANCELED, or CANCELLED states are visually marked as completed
- Completed tasks appear with strikethrough formatting
- State badges show completed states in distinct colors

### Priority Badges

Tasks priority indicatorsare show using colors picked from the current active theme.

- `[#A]` - High priority - theme color red
- `[#B]` - Medium priority - theme interactive accent
- `[#C]` - Low priority - theme background modifier boarder
- No priority - No badge displayed
