import { TaskParser } from '../../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import { baseCodeLanguageSettings } from '../helpers/code-language-test-helper';

describe('Task parsing within PowerShell comments in code blocks', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = baseCodeLanguageSettings;
    parser = TaskParser.create(settings, null);
  });

  describe('Tasks in powershell code blocks', () => {
    test(`should match tasks in powershell comments when enabled`, () => {
      const lines = `
\`\`\` powershell
# TODO test task text
<# TODO test task text #>

<#
 # TODO test task text
 #> 

Write-Host "hello" # TODO test task text
Write-Host "world" <# TODO test task text #>
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(5);
      expect(tasks[0].indent).toBe('# ');
      expect(tasks[0].text).toBe('test task text');
      expect(tasks[1].indent).toBe('<# ');
      expect(tasks[1].text).toBe('test task text');
      expect(tasks[1].tail).toBe(' #>');
      expect(tasks[2].indent).toBe(' # ');
      expect(tasks[2].text).toBe('test task text');
      expect(tasks[3].indent).toBe('Write-Host "hello" # ');
      expect(tasks[3].text).toBe('test task text');
      expect(tasks[4].indent).toBe('Write-Host "world" <# ');
      expect(tasks[4].text).toBe('test task text');
      expect(tasks[4].tail).toBe(' #>');
    });
  });
});
