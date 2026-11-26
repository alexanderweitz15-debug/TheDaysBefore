import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';

type Ev = { a: number; b: string };

describe('EventBus', () => {
  it('delivers payloads to subscribers in registration order', () => {
    const bus = new EventBus<Ev>();
    const seen: string[] = [];
    bus.on('a', (n) => seen.push(`1:${n}`));
    bus.on('a', (n) => seen.push(`2:${n}`));
    bus.emit('a', 7);
    expect(seen).toEqual(['1:7', '2:7']);
  });

  it('only notifies handlers of the emitted type', () => {
    const bus = new EventBus<Ev>();
    const seen: string[] = [];
    bus.on('a', () => seen.push('a'));
    bus.on('b', () => seen.push('b'));
    bus.emit('b', 'x');
    expect(seen).toEqual(['b']);
  });

  it('emit without handlers is a no-op', () => {
    const bus = new EventBus<Ev>();
    expect(() => bus.emit('a', 1)).not.toThrow();
  });

  it('off removes a handler', () => {
    const bus = new EventBus<Ev>();
    let count = 0;
    const h = () => {
      count++;
    };
    bus.on('a', h);
    bus.emit('a', 1);
    bus.off('a', h);
    bus.emit('a', 1);
    expect(count).toBe(1);
  });

  it('off for unknown handler or type does nothing', () => {
    const bus = new EventBus<Ev>();
    expect(() => bus.off('a', () => {})).not.toThrow();
    bus.on('a', () => {});
    expect(() => bus.off('a', () => {})).not.toThrow();
  });

  it('on returns an unsubscribe function', () => {
    const bus = new EventBus<Ev>();
    let count = 0;
    const un = bus.on('a', () => {
      count++;
    });
    bus.emit('a', 1);
    un();
    bus.emit('a', 1);
    expect(count).toBe(1);
  });

  it('unsubscribing during emit does not skip other handlers in that emit', () => {
    const bus = new EventBus<Ev>();
    const seen: string[] = [];
    const h2 = () => {
      seen.push('h2');
    };
    bus.on('a', () => {
      seen.push('h1');
      bus.off('a', h2);
    });
    bus.on('a', h2);
    bus.on('a', () => seen.push('h3'));
    bus.emit('a', 1);
    expect(seen).toEqual(['h1', 'h2', 'h3']); // snapshot semantics
    seen.length = 0;
    bus.emit('a', 1);
    expect(seen).toEqual(['h1', 'h3']);
  });

  it('a handler removing itself during emit works and fires once', () => {
    const bus = new EventBus<Ev>();
    let count = 0;
    const un = bus.on('a', () => {
      count++;
      un();
    });
    bus.emit('a', 1);
    bus.emit('a', 1);
    expect(count).toBe(1);
  });

  it('handlers added during emit run only from the next emit', () => {
    const bus = new EventBus<Ev>();
    let late = 0;
    bus.on('a', () => {
      bus.on('a', () => {
        late++;
      });
    });
    bus.emit('a', 1);
    expect(late).toBe(0);
    bus.emit('a', 1);
    expect(late).toBe(1);
  });
});
