# Hopf Explorer

A portable, interactive explorer of the Hopf fibration under stereographic projection. Select circles or arcs on the base sphere and see their fibres in three-dimensional space.

## Open it

Double-click **`hopf-explorer.html`**, or open it from your browser's File → Open menu. Copy this one file to another computer to use it there. No installation, server, internet connection, or CDN is needed. Use a current desktop browser with WebGL 2 enabled.

The HTML includes all code, styles, and the Three.js renderer. The files under `src/`, `scripts/`, and `tests/` are for editing and rebuilding, not required to run the finished explorer.

## Explore

- **Latitude torus:** equally spaced fibres over a latitude circle.
- **Through south:** a meridian arc from the equator through the south pole to the opposite equator.
- **Pole to pole:** a north-to-south meridian arc, including the straight fibre.
- **Two meridians:** two full great circles, with shared pole fibres merged.
- Add up to eight circle selections with **+ Add circle**; each supports 2–64 samples, a start angle, and a 1–360° arc.
- Selections are numbered. To rename one, select it and enter an optional **Name** in the editor (up to 60 characters); press Enter or leave the field to apply. Clear the name to show only its number. Names are saved with configurations.
- Full circles omit duplicate endpoints. Partial arcs can include both endpoints or sample interval midpoints. Coincident base points are deduplicated, including circles collapsed to a point at offset ±1.
- Click a base point or fibre to highlight its partner. The fibre menu provides keyboard selection. Isolate a selected fibre to inspect its shape.
- A pale arrow in the base view shows the active circle's positive axis, from the sphere centre outward. It follows axis edits and global rotation, and disappears when that selection is hidden. It remains visible through the sphere and is independent of the coordinate grid.
- Each view has independent orbit/zoom controls. Right-drag pans the fibre view. On a focused canvas, arrow keys orbit, +/− zoom, and Home resets/fits. Touch supports orbit and pinch.
- Geometry edits preserve the camera. Use **Fit** to include all visible centre-lines, or **Top** / **Front** for aligned views.
- **Save configuration** / **Load** round-trip geometry, display settings, selection, base orientation, animation settings and both cameras. Loading always pauses playback. Save image downloads the fibre view as PNG.

Meridian angles start at north: 0° north, 90° equator, 180° south, 270° opposite equator. A meridian longitude plus 180° describes the same full great circle traversed in the other direction.

## Circles

Choose **+ Add circle**. All selections, including the family examples, use the same controls. Each selection has its own axis, independent of the global base rotation. New circles start at azimuth 0°, elevation 0° and offset 0:

- **Axis azimuth:** 0–360°, measured from +X toward +Y in the fixed XY plane.
- **Axis elevation:** −90° to +90°, measured above the fixed XY plane.
- **Centre offset:** signed distance along the unit axis, from −1 to +1. Zero gives a great circle; positive and negative values give small circles on opposite sides of its equator.
- **Start angle**, **Arc length**, **Number of points** and **Include both arc endpoints** control the sampled arc. Arc length is the angular sweep around the circle: 180° always selects half the circle, regardless of its radius.

For azimuth `a`, elevation `e`, offset `d` and arc parameter `t`, the axis and circle are

```
n = (cos(e) cos(a), cos(e) sin(a), sin(e))
u = (−sin(e) cos(a), −sin(e) sin(a), cos(e))
v = n × u = (sin(a), −cos(a), 0)
p(t) = d n + sqrt(1 − d²) (cos(t) u + sin(t) v).
```

The centre is `d n`, the radius is `sqrt(1 − d²)`, and every point lies on both the unit sphere and the plane `n · p = d`. Start 0° points along the projection of north into the circle plane, giving the point nearest north. Positive angles follow the right-hand rule about `n`.

At exactly vertical axes (elevation ±90°), use `u = (1, 0, 0)` and `v = (0, sign(e), 0)`. Azimuth is disabled and ignored there, retaining its value for when the axis tilts again. Like longitude at a pole, this coordinate convention has a singularity: reaching a vertical axis may change the arc reference abruptly. Full circle geometry is unchanged, though the sample positions can shift.

At offset ±1, all samples coincide at `±n`, producing one base point and one fibre. The arc, sample-count and endpoint controls are disabled with their values retained. Returning inside the range restores those settings. Collapsed circles do not render a degenerate guide tube.

A +Z axis with `d = sin(latitude)` reproduces a latitude circle with the same start angle. Elevation 0°, azimuth `longitude + 90°` (modulo 360°), and offset 0 reproduce a meridian with its usual start at north. Global base rotation is applied after each selection's individual geometry.

## Animate the base

The **Base rotation** bar moves every selection together about a fixed X, Y or Z axis of the base sphere. Choose an axis and press **Play**. Speed is in degrees per second on S² (1–90°/s, initially 20°/s). **Pause** freezes the current pose; **Reverse** changes direction. Axis changes continue from the current orientation, so X, Y and Z rotations can be composed. **Reset orientation** pauses and returns to the original arrangement, preserving the circle definitions and cameras. Loading a preset resets both geometry and rotation.

The **rotation dial** shows the current step around the selected axis, modulo 360°. Switching axes preserves the accumulated pose and starts the next step at 0°. Returning the dial to 0° restores the pose at the start of that step; **Reset orientation** restores the original arrangement. The dial follows playback live. Drag or touch it, or enter an angle in degrees, to pause and adjust the pose immediately. Negative angles and complete turns wrap around. With the dial focused, arrow keys move by 1° (Shift: 10°), Page Up/Down by 15°, Home goes to 0°, and End to 359°.

Colours, highlighting and isolation follow the moving points. The original selection controls retain their meaning: an original latitude circle may become an inclined circle after rotation. The inspector shows the current point's coordinates and fibre radius. The sphere's reference grid, north/south labels and both cameras remain fixed; mouse orbiting still controls only the camera. Zoom out or use **Fit** when growing fibres need more room. Playback pauses when the page becomes hidden and stays paused when you return.

Configuration version 4 stores a single circle representation: each selection has `name`, `azimuth`, `elevation`, `offset`, `start`, `span`, `count`, `endpoints` and `visible`, plus its stable `id`. It stores global orientation as a unit quaternion in Hamilton order `[1, i, j, k]`, the rotation axis, speed, direction and current-step `angle`. It does not store whether playback is running. Only version 4 configurations are supported.

## Mathematical conventions

Write `q = a + bi + cj + dk`. The Hopf map is `h(q) = q i q⁻¹`, with base coordinates ordered as `(j, k, i)`. Fibres are the orbits `q exp(t i)`. Stereographic projection is

```
P(q) = (c, d, b) / (1 + a).
```

Thus `1` projects to the origin and `−1` to infinity. North (`+i`) corresponds to the z-axis; south (`−i`) corresponds to the unit circle in the x-y plane. Every other fibre is a planar circle.

If a base point has colatitude `θ` and longitude `ψ`, define

```
r = tan(θ/4), R = csc(θ/2), b = cot(θ/2)
φ = ψ + π/2
er = (cos φ, sin φ, 0), eφ = (−sin φ, cos φ, 0)
γ(u) = [r − 2R sin²(u/2)] er − sin(u) eφ + b sin(u) ez.
```

This circle has radius `R` and centre `−b er`. Its inner intersection with z=0 has radius `r`, and its outer intersection has radius `1/r`. Fixed `θ` gives a torus of major radius `R` and minor radius `b`. The equator of S² corresponds to `r = √2 − 1`, not `r = 1/2`. At south the azimuth is arbitrary and all representatives describe the same unit circle.

### Left action and rotation

For a unit quaternion `a`, `h(aq) = a h(q) a⁻¹`. In the base coordinates `(j, k, i)`, a positive X rotation by angle `θ` uses `a = exp(θj/2)`, a positive Y rotation uses `a = exp(θk/2)`, and a positive Z rotation uses `a = exp(θi/2)`. Rotation increments pre-multiply the accumulated orientation, giving fixed world axes and preserving the current pose on axis changes. A 360° turn gives `a = −1`, which acts trivially on the base and restores the same fibres.

The renderer rotates the base points and curves, then evaluates the analytic fibre over each moved point. It does not apply a rigid Euclidean rotation to the projected fibre meshes: their centres and radii generally change. Shared samples are deduplicated before rotation, so their identities and colours remain stable. Playback uses elapsed time, including the remainder between the last rendered frame and a pause or direction change.

### Infinity and clipping

The viewing sphere radius ranges from 0.5 to 10. At small radii some fibres lie entirely outside the sphere; the scene status and inspector identify these.

The north fibre is represented explicitly as a line. For other fibres,

```
|γ(u)|² = r² + 4bR sin²(u/2).
```

This identity gives exact intersections with a viewing sphere, without sampling a distant circle and connecting across infinity. The cancellation-resistant circle formula remains stable close to north. Only the visible connected arc is tessellated. Beads mark clipping endpoints; they are visual indicators, not physical joints. Clipping applies to centre-lines, so tubes can extend one tube radius beyond the boundary. The displayed tube thickness is illustrative, and sufficiently thick fibres may overlap.

Fibre meshes use reusable position/normal buffers and an analytic circle frame. Circles, clipped arcs and the line have the same buffer topology; endpoint markers are reused and shown only when clipped. This avoids rebuilding meshes, materials, base guides or controls on each animation frame. Smoothness depends on the computer and the number of fibres; the full 512-sample configuration is substantially heavier than a single latitude.

## Development

Use **Node.js 24 or newer** and **pnpm 12.5.1**. The package-manager version is recorded in `package.json`; `.nvmrc` selects Node 24 if you use nvm (`nvm use`). Python is no longer required.

From the project root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

`package.json` declares Three.js 0.180.0 as an application dependency, and esbuild 0.25.10 and Playwright 1.62.1 as development dependencies. `pnpm-lock.yaml` records their exact resolved versions and integrity hashes. Keep it in Git alongside `package.json`; dependencies installed in `node_modules/` are ignored. `pnpm-workspace.yaml` allows esbuild's installation script to prepare its native executable.

`pnpm build` runs `scripts/build.mjs`, which bundles the application and Three.js, embeds styles and the Three.js MIT license, and writes `hopf-explorer.html`. The HTML remains a standalone file that runs offline without Node, pnpm, a server, or additional files. The generated HTML is kept in Git so it is ready to open after checkout. Rebuild it after source changes.

### Browser checks

Install the test browser once, and again when updating Playwright:

```sh
pnpm browsers:install
pnpm test:browser
pnpm test:animation
```

The Playwright package is managed by pnpm. Its Chromium headless browser is installed by Playwright in its standard persistent user cache (`~/.cache/ms-playwright` on Linux), shared across projects. See [Playwright's browser installation documentation](https://playwright.dev/docs/browsers). There is no project-specific tools cache or download script.

Both browser checks open the finished HTML with network access disabled and save screenshots under the ignored `test-results/` directory. They cover picking, presets, editing, save/load, image export, responsive layouts and animation, including pole crossings. They require a machine where Chromium can launch; sandboxed development environments may need permission to run it outside the sandbox.

### Updating dependencies

Use pnpm commands to update the manifest and lockfile together, for example `pnpm add --save-exact three@<version>` or `pnpm add -D --save-exact esbuild@<version>`. After an update, rebuild and run the unit and browser checks above. On a fresh checkout, `pnpm install --frozen-lockfile` restores the recorded versions; it fails if the manifest and lockfile disagree.

Source map:

- `src/geometry.js`: pure base sampling, analytic circles, clipping, quaternion checks.
- `src/rotation.js`: quaternion action, fixed-axis increments, elapsed-time integration and current-step angles.
- `src/angle-dial.js`: circular pointer/touch control with keyboard and numeric input.
- `src/fibre-mesh.js`: reusable analytic tube geometry for animated fibres.
- `src/state.js`: bounded configuration validation and presets.
- `src/app.js`: Three.js scenes, linked selection, controls, file import/export.
- `src/index.html`, `src/styles.css`: accessible interface and responsive layout.
- `scripts/build.mjs`: bundles everything into `hopf-explorer.html`.
- `tests/`: quaternion correspondence, equal spacing, deduplication, pole limits, clipping and configuration validation.

The build preserves a standalone IIFE script, so it works at a `file://` URL without module-loading restrictions. All geometry is generated locally; the output has no external assets or fonts.

Verified with mathematical/configuration/mesh tests and the offline Chromium browser checks, including circle sampling, family presets, pole conventions, collapsed offsets and named configuration round-trips. Other browser engines have not yet been tested.
