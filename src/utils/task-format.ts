import { DateRepeatInfo, Task } from '../types/task';
import { CHECKBOX_DETECTION_REGEX } from './patterns';
import { getDateLineIndent } from './task-line-utils';

export function formatTaskLines(task: Task): string[] {
  const lines: string[] = [];

  const checkboxMatch = task.rawText.match(CHECKBOX_DETECTION_REGEX);
  const isCheckbox = checkboxMatch !== null;

  const priorityPart = task.priority
    ? ` [#${task.priority === 'high' ? 'A' : task.priority === 'med' ? 'B' : 'C'}]`
    : '';
  const textPart = task.text ? ` ${task.text}` : '';

  let taskLine: string;
  if (isCheckbox) {
    const listMarkerChar = checkboxMatch[1];
    const checkboxState = checkboxMatch[2];
    taskLine = `${listMarkerChar} [${checkboxState}] ${task.state}${priorityPart}${textPart}`;
  } else {
    taskLine = `${task.listMarker || ''}${task.state}${priorityPart}${textPart}`;
  }
  lines.push(taskLine);

  if (task.scheduledDate) {
    const scheduledStr = formatOrgDate(
      task.scheduledDate,
      task.scheduledDateRepeat,
    );
    lines.push(`${getDateLineIndent(task)}SCHEDULED: ${scheduledStr}`);
  }

  if (task.deadlineDate) {
    const deadlineStr = formatOrgDate(
      task.deadlineDate,
      task.deadlineDateRepeat,
    );
    lines.push(`${getDateLineIndent(task)}DEADLINE: ${deadlineStr}`);
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
