// Observes submitted commands (for tutorial conditions) without changing them.
import type { CommandSink } from '../core/types/app';

type Cmd = Parameters<CommandSink['submit']>[0];
const listeners = new Set<(c: Cmd) => void>();

export function onCommand(l: (c: Cmd) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function tapCommands(inner: CommandSink): CommandSink {
  return {
    submit(c) {
      inner.submit(c);
      for (const l of listeners) l(c);
    },
  };
}
