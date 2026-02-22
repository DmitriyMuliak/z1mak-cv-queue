import { expect } from 'vitest';
import { ParsedSSEEvent } from './helpers/sse-parser';

interface CustomMatchers<R = unknown> {
  toEmitSnapshot(expectedData?: any): R;
  toCompleteSuccessfully(): R;
  toFailWithCode(code: string): R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {
    _dummy?: T;
  }
  interface AsymmetricMatchersContaining extends CustomMatchers {
    _dummy?: any;
  }
}

expect.extend({
  toEmitSnapshot(events: ParsedSSEEvent[], expectedData?: any) {
    const snapshot = events.find((e) => e.event === 'snapshot');

    let pass = !!snapshot;
    if (pass && expectedData) {
      // Partial deep match
      for (const key in expectedData) {
        if (!this.equals(snapshot?.data[key], expectedData[key])) {
          pass = false;
          break;
        }
      }
    }

    return {
      pass,
      message: () =>
        pass
          ? `Expected stream NOT to emit snapshot${expectedData ? ` with ${JSON.stringify(expectedData)}` : ''}`
          : `Expected stream to emit snapshot${expectedData ? ` with ${JSON.stringify(expectedData)}` : ''}, but got ${JSON.stringify(snapshot?.data)}`,
    };
  },

  toCompleteSuccessfully(events: ParsedSSEEvent[]) {
    const hasDone = events.some((e) => e.event === 'done');
    const hasError = events.some((e) => e.event === 'error');
    const pass = hasDone && !hasError;

    return {
      pass,
      message: () =>
        pass
          ? `Expected stream NOT to complete successfully`
          : `Expected stream to complete successfully (emit 'done' and NO 'error'), but events were: ${events.map((e) => e.event).join(', ')}`,
    };
  },

  toFailWithCode(events: ParsedSSEEvent[], code: string) {
    const errorEvent = events.find((e) => e.event === 'error');
    const pass = errorEvent?.data?.code === code;

    return {
      pass,
      message: () =>
        pass
          ? `Expected stream NOT to fail with code ${code}`
          : `Expected stream to fail with code ${code}, but got ${errorEvent?.data?.code || 'no error event'}`,
    };
  },
});
