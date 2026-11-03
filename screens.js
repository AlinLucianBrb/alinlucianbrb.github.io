/* Screen manager: each screen is a <section id="screen-NAME"> plus an object with optional mount(el, params) / unmount(). */
const screens = new Map();
let current = null;
export function register(name, screen) { screens.set(name, screen); }
export async function show(name, params) {
  if (current) { screens.get(current).unmount?.(); document.getElementById('screen-' + current).hidden = true; }
  current = name;
  const el = document.getElementById('screen-' + name);
  el.hidden = false;
  await screens.get(name).mount?.(el, params);
}
