import { DateUtils } from '../src/utils/date-utils';

describe('Debug Date Parse', () => {
  it('should parse a date range correctly', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const query = `${yesterdayStr}..${tomorrowStr}`;
    const result = DateUtils.parseDateValue(query);
    
    if (result && typeof result === 'object' && 'start' in result && 'end' in result) {
    }
  });
});
