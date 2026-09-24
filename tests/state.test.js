import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, validateState, preset, makeSelection, MAX_NAME_LENGTH } from '../src/state.js';
import { axisRotation } from '../src/rotation.js';

test('configurations and all presets round-trip through JSON',()=>{
  for(const name of ['torus','south','poles','crossing']){
    const state=preset(name);assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))),state);
  }
});
test('camera and selected fibre survive a saved configuration',()=>{
  const s=defaultState();s.clip=0.5;s.selectedIndex=3;s.cameras={base:{position:[2,-4,2],target:[0,0,0]},fibres:{position:[3,4,5],target:[.1,.2,.3]}};
  assert.deepEqual(validateState(s),s);
});
test('invalid files and unbounded workloads are rejected',()=>{
  for(const value of [null,{},[],{...defaultState(),version:5},{...defaultState(),clip:Infinity},{...defaultState(),clip:0.4},{...defaultState(),clip:10.1},{...defaultState(),thickness:-1}])assert.throws(()=>validateState(value));
  for(const change of [{count:1},{count:1000000},{count:2.5},{start:'0'},{span:0},{visible:'false'},{id:'<script>'}]){
    const s=defaultState();Object.assign(s.selections[0],change);assert.throws(()=>validateState(s));
  }
  const s=defaultState();s.selections.push({...s.selections[0]});assert.throws(()=>validateState(s));
});
test('camera inputs are finite, bounded and nondegenerate',()=>{
  const s=defaultState();s.cameras={base:{position:[0,0,0],target:[0,0,0]},fibres:{position:[1,2,3],target:[0,0,0]}};
  assert.throws(()=>validateState(s));
});

test('rotation settings round-trip without storing playback state',()=>{
  for(const axis of ['x','y','z']){
    const state=defaultState();state.rotation={orientation:axisRotation(axis,123),axis,speed:35,direction:-1,angle:27.5};
    const loaded=validateState(JSON.parse(JSON.stringify(state)));
    assert.equal(loaded.rotation.axis,axis);assert.equal(loaded.rotation.speed,35);assert.equal(loaded.rotation.direction,-1);
    assert.equal(loaded.rotation.angle,27.5);
    loaded.rotation.orientation.forEach((v,i)=>assert.ok(Math.abs(v-state.rotation.orientation[i])<1e-12));
    assert.equal('playing' in loaded,false);
  }
});

test('circle configurations round-trip including inactive arc and azimuth settings',()=>{
  const state=preset('crossing');
  state.selections.push(makeSelection('s3',{azimuth:123.5,elevation:90,offset:-1,start:79,span:133,count:37,endpoints:false}));
  state.activeId='s3';state.rotation.orientation=axisRotation('z',41);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))),state);
});

test('axis and offset inputs must be finite numbers within their bounds',()=>{
  for(const change of [{azimuth:-1},{azimuth:361},{azimuth:'90'},{azimuth:null},{elevation:-91},{elevation:91},{elevation:NaN},{offset:-1.01},{offset:1.01},{offset:Infinity},{offset:undefined}]){
    const state=defaultState();state.selections=[makeSelection('a',change)];
    assert.throws(()=>validateState(state));
  }
});

test('saved dial angles are finite numbers in one turn, with 360 normalized to zero',()=>{
  for(const angle of [undefined,null,'90',NaN,Infinity,-1,361]){
    const state=defaultState();state.rotation.angle=angle;assert.throws(()=>validateState(state));
  }
  const state=defaultState();state.rotation.angle=360;assert.equal(validateState(state).rotation.angle,0);
});

test('invalid axes, speeds, directions and quaternion orientations are rejected',()=>{
  for(const change of [{axis:'w'},{speed:0},{speed:91},{speed:'20'},{direction:0},{direction:'1'},
    {orientation:[0,0,0,0]},{orientation:[1,1,1,1]},{orientation:[1,0,0]},{orientation:[1,0,0,NaN]}]) {
    const state=defaultState();Object.assign(state.rotation,change);assert.throws(()=>validateState(state));
  }
  const state=defaultState();delete state.rotation;assert.throws(()=>validateState(state));
});

test('new circles use neutral defaults and every preset uses the same representation',()=>{
  const circle=makeSelection('a');
  assert.equal(circle.azimuth,0);assert.equal(circle.elevation,0);assert.equal(circle.offset,0);assert.equal(circle.name,'');
  for(const name of ['torus','south','poles','crossing'])for(const s of preset(name).selections){
    assert.deepEqual(Object.keys(s),Object.keys(circle));
    for(const removed of ['type','latitude','longitude'])assert.equal(removed in s,false);
  }
});

test('optional names round-trip as text and invalid names are rejected',()=>{
  for(const name of ['', 'Circle α', '<b>literal text</b>', 'x'.repeat(MAX_NAME_LENGTH)]){
    const state=defaultState();state.selections[0].name=name;
    assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))),state);
  }
  const state=defaultState();state.selections[0].name='  My circle  ';
  assert.equal(validateState(state).selections[0].name,'My circle');
  for(const name of [null,undefined,12,'x'.repeat(MAX_NAME_LENGTH+1),'two\nlines','tab\there']){
    state.selections[0].name=name;assert.throws(()=>validateState(state));
  }
});

test('only the current configuration format is supported',()=>{
  for(const version of [1,2,3,5])assert.throws(()=>validateState({...defaultState(),version}),/version 4 required/);
});
