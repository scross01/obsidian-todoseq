# New Feature: Scheduled and Deadline Date Parsing

## Overview

Enable parsing Logseq style dates from sibling lines at the same indent level as the parent task line using the `SCHEDULED:` and `DEADLINE:` prefixes with date formats in angle brackets. Dates should be stored in the task as normalized date/time objects for sorting and display.

## Requirements

### Supported Date Formats

The following date formats are supported for both `SCHEDULED:` and `DEADLINE:` lines:

1. **Date only**: `<YYYY-MM-DD>`
   - Example: `SCHEDULED: <2025-07-01>`

2. **Date with day of week**: `<YYYY-MM-DD Dow hh:mm>`
   - Example: `SCHEDULED: <2025-07-16 Sat 08:00>`
   - Day of week (Dow) must be a 3-letter abbreviation: Mon, Tue, Wed, Thu, Fri, Sat, Sun

3. **Date with time (no day of week)**: `<YYYY-MM-DD hh:mm>`
   - Example: `SCHEDULED: <2025-07-16 08:00>`

### Examples

```txt
TODO This is a task without a date

TODO This is a scheduled task
SCHEDULED: <2025-07-01>

TODO This is a scheduled task with a date and time
SCHEDULED: <2025-07-16 Sat 08:00>

TODO This is a scheduled task with a date and time alternative form
SCHEDULED: <2025-07-16 08:00>

TODO This is a deadline task
DEADLINE: <2025-07-31>

TODO This is a task with both scheduled and deadline dates
SCHEDULED: <2025-07-01>
DEADLINE: <2025-08-16 Sat 12:00>
```

## Rules and Constraints

1. **Position and Indent**:
   - `SCHEDULED:` and `DEADLINE:` lines must be on the directly following lines at the same indent level as the task line
   - Only lines immediately after the task line are considered (no gaps allowed)

2. **Duplicate Handling**:
   - If there are duplicate `SCHEDULED` or `DEADLINE` lines, the first occurrence wins
   - Only the first matching line at the correct indent level is processed

3. **Error Handling**:
   - If the date is missing or invalid, ignore the line and log a warning in the console
   - Invalid date formats should not break parsing of other valid dates

4. **Day of Week**:
   - The Day of Week (Dow) is informational only and not used for validation
   - It should be preserved in the original format for display purposes

5. **Time Zone Independence**:
   - All dates should be stored as timezone-independent Date objects
   - Date-only formats should be stored at midnight in the local time zone
   - Date-time formats should be stored using the specified time in the local time zone
   - Display should respect the user's local time zone settings in Obsidian
   - No UTC conversion should be applied during parsing to preserve the intended local time

## Data Structure Changes

### Task Interface Extension

The `Task` interface in [`task.ts`](task.ts:2) must be extended to include:

```typescript
interface Task {
  // ... existing fields ...
  scheduledDate: Date | null;
  deadlineDate: Date | null;
}
```

### Default Values

- `scheduledDate`: `null` (no scheduled date)
- `deadlineDate`: `null` (no deadline date)

## Implementation Guidance

### Phase 1: Task Parser Extension

1. **Update [`task-parser.ts`](task-parser.ts:6)**:
   - Extend the `parseFile` method to look for `SCHEDULED:` and `DEADLINE:` lines immediately after task lines
   - Implement a new method `parseDateFromLine(line: string): Date | null` to handle date parsing
   - Use regex patterns to match the supported date formats
   - Store parsed dates in the task objects

2. **Date Parsing Logic**:

   ```typescript
   // Regex patterns for supported formats
   const DATE_ONLY = /^<(\d{4}-\d{2}-\d{2})>/;
   const DATE_WITH_DOW = /^<(\d{4}-\d{2}-\d{2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{2}:\d{2})>/;
   const DATE_WITH_TIME = /^<(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})>/;

   // Date parsing should create Date objects in local time
   // to maintain timezone independence
   const parseDateTimeString = (dateStr: string, timeStr: string): Date => {
     const [year, month, day] = dateStr.split('-').map(Number);
     const [hours, minutes] = timeStr.split(':').map(Number);
     return new Date(year, month - 1, day, hours, minutes);
   };

   const parseDateString = (dateStr: string): Date => {
     const [year, month, day] = dateStr.split('-').map(Number);
     return new Date(year, month - 1, day, 0, 0, 0, 0);
   };
   ```

3. **Indent Matching Logic**:
   - Compare the indent of `SCHEDULED:`/`DEADLINE:` lines with the task line indent
   - Only process lines with identical leading whitespace

### Phase 2: Task View Updates

1. **Update [`task-view.ts`](task-view.ts:7)**:
   - Display scheduled and deadline dates in the task list view
   - Add visual indicators for tasks with upcoming/overdue deadlines
   - Implement sorting by scheduled date and deadline date

2. **Display Format**:
   - Use Obsidian's built-in date formatting for consistency
   - Show relative dates where appropriate (e.g., "Today", "Tomorrow", "In 3 days")
   - Display both scheduled and deadline dates when both are present

### Phase 3: Search and Filter Integration

1. **Add search capabilities**:
   - Search for tasks by scheduled date range
   - Search for tasks by deadline date range
   - Filter tasks with/without scheduled dates
   - Filter tasks with/without deadline dates

2. **Advanced filtering**:
   - "Upcoming tasks" (scheduled for today or future)
   - "Overdue tasks" (deadline in the past)
   - "Due today" tasks

### Phase 4: Settings Integration

1. **Update [`settings.ts`](settings.ts)**:
   - Add option to enable/disable date parsing
   - Add date format preferences
   - Add timezone settings

## Error Handling and Edge Cases

### Invalid Date Formats

- Log warnings to console for invalid dates
- Continue processing other valid dates
- Preserve original text in task metadata for debugging

### Missing or Malformed Data

- Handle cases where date is missing from angle brackets
- Handle cases with extra whitespace
- Handle cases with malformed time components

### Performance Considerations

- Cache parsed dates to avoid re-parsing on every view refresh
- Use efficient date comparison for sorting
- Implement lazy loading for date calculations in large vaults

## Testing Requirements

1. **Unit Tests**:
   - Test date parsing with all supported formats
   - Test error handling for invalid dates
   - Test indent matching logic
   - Test duplicate date handling

2. **Integration Tests**:
   - Test parsing in real markdown files
   - Test display in task view
   - Test sorting and filtering functionality

3. **Edge Case Tests**:
   - Tasks with multiple date lines
   - Tasks with mixed valid/invalid dates
   - Tasks with varying indent levels
   - Tasks with special characters in text
