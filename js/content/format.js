import { STAT_LABELS } from './data.js';

/* Human-readable text for one modifier, e.g. "+4% damage". */
export function fmtMod(m) {
  if (m.stat === 'speed3x') return 'Unlocks 3x game speed';
  const f = x => +x.toFixed(2), label = (STAT_LABELS[m.stat] || m.stat).toLowerCase();
  return m.type === 'inc' ? '+' + f(m.value * 100) + '% ' + label : m.type === 'flat' ? '+' + f(m.value) + ' ' + label : '×' + f(1 + m.value) + ' ' + label;
}
