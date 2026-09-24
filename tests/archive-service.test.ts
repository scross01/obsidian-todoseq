import { DefaultSettings, DefaultTaskArchiveSettings } from '../src/settings/settings-types';

describe('TaskArchiveSettings defaults', () => {
  it('ships with sane defaults', () => {
    expect(DefaultTaskArchiveSettings).toEqual({
      autoArchiveEnabled: false, // opt-in only
      criterionDays: 90, // days-mode threshold
      criterionMode: 'days', // 'days' | 'date' (date = manual runs only)
      criterionDate: '', // ISO YYYY-MM-DD string, used when mode='date'
      stateMappings: [], // ArchiveStateMapping[]
      includeNoClosedDate: false, // reserved: always false in this feature version
    });
    expect(DefaultSettings).toMatchObject({
      taskArchive: DefaultTaskArchiveSettings,
    });
  });
});
