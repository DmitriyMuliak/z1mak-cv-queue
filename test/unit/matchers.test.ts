import { describe, it, expect } from 'vitest';
import '../matchers';
import { ParsedSSEEvent } from '../helpers/sse-parser';

describe('Custom Matchers', () => {
  describe('toCompleteSuccessfully', () => {
    it('passes when "done" is present and "error" is absent', () => {
      const events: ParsedSSEEvent[] = [
        { id: '1', event: 'done', data: {} }
      ];
      expect(events).toCompleteSuccessfully();
    });

    it('fails when "done" is absent', () => {
      const events: ParsedSSEEvent[] = [
        { id: '1', event: 'snapshot', data: {} }
      ];
      expect(() => expect(events).toCompleteSuccessfully()).toThrow(/Expected stream to complete successfully/);
    });

    it('fails when "error" is present', () => {
      const events: ParsedSSEEvent[] = [
        { id: '1', event: 'done', data: {} },
        { id: '2', event: 'error', data: {} }
      ];
      expect(() => expect(events).toCompleteSuccessfully()).toThrow(/Expected stream to complete successfully/);
    });

    it('passes with .not when it fails', () => {
        const events: ParsedSSEEvent[] = [{ id: '1', event: 'error', data: {} }];
        expect(events).not.toCompleteSuccessfully();
    });

    it('fails with .not when it passes', () => {
        const events: ParsedSSEEvent[] = [{ id: '1', event: 'done', data: {} }];
        expect(() => expect(events).not.toCompleteSuccessfully()).toThrow(/Expected stream NOT to complete successfully/);
    });
  });

  describe('toEmitSnapshot', () => {
    it('passes when snapshot matches partial data', () => {
      const events: ParsedSSEEvent[] = [
        { id: '1', event: 'snapshot', data: { status: 'completed', score: 100 } }
      ];
      expect(events).toEmitSnapshot({ status: 'completed' });
    });

    it('fails when snapshot data does not match', () => {
      const events: ParsedSSEEvent[] = [
        { id: '1', event: 'snapshot', data: { status: 'pending' } }
      ];
      expect(() => expect(events).toEmitSnapshot({ status: 'completed' })).toThrow(/Expected stream to emit snapshot with {"status":"completed"}, but got {"status":"pending"}/);
    });

    it('fails when no snapshot event is present', () => {
      const events: ParsedSSEEvent[] = [];
      expect(() => expect(events).toEmitSnapshot()).toThrow(/Expected stream to emit snapshot/);
    });
  });

  describe('toFailWithCode', () => {
    it('passes when error has correct code', () => {
      const events: ParsedSSEEvent[] = [
        { id: '1', event: 'error', data: { code: 'LIMIT_EXCEEDED' } }
      ];
      expect(events).toFailWithCode('LIMIT_EXCEEDED');
    });

    it('fails when error has wrong code', () => {
      const events: ParsedSSEEvent[] = [
        { id: '1', event: 'error', data: { code: 'OTHER' } }
      ];
      expect(() => expect(events).toFailWithCode('LIMIT_EXCEEDED')).toThrow(/Expected stream to fail with code LIMIT_EXCEEDED, but got OTHER/);
    });

    it('fails when no error event is present', () => {
      const events: ParsedSSEEvent[] = [];
      expect(() => expect(events).toFailWithCode('LIMIT_EXCEEDED')).toThrow(/Expected stream to fail with code LIMIT_EXCEEDED, but got no error event/);
    });
  });
});
