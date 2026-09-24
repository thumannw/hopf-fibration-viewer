// A cyclic angle input with pointer, keyboard, and numeric-entry controls.
// onStart lets the caller pause playback before the first value is applied.
import { wrapAngle } from './rotation.js';
const format = value => String(Number(wrapAngle(value).toFixed(1)) % 360);

export function createAngleDial({ id, label, descriptionId, onStart, onInput }) {
  const element = document.createElement('div');
  element.className = 'angle-control';
  const heading = document.createElement('label');
  heading.id = `${id}-label`; heading.htmlFor = `${id}-number`; heading.textContent = label;
  const dial = document.createElement('div');
  dial.id = id; dial.className = 'angle-dial'; dial.tabIndex = 0;
  dial.setAttribute('role', 'slider');
  dial.setAttribute('aria-labelledby', heading.id);
  dial.setAttribute('aria-describedby', descriptionId);
  dial.setAttribute('aria-valuemin', '0'); dial.setAttribute('aria-valuemax', '360');
  dial.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="dial-track" cx="50" cy="50" r="40"/><path class="dial-ticks" d="M50 6v8 M94 50h-8 M50 94v-8 M6 50h8"/><g class="dial-needle"><path d="M50 50V21"/><circle cx="50" cy="18" r="4"/></g><circle class="dial-hub" cx="50" cy="50" r="4"/></svg>';
  const entry = document.createElement('div'); entry.className = 'angle-entry';
  const input = document.createElement('input');
  input.id = `${id}-number`; input.type = 'number'; input.step = '0.1';
  input.setAttribute('aria-describedby', descriptionId);
  const unit = document.createElement('span'); unit.textContent = '°'; unit.setAttribute('aria-hidden', 'true');
  entry.append(input, unit); element.append(heading, dial, entry);
  let value = 0, pointer = null, editing = false;

  function setValue(next, { force = false } = {}) {
    if (force) editing = false;
    value = wrapAngle(next);
    dial.style.setProperty('--dial-angle', `${value}deg`);
    dial.setAttribute('aria-valuenow', format(value));
    dial.setAttribute('aria-valuetext', `${format(value)} degrees`);
    if (!editing) input.value = format(value);
  }
  function apply(next) {
    setValue(next);
    onInput(value);
  }
  function point(event) {
    const bounds = dial.getBoundingClientRect();
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    // Ignore the centre, where the pointer angle is undefined and jittery.
    if (Math.hypot(x, y) < bounds.width * .12) return;
    apply(Math.atan2(x, -y) * 180 / Math.PI);
  }
  dial.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== null || !event.isPrimary) return;
    event.preventDefault(); dial.focus(); onStart();
    pointer = event.pointerId; dial.setPointerCapture(pointer); point(event);
  });
  dial.addEventListener('pointermove', event => { if (event.pointerId === pointer) point(event); });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) dial.addEventListener(name, event => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    if (dial.hasPointerCapture(event.pointerId)) dial.releasePointerCapture(event.pointerId);
  });
  dial.addEventListener('keydown', event => {
    const step = event.shiftKey ? 10 : 1;
    const offsets = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: 15, PageDown: -15 };
    if (!(event.key in offsets) && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault(); onStart();
    apply(event.key === 'Home' ? 0 : event.key === 'End' ? 359 : value + offsets[event.key]);
  });
  input.addEventListener('input', () => {
    editing = true;
    onStart();
    if (Number.isFinite(input.valueAsNumber)) apply(input.valueAsNumber);
  });
  input.addEventListener('blur', () => { editing = false; input.value = format(value); });
  setValue(0);
  return { element, setValue, setLabel: text => { heading.textContent = text; } };
}
