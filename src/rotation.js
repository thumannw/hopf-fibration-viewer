import { multiply, radians } from './geometry.js';

// Orientations use Hamilton order [1, i, j, k]. The base's XYZ axes are (j, k, i).
export function defaultRotation() {
  return { orientation: [1, 0, 0, 0], axis: 'x', speed: 20, direction: 1, angle: 0 };
}

export const wrapAngle = value => ((value % 360) + 360) % 360;
export const angleDelta = (from, to) => wrapAngle(to - from + 180) - 180;

export function axisRotation(axis, angleDegrees) {
  const halfAngle = radians(angleDegrees) / 2;
  const q = [Math.cos(halfAngle), 0, 0, 0];
  q[{ x: 2, y: 3, z: 1 }[axis]] = Math.sin(halfAngle);
  return q;
}

export function rotateBasePoint([x, y, z], orientation) {
  const [a, b, c, d] = orientation;
  const result = multiply(multiply(orientation, [0, z, x, y]), [a, -b, -c, -d]);
  return [result[2], result[3], result[1]];
}

export function advanceOrientation(rotation, seconds) {
  return turnOrientation(rotation.orientation, rotation.axis, rotation.direction * rotation.speed * seconds);
}

function turnOrientation(orientation, axis, angle) {
  // Pre-multiply: the axis belongs to the fixed base frame, not the moving selection.
  const q = multiply(axisRotation(axis, angle), orientation);
  const length = Math.hypot(...q);
  return q.map(value => value / length);
}

export function advanceRotation(rotation, seconds) {
  return { ...rotation, orientation: advanceOrientation(rotation, seconds),
    angle: wrapAngle(rotation.angle + rotation.direction * rotation.speed * seconds) };
}

export function setRotationAngle(rotation, value) {
  const angle = wrapAngle(value);
  return { ...rotation, angle,
    orientation: turnOrientation(rotation.orientation, rotation.axis, angleDelta(rotation.angle, angle)) };
}

export function changeRotationAxis(rotation, axis) {
  // Each axis change starts a new step; the accumulated pose is its zero reference.
  return axis === rotation.axis ? rotation : { ...rotation, axis, angle: 0 };
}
