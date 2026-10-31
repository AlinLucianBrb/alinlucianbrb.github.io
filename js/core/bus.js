/* Tiny event bus: modules talk through events instead of importing each other. */
export function createBus() {
  const handlers = new Map();
  return {
    on(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn); return () => handlers.get(event).delete(fn); },
    emit(event, data) { const set = handlers.get(event); if (set) set.forEach(fn => fn(data)); }
  };
}
export const bus = createBus();
