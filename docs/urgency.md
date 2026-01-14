# Task Urgency

The Urgency sorting feature in TODOseq helps you prioritize your tasks by calculating a numeric score for each task based on multiple factors. This approach is inspired by [Taskwarrior's urgency system](https://taskwarrior.org/docs/urgency/), where tasks are ranked according to their importance and timeliness, helping you focus on what matters most.

## Understanding Urgency

Urgency is a calculated score that represents how important and time-sensitive a task is. When you select the "Urgency" sort option in the Task List view, tasks are ordered from highest to lowest urgency, putting the most critical tasks at the top of your list.

The urgency score considers various aspects of your tasks:

- **Due dates**: Tasks that are due today or overdue receive the highest urgency boost
- **Priority**: High priority tasks (`[#A]`) are more urgent than medium (`[#B]`) or low (`[#C]`) priority tasks
- **Scheduled dates**: Tasks with scheduled dates are more urgent than those without
- **Deadlines**: Tasks with deadline dates are more urgent than those without
- **Active state**: Tasks that are currently being worked on (DOING, NOW, IN-PROGRESS) are more urgent
- **Task age**: Older tasks in dail notes journal pages gain urgency over time
- **Tags**: Tasks with tags receive a small urgency boost
- **Waiting state**: Tasks in WAIT or WAITING states have reduced urgency

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
urgency.due.coefficient = 12.0             # schedule and/or deadline date is due (today) or overdue
urgency.priority.high.coefficient = 6.0    # priority is high [#A]
urgency.priority.medium.coefficient = 3.9  # priority is medium [#B]
urgency.priority.low.coefficient = 1.8     # priority is low [#C]
urgency.scheduled.coefficient = 5.0        # task has a scheduled date
urgency.deadline.coefficient = 5.0         # task has a deadline date
urgency.active.coefficient = 4.0           # state is either DOING, NOW, or IN-PROGRESS
urgency.age.coefficient = 2.0              # if the page is a journal page, using the date the page represents
urgency.tags.coefficient = 1.0             # the task has one or more tags
urgency.waiting.coefficient = -3.0         # the task is in a WAIT or WAITING state
```

The highest coefficient (12.0) is assigned to due dates, meaning tasks that are due today or overdue will always appear near the top of your urgency-sorted list. High priority tasks come next with a coefficient of 6.0, while waiting tasks actually reduce urgency with a negative coefficient (-3.0).

## Using Urgency Sorting

To use urgency sorting:

1. Open the Task List view
2. Click on the sort method dropdown in the toolbar
3. Select "Urgency" from the available sort options

Your tasks will now be ordered from highest to lowest urgency. Tasks with no urgency factors (no dates, no priority, no tags) will appear at the end of the list, followed by completed tasks which are not included in urgency calculations.

## Customizing Urgency (Advanced)

For advanced users who want to fine-tune the urgency calculation, you can modify the urgency coefficients by creating or editing an `urgency.ini` file in the plugin directory:

1. Navigate to your Obsidian plugin directory: `.obsidian/plugins/todoseq/`
2. Create or edit the `urgency.ini` file using the format show above.
3. Adjust the coefficient values to match your workflow preferences
4. Reload the Todoseq plugin or restart Obsidian for the changes to take effect

Note that this is an advanced feature and the default coefficients are carefully balanced for most use cases. Changes to these values will only take effect after restarting the plugin.

## Urgency in Practice

The urgency system helps you focus on what's truly important by automatically surfacing tasks that:

- Are due soon or overdue
- Have high priority
- Are actively being worked on
- Have been waiting for attention

By using urgency sorting, you can quickly identify which tasks need your immediate attention and which can wait, helping you work more efficiently and effectively.
