import { DateRepeatInfo, Task } from '../types/task';

export function formatTaskLines(task: Task): string[] {
  const lines: string[] = [];

  let taskLine = task.state;
  if (task.priority) {
    const priorityMap: Record<string, string> = {
      high: 'A',
      med: 'B',
      low: 'C',
    };
    taskLine += ` [#${priorityMap[task.priority]}]`;
  }
  taskLine += ` ${task.text}`;
  lines.push(taskLine);

  if (task.scheduledDate) {
    const scheduledStr = formatOrgDate(
      task.scheduledDate,
      task.scheduledDateRepeat,
    );
    lines.push(`SCHEDULED: ${scheduledStr}`);
  }

  if (task.deadlineDate) {
    const deadlineStr = formatOrgDate(
      task.deadlineDate,
      task.deadlineDateRepeat,
    );
    lines.push(`DEADLINE: ${deadlineStr}`);
  }

  return lines;
}

function formatOrgDate(date: Date, repeat?: DateRepeatInfo | null): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdays[date.getDay()];
  const repeatStr = repeat ? ` ${repeat.raw}` : '';
  return `<${year}-${month}-${day} ${weekday}${repeatStr}>`;
}
