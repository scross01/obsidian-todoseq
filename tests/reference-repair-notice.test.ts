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

  it('explains a complete discovery failure without offering an edit retry', () => {
    showReferenceRepairNotice(
      { retryPendingReferenceRepairs: jest.fn() } as never,
      0,
      [],
      true,
    );

    expect(notices[0].messageEl.textContent).toContain(
      'References could not be scanned for repair.',
    );
    expect(
      notices[0].messageEl.querySelector('.todoseq-notice-action-btn'),
    ).toBeNull();
  });

  it('keeps a discovery failure after known edits are retried successfully', async () => {
    const retry = jest.fn().mockResolvedValue([]);
    showReferenceRepairNotice(
      { retryPendingReferenceRepairs: retry } as never,
      1,
      [],
      true,
    );

    const button = notices[0].messageEl.querySelector<HTMLButtonElement>(
      '.todoseq-notice-action-btn',
    );
    button?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(notices).toHaveLength(2);
    expect(notices[1].messageEl.textContent).toContain(
      'References could not be scanned for repair.',
    );
    expect(
      notices[1].messageEl.querySelector('.todoseq-notice-action-btn'),
    ).toBeNull();
  });
});
