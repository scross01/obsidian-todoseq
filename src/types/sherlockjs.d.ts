/**
 * Module declaration for sherlockjs.
 * sherlockjs does not ship with TypeScript type definitions.
 * This minimal type covers the API surface used by TODOSEQ.
 */

declare module 'sherlockjs' {
  interface SherlockParseResult {
    eventTitle: string | null;
    startDate: Date | null;
    endDate: Date | null;
    isAllDay: boolean;
    isValidDate: boolean;
  }

  const Sherlock: {
    parse(input: string): SherlockParseResult;
    _setNow(date: Date | null): void;
  };

  export default Sherlock;
}
