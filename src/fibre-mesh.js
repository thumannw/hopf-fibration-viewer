import * as THREE from 'three';

/** Fixed topology for circles, clipped arcs and the straight fibre.
 * Updating these attributes avoids allocating TubeGeometry and Frenet frames on every tick.
 */
export function createFibreGeometry(segments = 192, sides = 12) {
  const geometry = new THREE.BufferGeometry();
  const count = (segments + 1) * (sides + 1);
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const indices = [];
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  geometry.setIndex(indices);
  const cos = [], sin = [];
  for (let j = 0; j <= sides; j++) {
    const angle = (j % sides) * 2 * Math.PI / sides;
    cos.push(Math.cos(angle)); sin.push(Math.sin(angle));
  }
  geometry.userData.tube = { segments, sides, cos, sin };
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  return geometry;
}

export function updateFibreGeometry(geometry, fibre, path, thickness, bound) {
  const { segments, sides, cos, sin } = geometry.userData.tube;
  const positions = geometry.attributes.position.array, normals = geometry.attributes.normal.array;
  const isLine = fibre.kind === 'line';
  const er = isLine ? [1, 0, 0] : fibre.er;
  const invR = isLine ? 0 : 1 / fibre.radius;
  const ratio = isLine ? 1 : fibre.offset * invR;
  const vx = isLine ? 0 : -fibre.ep[0] * invR;
  const vy = isLine ? 0 : -fibre.ep[1] * invR;
  // Constant unit normal to the circle's plane (or a frame for the z-axis).
  const bx = isLine ? 0 : er[1] * ratio;
  const by = isLine ? -1 : -er[0] * ratio;
  const bz = -invR;
  let index = 0;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let px = 0, py = 0, pz = (2 * t - 1) * bound;
    let nx = 1, ny = 0, nz = 0;
    if (!isLine) {
      // Match the first ring exactly at a closed seam.
      const u = -path.halfAngle + 2 * path.halfAngle * (path.closed && i === segments ? 0 : t);
      const su = Math.sin(u), cu = Math.cos(u);
      const radial = fibre.rootRadius - 2 * fibre.radius * Math.sin(u / 2) ** 2;
      px = radial * er[0] - su * fibre.ep[0];
      py = radial * er[1] - su * fibre.ep[1];
      pz = fibre.offset * su;
      nx = er[0] * cu + vx * su;
      ny = er[1] * cu + vy * su;
      nz = ratio * su;
    }
    for (let j = 0; j <= sides; j++) {
      const x = nx * cos[j] + bx * sin[j];
      const y = ny * cos[j] + by * sin[j];
      const z = nz * cos[j] + bz * sin[j];
      positions[index] = px + thickness * x; normals[index++] = x;
      positions[index] = py + thickness * y; normals[index++] = y;
      positions[index] = pz + thickness * z; normals[index++] = z;
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  // Conservative world-centred bounds remain valid throughout rotations and pole crossings.
  geometry.boundingSphere.radius = bound + thickness;
}
