import { bus } from '../core/bus.js';

let bound = false;
export default {
  mount() { if (!bound) { document.getElementById('setBack').onclick = () => bus.emit('nav', { to: 'menu' }); bound = true; } }
};
