## Sort Methods

Choose how tasks are ordered using the sort method dropdown:

### 1. Default (File Path + Line Number)

Tasks sorted alphabetically by vault file path and file name. Within each file, tasks are sorted by line number.

### 2. Scheduled Date

Tasks sorted by their SCHEDULED date. Tasks without scheduled dates appear at the end, with earlier dates appearing first. When two tasks have the same scheduled date, they are sorted by keyword group and position, then by file path and line number.

### 3. Deadline Date

Tasks sorted by their DEADLINE date. Tasks without deadline dates appear at the end, with earlier deadlines appearing first. When two tasks have the same deadline date, they are sorted by keyword group and position, then by file path and line number.

### 4. Priority

Tasks sorted by priority: High (`[#A]`) > Medium (`[#B]`) > Low (`[#C]`) > No priority. Within each priority level, tasks are sorted by keyword group and position, then by file path and line number.

### 5. Urgency

Tasks sorted by calculated urgency score (highest to lowest). Urgency is calculated based on multiple factors including due dates, priority, tags, and task state. Tasks with no urgency score appear at the end, and completed tasks are not included in urgency sorting. When two tasks have the same urgency score, they are sorted by keyword group and position, then by file path and line number.

### 6. Keyword

Tasks are sorted by effective keyword group and keyword order from your settings. That means custom keywords and advanced built-in overrides both affect this sort.

Tasks are classified into 4 ordered groups:

| Group         | Keywords                 |
| ------------- | ------------------------ |
| 1 - Active    | Active group keywords    |
| 2 - Inactive  | Inactive group keywords  |
| 3 - Waiting   | Waiting group keywords   |
| 4 - Completed | Completed group keywords |

**Example:**

If you have current tasks with keywords DOING, TODO, and WAIT, they will be ordered as:

1. DOING tasks (Group 1 - Active)
2. TODO tasks (Group 2 - Inactive)
3. WAIT tasks (Group 3 - Waiting)

Within each group, tasks follow the keyword order currently defined in settings.
