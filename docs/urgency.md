# Task Urgency

The Urgency sorting feature in TODOseq helps you prioritize your tasks by calculating a numeric score for each task based on multiple factors. This approach is inspired by [Taskwarrior's urgency system](https://taskwarrior.org/docs/urgency/), where tasks are ranked according to their importance and timeliness.

## Understanding Urgency

Urgency is a calculated score that represents how important and time-sensitive a task is. When you select the "Urgency" sort option in the Task List view, tasks are ordered from highest to lowest urgency, putting the most critical tasks at the top of your list.

The urgency score considers various aspects of your tasks:

- **Due dates**: Tasks that are due today or overdue receive the highest urgency boost
- **Priority**: High priority tasks (`[#A]`) are more urgent than medium (`[#B]`) or low (`[#C]`) priority tasks
- **Scheduled dates**: Tasks with scheduled dates are more urgent than those without; tasks with a specific time get an additional contribution weighted by time-of-day (earlier = more urgent)
- **Deadlines**: Tasks with deadline dates are more urgent than those without; tasks with a specific time get an additional contribution weighted by time-of-day (earlier = more urgent)
- **Active state**: Tasks that are currently being worked on (DOING, NOW, IN-PROGRESS, or custom active keywords) are more urgent
- **Task age**: Older tasks in daily note pages gain urgency over time using a linear scale (0.0 to 1.0) based on days since creation, with a maximum of 365 days
- **Tags**: Tasks with tags receive a small urgency boost based on the number of tags (0.8 for 1 tag, 0.9 for 2 tags, 1.0 for 3+ tags)
- **Waiting state**: Tasks in WAIT, WAITING, or custom waiting keywords have reduced urgency

## How Urgency is Calculated

TODOseq calculates urgency using a polynomial expression where each factor contributes to the overall score. The urgency score is the sum of individual contributions from each relevant task attribute.

For example:

- A task with a high priority (`[#A]`) and a due date today would have a very high urgency score
- A task with no priority, no dates, and no tags would have a low urgency score
- A task in a WAITING state would have its urgency score reduced

This approach allows different aspects of your tasks to contribute to their overall importance, creating a balanced ranking system.

## Default Urgency Coefficients

Each factor in the urgency calculation has a coefficient that determines its relative importance:

```ini
urgency.priority.high.coefficient = 6.0    # priority is high [#A]
urgency.priority.medium.coefficient = 3.9  # priority is medium [#B]
urgency.priority.low.coefficient = 1.8     # priority is low [#C]
urgency.scheduled.coefficient = 5.0        # task has a scheduled date that is today or in the past
urgency.scheduled.time.coefficient = 1.0   # task has a scheduled time, weighted by time-of-day (00:00=1.0, 23:59=0)
urgency.deadline.coefficient = 12.0        # deadline date is upcoming (+14 days) due (today) or overdue (-7 days)
urgency.deadline.time.coefficient = 1.0    # task has a deadline time, weighted by time-of-day (00:00=1.0, 23:59=0)
urgency.active.coefficient = 4.0           # state is an active keyword (DOING, NOW, IN-PROGRESS, or custom active keywords)
urgency.age.coefficient = 2.0              # if the page is a daily notes page, weight tasks on older pages higher
urgency.tags.coefficient = 1.0             # the task has one or more tags (multiplied by tag factor)
urgency.waiting.coefficient = -3.0         # the task is in a waiting keyword state (WAIT, WAITING, or custom waiting keywords)
```

The highest coefficient (12.0) is assigned to deadline dates, meaning tasks with deadlines will always appear near the top of your urgency-sorted list. High priority tasks come next with a coefficient of 6.0, while waiting tasks actually reduce urgency with a negative coefficient (-3.0).

## Tag Urgency Calculation

The tag urgency calculation uses a factor-based system rather than counting tags directly:

- **0 tags**: 0.0 urgency factor (no contribution)
- **1 tag**: 0.8 urgency factor
- **2 tags**: 0.9 urgency factor
- **3+ tags**: 1.0 urgency factor (maximum)

The tag urgency contribution is calculated as: `urgency.tags.coefficient × tag_factor`

**Examples**:

- Task with 1 tag: `1.0 × 0.8 = 0.8` urgency contribution
- Task with 2 tags: `1.0 × 0.9 = 0.9` urgency contribution
- Task with 3+ tags: `1.0 × 1.0 = 1.0` urgency contribution

This approach provides diminishing returns for additional tags, encouraging focused tagging rather than tag spam.

## How Scheduled and Deadline Dates Are Calculated

### Scheduled Date Calculation

The scheduled date uses a simple binary approach with day-level comparison:

- **If scheduled date is today or in the past**: Contributes the full `urgency.scheduled.coefficient` (5.0) to the urgency score
- **If scheduled date is in the future**: Contributes 0 to the urgency score

The comparison normalizes both dates to the start of the day, so tasks scheduled with a specific time (e.g., `<2026-05-04 Mon 10:00>`) are correctly compared at the day level.

### Scheduled Time Calculation

For tasks with a specific scheduled time (e.g., `SCHEDULED: <2026-05-04 Mon 10:00>`), an additional time-based contribution is applied. The time contribution is weighted by the time of day — tasks scheduled earlier in the day are considered more urgent:

**Formula**: `urgency.scheduled.time.coefficient × (1.0 - minutes_from_midnight / 1440)`

- **00:00 (start of day)**: Full weight (1.0 × coefficient)
- **06:00**: 0.75 × coefficient
- **12:00 (midday)**: 0.5 × coefficient
- **18:00**: 0.25 × coefficient
- **23:59 (end of day)**: Near-zero weight (~0.0 × coefficient)
- **No time component**: Contributes 0

**Examples**:

- Task scheduled at 00:01: `1.0 × (1.0 - 1/1440) ≈ 1.0` time contribution
- Task scheduled at 12:00: `1.0 × (1.0 - 720/1440) = 0.5` time contribution
- Task scheduled at 23:59: `1.0 × (1.0 - 1439/1440) ≈ 0.0` time contribution
- Task scheduled with no time: `0` time contribution

### Deadline Date Calculation

The deadline date uses a more sophisticated gradient formula that considers how close the deadline is. The comparison normalizes both dates to the start of the day so that deadlines with a specific time are correctly handled at the day level.

**Formula**: `((days_overdue + 14.0) * 0.8 / 21.0) + 0.2`

This creates a linear gradient where:

- **7 days overdue**: Maximum urgency (1.0 × coefficient = 12.0)
- **Today (0 days)**: High urgency (~0.733 × coefficient ≈ 8.8)
- **7 days in future**: Moderate urgency (~0.533 × coefficient ≈ 6.4)
- **14 days in future**: Minimum urgency (0.2 × coefficient = 2.4)

The formula clamps the range to -14 days (14 days in the future) to +7 days (7 days overdue), so tasks with deadlines further in the future won't become less urgent, and tasks overdue by more than 7 days won't become more urgent.

**Examples**:

- Task due today: `((0 + 14.0) * 0.8 / 21.0) + 0.2 = 0.733 × 12.0 ≈ 8.8`
- Task due tomorrow: `((-1 + 14.0) * 0.8 / 21.0) + 0.2 = 0.695 × 12.0 ≈ 8.3`
- Task 7 days overdue: `((7 + 14.0) * 0.8 / 21.0) + 0.2 = 1.0 × 12.0 = 12.0`

### Deadline Time Calculation

For tasks with a specific deadline time (e.g., `DEADLINE: <2026-05-04 Mon 10:00>`), an additional time-based contribution is applied. The time contribution is weighted by the time of day — tasks due earlier in the day are considered more urgent:

**Formula**: `urgency.deadline.time.coefficient × (1.0 - minutes_from_midnight / 1440)`

- **00:00 (start of day)**: Full weight (1.0 × coefficient)
- **06:00**: 0.75 × coefficient
- **12:00 (midday)**: 0.5 × coefficient
- **18:00**: 0.25 × coefficient
- **23:59 (end of day)**: Near-zero weight (~0.0 × coefficient)
- **No time component**: Contributes 0

**Examples**:

- Task due at 00:01: `1.0 × (1.0 - 1/1440) ≈ 1.0` time contribution
- Task due at 12:00: `1.0 × (1.0 - 720/1440) = 0.5` time contribution
- Task due at 23:59: `1.0 × (1.0 - 1439/1440) ≈ 0.0` time contribution
- Task due with no time: `0` time contribution

## Priority Calculation

When a task has a priority value, the corresponding coefficient is added to the urgency score:

- **High priority** (`[#A]`): Adds **+6.0** to the urgency score
- **Medium priority** (`[#B]`): Adds **+3.9** to the urgency score
- **Low priority** (`[#C]`): Adds **+1.8** to the urgency score

## Age Calculation

The age urgency factor applies only to tasks in daily note journal pages and increases as the task gets older:

**Formula**: `min(age / 365, 1.0)`

This creates a linear scale where:

- **New task (0 days old)**: 0.0 × coefficient = 0.0 urgency contribution
- **182 days old**: 0.5 × coefficient = 1.0 urgency contribution
- **365+ days old**: 1.0 × coefficient = 2.0 urgency contribution (maximum)

**Key behaviors**:

- **Daily note tasks**: Age is calculated as days since the daily note date
- **Non-daily note tasks**: Always return 1.0 age factor (maximum urgency contribution)
- **Maximum age**: 365 days maps to 1.0 age factor
- **Linear scaling**: Age increases urgency proportionally over time

This helps surface older tasks in your daily journal that may need attention, while non-daily-note tasks get the maximum age urgency contribution by default.

## Using Urgency Sorting

To use urgency sorting:

1. Open the Task List view
2. Click on the sort method dropdown in the toolbar
3. Select "Urgency" from the available sort options

Your tasks will now be ordered from highest to lowest urgency. Tasks with no urgency factors (no dates, no priority, no tags) will appear at the end of the list, followed by completed tasks which are not included in urgency calculations.

## Secondary Sorting with Keywords

When two tasks have the same urgency score, TODOseq uses the keyword sort algorithm as a secondary sort to determine their order. This means:

1. **Different keyword groups**: Tasks with active keywords (NOW, DOING, IN-PROGRESS) come before inactive keywords (TODO, LATER), which come before waiting keywords (WAIT, WAITING), which come before completed keywords (DONE, CANCELED).

2. **Same keyword group**: Within the same group, tasks are sorted by their keyword position (e.g., NOW comes before DOING).

3. **Same keyword**: If two tasks have the same urgency score AND the same keyword, they are sorted by file path and line number.

This provides a consistent and predictable ordering when tasks have equal urgency scores.

## Customizing Urgency (Advanced)

For advanced users who want to fine-tune the urgency calculation, you can modify the urgency coefficients by creating or editing an `urgency.ini` file in the plugin directory:

1. Navigate to your Obsidian plugin directory: `.obsidian/plugins/todoseq/`
2. Create or edit the `urgency.ini` file using the format shown above
3. Adjust the coefficient values to match your workflow preferences
4. Reload the TODOseq plugin or restart Obsidian for the changes to take effect

Note that this is an advanced feature and the default coefficients are carefully balanced for most use cases. Changes to these values will only take effect after restarting the plugin.

## Urgency in Practice

The urgency system helps you focus on what's truly important by automatically surfacing tasks that:

- Are due soon or overdue
- Have high priority
- Are actively being worked on
- Have been waiting for attention

By using urgency sorting, you can quickly identify which tasks need your immediate attention and which can wait.
