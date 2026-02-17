#!/usr/bin/env node

/**
 * Content Generator Script
 *
 * Generates random markdown files for performance testing.
 *
 * Usage:
 *   npm run generate-content -- --files 100 --length 200 --tasks 20 --output ./test-vault
 *
 * Options:
 *   -f, --files    Number of files to create (required)
 *   -l, --length   Average length of each file in lines (default: 100)
 *   -t, --tasks    Average number of tasks per page (default: 10)
 *   -o, --output   Target folder to create files in (required)
 */

import * as fs from 'fs';
import * as path from 'path';

// Task state keywords (TODOseq format - see examples/Task Entry Examples.md)
const TASK_KEYWORDS = ['TODO', 'DOING', 'DONE', 'CANCELLED', 'IN_PROGRESS'];

// Sample data for generating realistic content
const SAMPLE_TITLES = [
  'Project Planning',
  'Weekly Review',
  'Meeting Notes',
  'Development Tasks',
  'Bug Tracking',
  'Feature Requests',
  'Documentation',
  'Research Notes',
  'Sprint Planning',
  'Retrospective',
  'Daily Standup',
  'Code Review',
  'Technical Design',
  'User Stories',
  'Testing Plan',
];

const TASK_VERBS = [
  'Complete',
  'Review',
  'Update',
  'Fix',
  'Implement',
  'Design',
  'Create',
  'Analyze',
  'Test',
  'Deploy',
  'Refactor',
  'Document',
  'Research',
  'Optimize',
  'Investigate',
  'Debug',
  'Configure',
  'Setup',
  'Migrate',
  'Integrate',
];

const TASK_OBJECTS = [
  'the database schema',
  'the user interface',
  'API endpoints',
  'unit tests',
  'documentation',
  'the build pipeline',
  'error handling',
  'performance optimizations',
  'the authentication system',
  'the caching layer',
  'the frontend components',
  'the backend services',
  'the CI/CD workflow',
  'the test coverage',
  'the code review feedback',
  'the migration scripts',
  'the configuration files',
  'the monitoring setup',
  'the security audit',
  'the feature flags',
];

const PARAGRAPH_SENTENCES = [
  'This is an important note that should be considered.',
  'The implementation details are outlined below.',
  'Please review this section carefully.',
  'Further investigation is needed.',
  'This requires additional testing.',
  'The following steps must be completed.',
  'This has been discussed in previous meetings.',
  'The team agreed on this approach.',
  'This needs to be prioritized.',
  'The deadline is approaching.',
  'We should consider alternative solutions.',
  'This is dependent on other tasks.',
  'The requirements have been clarified.',
  'This needs stakeholder approval.',
  'The scope has been adjusted.',
];

const HEADING_TOPICS = [
  'Overview',
  'Background',
  'Objectives',
  'Implementation',
  'Results',
  'Recommendations',
  'Next Steps',
  'Timeline',
  'Resources',
  'Dependencies',
  'Risks',
  'Mitigation',
  'Conclusion',
  'Summary',
  'Action Items',
];

interface CliOptions {
  files: number;
  length: number;
  tasks: number;
  output: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: Partial<CliOptions> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '-f':
      case '--files':
        options.files = parseInt(nextArg, 10);
        i++;
        break;
      case '-l':
      case '--length':
        options.length = parseInt(nextArg, 10);
        i++;
        break;
      case '-t':
      case '--tasks':
        options.tasks = parseInt(nextArg, 10);
        i++;
        break;
      case '-o':
      case '--output':
        options.output = nextArg;
        i++;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown argument: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  // Validate required options
  if (!options.files || options.files <= 0) {
    console.error(
      'Error: --files (or -f) is required and must be a positive number',
    );
    process.exit(1);
  }

  if (!options.output) {
    console.error('Error: --output (or -o) is required');
    process.exit(1);
  }

  return {
    files: options.files,
    length: options.length ?? 100,
    tasks: options.tasks ?? 10,
    output: options.output,
  };
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Content Generator Script

Usage:
  npm run generate-content -- [options]

Options:
  -f, --files    Number of files to create (required)
  -l, --length   Average length of each file in lines (default: 100)
  -t, --tasks    Average number of tasks per page (default: 10)
  -o, --output   Target folder to create files in (required)
  -h, --help     Show this help message

Example:
  npm run generate-content -- --files 100 --length 200 --tasks 20 --output ./test-vault
`);
}

/**
 * Get a random element from an array
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get a random number with variance
 */
function randomWithVariance(base: number, variance: number = 0.1): number {
  const varianceAmount = Math.floor(base * variance);
  const min = base - varianceAmount;
  const max = base + varianceAmount;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random task description
 */
function generateTaskDescription(): string {
  const verb = randomChoice(TASK_VERBS);
  const obj = randomChoice(TASK_OBJECTS);

  // Add some random modifiers occasionally
  const modifiers = [
    'urgent',
    'important',
    'optional',
    'critical',
    'low priority',
    'high priority',
  ];
  if (Math.random() > 0.7) {
    return `${randomChoice(modifiers)} ${verb} ${obj}`;
  }

  return `${verb} ${obj}`;
}

/**
 * Generate a random task line using TODOseq keyword format
 */
function generateTaskLine(): string {
  const keyword = randomChoice(TASK_KEYWORDS);
  const description = generateTaskDescription();

  // Add optional due date, priority, or checkbox occasionally
  let suffix = '';
  const useCheckbox = Math.random() > 0.5;
  const usePriority = Math.random() > 0.7;
  const useDate = Math.random() > 0.8;

  if (usePriority) {
    const priorities = ['[#A]', '[#B]', '[#C]', '[#p1]', '[#p2]', '[#p3]'];
    suffix += ` ${randomChoice(priorities)}`;
  }

  if (useDate) {
    const days = Math.floor(Math.random() * 30) + 1;
    suffix += ` 📅 <${days}day>`;
  }

  if (useCheckbox) {
    // Use checkbox with TODOseq keyword
    return `- [ ] ${keyword} ${description}${suffix}`;
  } else {
    // Use TODOseq keyword alone at start of line
    return `${keyword} ${description}${suffix}`;
  }
}

/**
 * Generate a random heading
 */
function generateHeading(): string {
  const level = Math.floor(Math.random() * 3) + 1; // H1-H3
  const prefix = '#'.repeat(level);
  const topic = randomChoice(HEADING_TOPICS);
  return `${prefix} ${topic}`;
}

/**
 * Generate a random paragraph
 */
function generateParagraph(): string {
  const numSentences = Math.floor(Math.random() * 3) + 2;
  const sentences: string[] = [];

  for (let i = 0; i < numSentences; i++) {
    sentences.push(randomChoice(PARAGRAPH_SENTENCES));
  }

  return sentences.join(' ');
}

/**
 * Generate a complete markdown file content
 */
function generateMarkdownFile(numLines: number, numTasks: number): string {
  const lines: string[] = [];

  // Start with a title
  lines.push(`# ${randomChoice(SAMPLE_TITLES)}`);
  lines.push('');

  let taskCount = 0;
  let currentTaskList: string[] = [];

  while (lines.length < numLines) {
    const elementType = Math.random();

    if (elementType < 0.15 && taskCount < numTasks) {
      // Add a task list (15% chance, if we still need tasks)
      if (currentTaskList.length > 0) {
        lines.push('');
        lines.push(...currentTaskList);
        lines.push('');
      }

      // Generate a new task list with 3-7 tasks
      const tasksInList = Math.min(
        Math.floor(Math.random() * 5) + 3,
        numTasks - taskCount,
      );
      currentTaskList = [];

      for (let i = 0; i < tasksInList; i++) {
        currentTaskList.push(generateTaskLine());
        taskCount++;
      }
    } else if (elementType < 0.3) {
      // Add a heading (15% chance)
      if (currentTaskList.length > 0) {
        lines.push('');
        lines.push(...currentTaskList);
        lines.push('');
        currentTaskList = [];
      }
      lines.push(generateHeading());
      lines.push('');
    } else {
      // Add a paragraph (70% chance)
      if (currentTaskList.length > 0 && Math.random() > 0.5) {
        lines.push('');
        lines.push(...currentTaskList);
        lines.push('');
        currentTaskList = [];
      }
      lines.push(generateParagraph());
      lines.push('');
    }
  }

  // Add any remaining tasks
  if (currentTaskList.length > 0) {
    lines.push('');
    lines.push(...currentTaskList);
  }

  return lines.join('\n');
}

/**
 * Generate a random filename
 */
function generateFilename(index: number): string {
  const prefixes = [
    'notes',
    'tasks',
    'project',
    'meeting',
    'daily',
    'weekly',
    'sprint',
    'doc',
    'todo',
  ];
  const prefix = randomChoice(prefixes);
  const timestamp = Date.now() + index;
  return `${prefix}-${timestamp}.md`;
}

/**
 * Main function
 */
function main(): void {
  const options = parseArgs();

  console.log('\n📄 Content Generator for Performance Testing');
  console.log('=============================================\n');
  console.log(`Files to create: ${options.files}`);
  console.log(`Average lines per file: ${options.length}`);
  console.log(`Average tasks per file: ${options.tasks}`);
  console.log(`Output directory: ${options.output}`);
  console.log('');

  // Create output directory if it doesn't exist
  if (!fs.existsSync(options.output)) {
    fs.mkdirSync(options.output, { recursive: true });
    console.log(`Created output directory: ${options.output}\n`);
  }

  const startTime = Date.now();

  for (let i = 0; i < options.files; i++) {
    // Calculate actual line count with +/- 10% variance
    const actualLines = randomWithVariance(options.length, 0.1);
    const actualTasks = randomWithVariance(options.tasks, 0.1);

    // Generate content
    const content = generateMarkdownFile(actualLines, actualTasks);

    // Generate unique filename
    const filename = generateFilename(i);
    const filepath = path.join(options.output, filename);

    // Write file
    fs.writeFileSync(filepath, content, 'utf-8');

    // Progress output
    if ((i + 1) % 10 === 0 || i === options.files - 1) {
      const progress = Math.round(((i + 1) / options.files) * 100);
      process.stdout.write(
        `\rProgress: ${i + 1}/${options.files} files (${progress}%)`,
      );
    }
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('\n');
  console.log('✅ Generation complete!');
  console.log(`📁 Files created in: ${options.output}`);
  console.log(`⏱️  Time taken: ${duration}s`);
  console.log('');
}

// Run the script
main();
