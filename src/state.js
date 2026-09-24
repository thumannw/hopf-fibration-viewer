import { defaultRotation } from './rotation.js';

export const MAX_SELECTIONS = 8;
export const MAX_NAME_LENGTH = 60;
export function makeSelection(id, extra = {}) {
  return { id, name: '', azimuth: 0, elevation: 0, offset: 0, start: 0, span: 360, count: 16, endpoints: true, visible: true, ...extra };
}
export function defaultState() {
  return { format: 'hopf-explorer', version: 4, selections: [makeSelection('s1', { elevation: 90, offset: -0.5 })], activeId: 's1', clip: 4, thickness: 0.018, guides: true, boundary: false, isolated: false, selectedIndex: null, cameras: null, rotation: defaultRotation() };
}

function number(value, min, max, name, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`Invalid ${name}. Expected ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return value;
}
function boolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${name}.`);
  return value;
}
export function validateState(input) {
  if (!input || input.format !== 'hopf-explorer' || input.version !== 4) throw new Error('This is not a supported Hopf Explorer configuration (version 4 required).');
  if (!Array.isArray(input.selections) || input.selections.length < 1 || input.selections.length > MAX_SELECTIONS) throw new Error('A configuration must contain 1–8 selections.');
  const ids = new Set();
  const selections = input.selections.map(s => {
    if (!s || typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(s.id) || ids.has(s.id)) throw new Error('Invalid or duplicate selection.');
    ids.add(s.id);
    if (typeof s.name !== 'string' || s.name.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(s.name)) throw new Error(`Invalid selection name. Use up to ${MAX_NAME_LENGTH} characters on one line.`);
    return { id:s.id, name:s.name.trim(),
      azimuth:number(s.azimuth,0,360,'axis azimuth'), elevation:number(s.elevation,-90,90,'axis elevation'), offset:number(s.offset,-1,1,'circle offset'),
      start:number(s.start,0,360,'start angle'), span:number(s.span,1,360,'arc length'), count:number(s.count,2,64,'point count',true),
      endpoints:boolean(s.endpoints,'endpoints'),visible:boolean(s.visible,'visibility') };
  });
  let cameras = null;
  if (input.cameras != null) {
    cameras = {};
    for (const name of ['base','fibres']) {
      const c = input.cameras[name];
      if (!c || !Array.isArray(c.position) || !Array.isArray(c.target) || c.position.length!==3 || c.target.length!==3) throw new Error('Invalid saved camera.');
      const position=c.position.map(v=>number(v,-2000,2000,'camera coordinate'));
      const target=c.target.map(v=>number(v,-1000,1000,'camera target'));
      if (Math.hypot(...position.map((v,i)=>v-target[i])) < 0.01) throw new Error('Camera position and target must differ.');
      cameras[name]={position,target};
    }
  }
  const r = input.rotation;
  if (!r || !['x', 'y', 'z'].includes(r.axis) || ![1, -1].includes(r.direction) || !Array.isArray(r.orientation) || r.orientation.length !== 4) throw new Error('Invalid rotation settings.');
  const orientation = r.orientation.map(v => number(v, -1, 1, 'orientation component'));
  const length = Math.hypot(...orientation);
  if (Math.abs(length - 1) > 1e-6) throw new Error('The orientation must be a unit quaternion.');
  const angle = number(r.angle, 0, 360, 'rotation angle');
  const rotation = { orientation: orientation.map(v => v / length), axis: r.axis, speed: number(r.speed, 1, 90, 'rotation speed'), direction: r.direction, angle: angle % 360 };
  return { format:'hopf-explorer',version:4,selections,activeId:ids.has(input.activeId)?input.activeId:selections[0].id,
    clip:number(input.clip,0.5,10,'viewing radius'), thickness:number(input.thickness,0.004,0.06,'fibre thickness'),
    guides:boolean(input.guides,'guides'),boundary:boolean(input.boundary,'boundary'),isolated:boolean(input.isolated,'isolation'),
    selectedIndex:input.selectedIndex == null?null:number(input.selectedIndex,0,511,'selected fibre',true),cameras,rotation };
}

export function preset(name) {
  const state=defaultState();
  if (name==='south') state.selections=[makeSelection('s1',{azimuth:90,start:90,span:180,count:17})];
  if (name==='poles') state.selections=[makeSelection('s1',{azimuth:90,start:0,span:180,count:17})];
  if (name==='crossing') state.selections=[makeSelection('s1',{azimuth:90,count:24}),makeSelection('s2',{azimuth:180,count:24})];
  return state;
}
