/* Every key of a match, for the Keys window (H or ? in a match) and the Settings screen. The keys themselves are handled in
   game.js: change both together. */
export const KEYS = [
  ['1, 2, 3', 'Choose a hero; in a choice window, that card (0: none)'],
  ['Click a tile', 'Place the chosen hero there'],
  ['Space or R', 'Buy a relic'],
  ['E', 'Evolve the selected hero'],
  ['M', 'Move the selected hero'],
  ['G', 'Gamble (the shop)'],
  ['Enter', 'Start the next wave'],
  ['P', 'Pause (solo)'],
  ['Esc', 'Close a window, cancel, or resume'],
  ['Arrows or W A S D', 'Move the map'],
  ['+ − or the wheel', 'Zoom'],
  ['F', 'Fit the map to the screen'],
  ['H or ?', 'This list of keys']
];
/* Fills a box with the list: each key in a key cap, then what it does. */
export function renderKeys(box) {
  box.textContent = '';
  for (const [k, what] of KEYS) {
    const row = document.createElement('div'), cap = document.createElement('kbd'), t = document.createElement('span');
    row.className = 'keyrow'; cap.textContent = k; t.textContent = what;
    row.append(cap, t); box.append(row);
  }
}
