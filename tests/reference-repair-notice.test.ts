/** @jest-environment jsdom */
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

const notices: MockNotice[] = [];

class MockNotice {
  messageEl = document.createElement('div');
  hide = jest.fn();

  constructor(_message: string, _duration?: number) {
    notices.push(this);
  }
}

jest.mock('obsidian', () => ({
  Notice: jest.fn().mockImplementation((message: string, duration?: number) => {
    return new MockNotice(message, duration);
  }),
}));

import { showReferenceRepairNotice } from '../src/view/components/reference-repair-notice';

describe('reference repair notice', () => {
  beforeAll(() => {
    installObsidianDomMocks();
  });

  beforeEach(() => {
    notices.length = 0;
  });

  it('shows unreadable paths without offering an edit retry', () => {
    showReferenceRepairNotice(
      { retryPendingReferenceRepairs: jest.fn() } as never,
      0,
      ['notes/locked.md'],
    );

    expect(notices[0].messageEl.textContent).toContain('notes/locked.md');
    expect(
      notices[0].messageEl.querySelector('.todoseq-notice-action-btn'),
    ).toBeNull();
  });

  it('shows both known failures and incomplete discovery with Retry', () => {
    showReferenceRepairNotice(
      { retryPendingReferenceRepairs: jest.fn() } as never,
      2,
      ['notes/locked.md'],
    );

    const text = notices[0].messageEl.textContent ?? '';
    expect(text).toContain('2 reference link(s) could not be updated.');
    expect(text).toContain('notes/locked.md');
    expect(
      notices[0].messageEl.querySelector('.todoseq-notice-action-btn'),
    ).not.toBeNull();
  });
});
