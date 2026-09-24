/** Conventions: q=a+bi+cj+dk, P(q)=(c,d,b)/(1+a), h(q)=qiq^-1.
 * Base coordinates (X,Y,Z) are the (j,k,i) coefficients of h(q).
 * North maps to the z-axis; south maps to the unit circle in z=0.
 */
export const TAU = 2 * Math.PI;
export const radians = degrees => degrees * Math.PI / 180;
export const degrees = angle => angle * 180 / Math.PI;
export const norm = p => Math.hypot(...p);
export const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

// Right-handed frame: u is the projection of north onto the circle plane,
// v = n × u. Exactly vertical axes use +X for u, independent of azimuth.
export function circleFrame(azimuth, elevation) {
  if (Math.abs(elevation) === 90) {
    const sign = Math.sign(elevation);
    return { n: [0, 0, sign], u: [1, 0, 0], v: [0, sign, 0] };
  }
  const a = radians(azimuth), e = radians(elevation);
  const ca = Math.cos(a), sa = Math.sin(a), ce = Math.cos(e), se = Math.sin(e);
  return { n: [ce * ca, ce * sa, se], u: [-se * ca, -se * sa, ce], v: [sa, -ca, 0] };
}

export function isCollapsedSelection(selection) {
  return Math.abs(selection.offset) === 1;
}

export function pointOnBase(selection, angleDegrees) {
  const t = radians(angleDegrees);
  const { n, u, v } = circleFrame(selection.azimuth, selection.elevation);
  const d = selection.offset, radius = Math.sqrt((1 - d) * (1 + d));
  return n.map((value, i) => d * value + radius * (Math.cos(t) * u[i] + Math.sin(t) * v[i]));
}

export function sampleSelection(selection) {
  const closed = selection.span === 360;
  return Array.from({ length: selection.count }, (_, i) => {
    // Midpoints for open arcs with excluded endpoints; otherwise include both ends.
    const fraction = closed ? i / selection.count : selection.endpoints ? i / (selection.count - 1) : (i + 0.5) / selection.count;
    return pointOnBase(selection, selection.start + selection.span * fraction);
  });
}

export function collectFibres(selections) {
  const points = [];
  for (const selection of selections.filter(s => s.visible)) {
    sampleSelection(selection).forEach((point, sampleIndex) => {
      const existing = points.find(item => distance(item.point, point) < 1e-10);
      const owner = { selectionId: selection.id, sampleIndex };
      if (existing) existing.owners.push(owner);
      else points.push({ point, owners: [owner] });
    });
  }
  return points;
}

export function fibreForPoint(point) {
  const length = norm(point);
  if (!Number.isFinite(length) || length < 1e-14) throw new Error('Expected a nonzero finite base point.');
  const [x, y, z] = point.map(v => v / length);
  const horizontal = Math.hypot(x, y);
  const theta = Math.atan2(horizontal, z);
  if (theta < 1e-13) return { kind: 'line', theta: 0, rootRadius: 0 };
  const r = Math.tan(theta / 4);
  const R = 1 / Math.sin(theta / 2);
  const b = Math.cos(theta / 2) * R;
  // The root's azimuth is the base longitude + pi/2.
  const er = horizontal > 1e-13 ? [-y / horizontal, x / horizontal, 0] : [1, 0, 0];
  return { kind: 'circle', theta, rootRadius: r, radius: R, offset: b, er, ep: [-er[1], er[0], 0] };
}

export function circlePoint(fibre, u) {
  // r - 2 R sin²(u/2) avoids catastrophic cancellation near the north pole.
  const radial = fibre.rootRadius - 2 * fibre.radius * Math.sin(u / 2) ** 2;
  const tangential = -Math.sin(u);
  return [radial * fibre.er[0] + tangential * fibre.ep[0], radial * fibre.er[1] + tangential * fibre.ep[1], fibre.offset * Math.sin(u)];
}

export function clippedFibre(fibre, bound) {
  if (!Number.isFinite(bound) || bound <= 0) throw new Error('Expected a positive clipping radius.');
  if (fibre.kind === 'line') {
    return { closed: false, clipped: true, empty: false, at: t => [0, 0, (2 * t - 1) * bound], extent: bound };
  }
  if (bound < fibre.rootRadius) return { empty: true, closed: false, clipped: true };
  const furthest = 1 / fibre.rootRadius;
  const closed = bound >= furthest - 1e-12;
  // |gamma(u)|² = r² + 4 b R sin²(u/2).
  const halfAngle = closed ? Math.PI : 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, (bound * bound - fibre.rootRadius ** 2) / (4 * fibre.offset * fibre.radius)))));
  return {
    empty: false, closed, clipped: !closed, halfAngle, extent: Math.min(bound, furthest),
    at: t => circlePoint(fibre, -halfAngle + 2 * halfAngle * t),
  };
}

export function baseCoordinates(point) {
  return { latitude: degrees(Math.atan2(point[2], Math.hypot(point[0], point[1]))), longitude: ((degrees(Math.atan2(point[1], point[0])) % 360) + 360) % 360 };
}

// An independent quaternion route, also useful for checking the circle formula.
export function multiply(p, q) {
  const [a,b,c,d]=p, [e,f,g,h]=q;
  return [a*e-b*f-c*g-d*h, a*f+b*e+c*h-d*g, a*g-b*h+c*e+d*f, a*h+b*g-c*f+d*e];
}
export function inverseProjection([x,y,z]) {
  const n = x*x+y*y+z*z;
  return [(1-n)/(1+n), 2*z/(1+n), 2*x/(1+n), 2*y/(1+n)];
}
export function hopf(q) {
  const result=multiply(multiply(q,[0,1,0,0]),[q[0],-q[1],-q[2],-q[3]]);
  return [result[2],result[3],result[1]];
}
