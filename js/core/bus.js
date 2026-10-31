/* Tiny event bus: modules talk through events instead of importing each other. */
const handlers = new Map();
export const bus = {
  on(event, fn) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event).add(fn); return () => handlers.get(event).delete(fn); },
  emit(event, data) { (handlers.get(event) || []).forEach(fn => fn(data)); }
};
