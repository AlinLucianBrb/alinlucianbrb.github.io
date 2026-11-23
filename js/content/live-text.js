/* Numbers in ability texts that follow a hero's stats (gear, relics, levels, talents...). A text marks them:
     {N}       N times the hero's damage ("about 371 damage"); without stats "N times his damage"
     {t:N}     N seconds, made longer by the duration stat (only where the game uses it: buffs and effects the hero gives)
     {s:key}   a stat as it is (jumps)
     {p:key}   a stat as a percentage (rootChance)
   liveParts(text, s, base) cuts the text into parts; a part whose number differs from what it is with `base` (the same hero
   with no gear, relics, talents or levels) is `changed`: the screen shows those in yellow. Pure: no page, no clock. */
export const CHANGED_COLOR = '#ffd84a';
const r1 = x => Math.round(x * 10) / 10;
const num = x => String(+x.toFixed(2));

function value(kind, arg, s) {
  if (kind === '') return s && s.damage > 0 ? Math.round(+arg * s.damage) : null;
  if (kind === 't') return r1(+arg * (s && s.duration > 0 ? s.duration : 1));
  if (kind === 's') return s && arg in s ? Math.round(s[arg] * 100) / 100 : null;
  if (kind === 'p') return s && arg in s ? Math.round(s[arg] * 1000) / 10 : null;
  return null;
}
function words(kind, arg, v) {
  if (kind === '') return v === null ? arg + ' times his damage' : 'about ' + v + ' damage';
  if (kind === 't') return num(v) + (v === 1 ? ' second' : ' seconds');
  if (kind === 's') return v === null ? '' : num(v);
  if (kind === 'p') return v === null ? '' : num(v) + '%';
  return '';
}
/* [{ text, changed }] */
export function liveParts(text, s = null, base = null) {
  const out = [], re = /\{(?:([tsp]):)?([\w.]+)\}/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), changed: false });
    const kind = m[1] || '', arg = m[2], v = value(kind, arg, s || base), b = base ? value(kind, arg, base) : v;
    out.push({ text: words(kind, arg, v), changed: !!s && !!base && v !== null && b !== null && v !== b });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last), changed: false });
  return out;
}
export const liveText = (text, s = null, base = null) => liveParts(text, s, base).map(p => p.text).join('');
/* As tooltip line parts: the changed numbers in yellow. */
export const tipParts = (text, s, base) => ({ parts: liveParts(text, s, base).map(p => (p.changed ? { text: p.text, color: CHANGED_COLOR } : { text: p.text })) });
