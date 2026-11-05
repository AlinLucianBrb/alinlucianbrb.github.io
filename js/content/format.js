import { STAT_LABELS } from './data.js';

/* Human-readable text for one modifier, e.g. "+4% damage". */
export function fmtMod(m) {
  if (m.stat === 'speed3x') return 'Unlocks 3x game speed';
  const f = x => +x.toFixed(2), label = (STAT_LABELS[m.stat] || m.stat).toLowerCase().replace(/ \(multiplier\)$/, '');
  /* Stats that are shares (chances, penetration, crit damage, relic luck) read as percentages: "+10% crit damage". */
  const pct = /Chance$|Pen$|^critDamage$|^relicLuck$|^interest$|^relicOffers$|^itemRarity$/.test(m.stat), sign = m.value < 0 ? '−' : '+', v = Math.abs(m.value);
  if (m.stat === 'relicOffers') return '+' + f(v * 100) + '% chance of one more relic offer';
  return m.type === 'inc' ? sign + f(v * 100) + '% ' + label : m.type === 'flat' ? sign + (pct ? f(v * 100) + '%' : f(v)) + ' ' + label : '×' + f(1 + m.value) + ' ' + label;
}
