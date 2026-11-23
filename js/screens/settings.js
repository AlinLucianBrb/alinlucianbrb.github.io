/* Settings: how the game looks and starts, kept on this browser (js/core/prefs.js), and the list of keys. Every choice is a
   row of buttons; the one in use is lit (aria-pressed). Changes apply at once. */
import { bus } from '../core/bus.js';
import { getPrefs, setPref, TEXT_SIZES, SPEEDS } from '../core/prefs.js';
import { renderKeys } from '../game/keys.js';

const $ = id => document.getElementById(id);
const ROWS = [
  { key: 'textSize', name: 'Text size', note: 'Makes every text in the game bigger.', options: TEXT_SIZES },
  { key: 'effects', name: 'Effects', note: 'Fewer: no flashes on hits and kills, and nothing on the screen pulses or bobs.', options: [['full', 'Full'], ['fewer', 'Fewer']] },
  { key: 'rarityMarks', name: 'Rarity letters', note: 'A letter on items and relics (C, U, R, E), so rarity does not depend on colour alone.', options: [[true, 'On'], [false, 'Off']] },
  { key: 'speed', name: 'Game speed at the start', note: 'For solo matches. 2x unlocks in Act 3; 3x is for Endless.', options: SPEEDS.map(s => [s, s + 'x']) },
  { key: 'auto', name: 'Auto-start', note: 'Solo matches begin with Auto-start on.', options: [[false, 'Off'], [true, 'On']] },
  { key: 'playOnPick', name: 'Keep playing while choosing', note: 'A solo match goes on while the relic choice is open.', options: [[false, 'Off'], [true, 'On']] }
];

function render() {
  const box = $('setRows'), p = getPrefs(); box.textContent = '';
  for (const r of ROWS) {
    const row = document.createElement('div'), label = document.createElement('div'), name = document.createElement('b'), note = document.createElement('small'), opts = document.createElement('div');
    row.className = 'setrow'; label.className = 'setlabel'; opts.className = 'tabs setopts';
    name.textContent = r.name; note.textContent = r.note; note.className = 'muted';
    opts.setAttribute('role', 'group'); opts.setAttribute('aria-label', r.name);
    for (const [value, text] of r.options) {
      const b = document.createElement('button'), on = p[r.key] === value;
      b.textContent = text; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      b.onclick = () => { setPref(r.key, value); render(); };
      opts.append(b);
    }
    label.append(name, note); row.append(label, opts); box.append(row);
  }
}

let bound = false;
export default {
  mount() {
    if (!bound) { $('setBack').onclick = () => bus.emit('nav', { to: 'menu' }); bound = true; }
    render(); renderKeys($('setKeys'));
  }
};
