/* One shared tooltip. bindTip(el, () => ({ title, color, lines: [string | { text, color }] })) shows it on hover, focus or touch. */
let tip = null;
const ensure = () => {
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; document.body.append(tip); }
  return tip;
};
function render(c) {
  const t = ensure(); t.textContent = '';
  if (c.title) { const h = document.createElement('b'); h.textContent = c.title; if (c.color) h.style.color = c.color; t.append(h); }
  for (const ln of c.lines || []) {
    const d = document.createElement('div'), o = typeof ln === 'string' ? { text: ln } : ln;
    d.textContent = o.text; if (o.color) d.style.color = o.color; t.append(d);
  }
}
function place(x, y) {
  const t = ensure(); t.hidden = false;
  const r = t.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  t.style.left = Math.max(4, Math.min(x + 14, vw - r.width - 4)) + 'px';
  t.style.top = Math.max(4, y + 16 + r.height > vh ? y - r.height - 10 : y + 16) + 'px';
}
export const hideTip = () => { if (tip) tip.hidden = true; };
export function bindTip(el, getContent) {
  if (el.setAttribute) el.setAttribute('data-tip', '');
  const show = e => { render(getContent()); place(e.clientX || 0, e.clientY || 0); };
  el.addEventListener('pointerenter', show);
  el.addEventListener('pointerdown', show);
  el.addEventListener('pointermove', e => { if (tip && !tip.hidden) place(e.clientX, e.clientY); });
  el.addEventListener('click', () => setTimeout(() => { if (tip && !tip.hidden) render(getContent()); }, 0));
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); render(getContent()); place(r.left, r.bottom); });
  el.addEventListener('blur', hideTip);
}
/* Tapping anywhere else hides it (touch screens). */
document.addEventListener('pointerdown', e => { if (!(e.target && e.target.closest && e.target.closest('[data-tip]'))) hideTip(); });
