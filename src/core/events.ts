// Typed synchronous event bus. One bus per thread; events never cross the worker boundary directly.

export type EventMap = Record<string, unknown>;
type Handler<T> = (payload: T) => void;

export class EventBus<E extends EventMap> {
  private handlers: { [K in keyof E]?: Handler<E[K]>[] } = {};

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let list = this.handlers[type];
    if (!list) {
      list = [];
      this.handlers[type] = list;
    }
    list.push(handler);
    return () => this.off(type, handler);
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    const list = this.handlers[type];
    if (!list) return;
    const i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const list = this.handlers[type];
    if (!list) return;
    for (const h of list.slice()) h(payload);
  }
}
