import test from 'node:test';
import assert from 'node:assert/strict';
import { pointOnBase, sampleSelection, collectFibres, fibreForPoint, clippedFibre, circlePoint, norm, distance, hopf, inverseProjection, circleFrame, isCollapsedSelection } from '../src/geometry.js';
import { makeSelection, preset } from '../src/state.js';
import { axisRotation, rotateBasePoint } from '../src/rotation.js';

const close=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<tolerance,`${a} differs from ${b}`);
const pointClose=(a,b,tolerance=1e-9)=>assert.ok(distance(a,b)<tolerance,`${a} differs from ${b}`);
// Independent coordinate formulas for checking the unified circle representation.
const latitudePoint=(latitude,angle)=>{
  const e=latitude*Math.PI/180,t=angle*Math.PI/180;
  return [Math.cos(e)*Math.cos(t),Math.cos(e)*Math.sin(t),Math.sin(e)];
};
const meridianPoint=(longitude,angle)=>{
  const a=longitude*Math.PI/180,t=angle*Math.PI/180;
  return [Math.sin(t)*Math.cos(a),Math.sin(t)*Math.sin(a),Math.cos(t)];
};

test('north is the z-axis and south is the horizontal unit circle',()=>{
  const north=fibreForPoint([0,0,1]),south=fibreForPoint([0,0,-1]);
  assert.equal(north.kind,'line');assert.equal(south.kind,'circle');close(south.radius,1);
  const line=clippedFibre(north,4);pointClose(line.at(0),[0,0,-4]);pointClose(line.at(1),[0,0,4]);
  for(let i=0;i<20;i++){const p=circlePoint(south,i*.41);close(p[2],0);close(norm(p),1);}
});

test('analytic fibres satisfy the independently evaluated quaternion Hopf map',()=>{
  for(const latitude of [-89,-60,-30,0,42,80,89.9])for(const longitude of [0,17,93,185,277]){
    const base=latitudePoint(latitude,longitude),f=fibreForPoint(base);
    for(let i=0;i<25;i++)pointClose(hopf(inverseProjection(circlePoint(f,i*.273))),base,2e-9);
  }
});

test('all members of a latitude have equal circle radius and lie on the same torus',()=>{
  const selection=makeSelection('a',{elevation:90,offset:Math.sin(-25*Math.PI/180),count:16});
  const members=sampleSelection(selection).map(fibreForPoint);
  const R=members[0].radius,b=members[0].offset;
  for(const f of members){close(f.radius,R);for(let i=0;i<40;i++){const p=circlePoint(f,i*.25);close((Math.hypot(p[0],p[1])-R)**2+p[2]**2,b*b);}}
});

test('root-disc colatitude relation and unique interior anchor are respected',()=>{
  for(const latitude of [-80,-10,0,30,70]){
    const f=fibreForPoint(latitudePoint(latitude,31));
    close(f.rootRadius,Math.tan((90-latitude)*Math.PI/720));
    close(norm(circlePoint(f,0)),f.rootRadius);close(norm(circlePoint(f,Math.PI)),1/f.rootRadius);
  }
  close(fibreForPoint([1,0,0]).rootRadius,Math.SQRT2-1);
});

test('closed selections sample equal circle arc intervals without duplicating endpoint',()=>{
  const points=sampleSelection(makeSelection('a',{elevation:90,offset:-.5,count:16}));
  assert.equal(points.length,16);
  const spacing=distance(points[0],points[1]);
  for(let i=0;i<16;i++){close(norm(points[i]),1);close(distance(points[i],points[(i+1)%16]),spacing);}
});

test('requested half-circle presets have the correct endpoints and pole',()=>{
  const south=sampleSelection(preset('south').selections[0]);
  pointClose(south[0],[1,0,0]);pointClose(south[8],[0,0,-1]);pointClose(south[16],[-1,0,0]);
  const poles=sampleSelection(preset('poles').selections[0]);
  pointClose(poles[0],[0,0,1]);pointClose(poles[8],[1,0,0]);pointClose(poles[16],[0,0,-1]);
  const step=distance(poles[0],poles[1]);for(let i=1;i<16;i++)close(distance(poles[i],poles[i+1]),step);
});

test('excluded endpoints use equally spaced interior interval midpoints',()=>{
  const s=makeSelection('a',{azimuth:90,count:4,start:0,span:180,endpoints:false}),p=sampleSelection(s);
  pointClose(p[0],pointOnBase(s,22.5));pointClose(p[3],pointOnBase(s,157.5));
});

test('shared poles and overlapping circles are deduplicated, hidden selections excluded',()=>{
  assert.equal(collectFibres(preset('crossing').selections).length,46);
  const north=makeSelection('n',{elevation:90,offset:1,count:64}),south=makeSelection('s',{elevation:90,offset:-1,count:64});
  assert.equal(collectFibres([north,south]).length,2);
  assert.equal(collectFibres([makeSelection('a'),makeSelection('b')]).length,16);
  assert.equal(collectFibres([{...north,visible:false}]).length,0);
});

test('clipped circle endpoints lie on the viewing sphere with no outside bridge',()=>{
  for(const latitude of [-40,0,50,89,89.999999]){
    const base=latitudePoint(latitude,17),f=fibreForPoint(base),path=clippedFibre(f,1.5);
    assert.equal(path.clipped,true);assert.equal(path.closed,false);
    for(const t of [0,1])close(norm(path.at(t)),1.5,1e-8);
    for(let i=0;i<=100;i++){
      const p=path.at(i/100);assert.ok(p.every(Number.isFinite));assert.ok(norm(p)<=1.5+1e-9);pointClose(hopf(inverseProjection(p)),base,1e-8);
    }
  }
});

test('near-north curves converge to the visible straight fibre without numerical blowup',()=>{
  for(const theta of [1e-5,1e-8,1e-11]){
    const f=fibreForPoint([Math.sin(theta),0,Math.cos(theta)]),path=clippedFibre(f,4);
    for(const t of [0,.25,.5,.75,1]){const p=path.at(t);assert.ok(p.every(Number.isFinite));assert.ok(Math.hypot(p[0],p[1])<1e-3);close(p[2],(2*t-1)*4,1e-7);}
  }
});

test('a sufficient viewing radius retains a complete, closed circle',()=>{
  const f=fibreForPoint([1,0,0]),path=clippedFibre(f,3);
  assert.equal(path.closed,true);assert.equal(path.clipped,false);pointClose(path.at(0),path.at(1));
  assert.equal(clippedFibre(f,.1).empty,true);
});

test('circles lie on the unit sphere and the requested offset plane, with equal spacing',()=>{
  for(const azimuth of [0,37,180,360])for(const elevation of [-90,-51,0,27,89.999999,90])for(const offset of [-.999999,-.7,0,.4,.999999]){
    const s=makeSelection('a',{azimuth,elevation,offset,count:13,start:23});
    const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
    const n=[Math.cos(e)*Math.cos(a),Math.cos(e)*Math.sin(a),Math.sin(e)];
    const points=sampleSelection(s),radius=Math.sqrt(1-offset*offset);
    for(let i=0;i<points.length;i++){
      close(norm(points[i]),1);
      close(points[i].reduce((sum,v,j)=>sum+v*n[j],0),offset);
      close(distance(points[i],n.map(v=>offset*v)),radius);
      close(distance(points[i],points[(i+1)%points.length]),2*radius*Math.sin(Math.PI/s.count));
    }
  }
});

test('circle conventions reproduce existing latitudes and meridians',()=>{
  for(const latitude of [-90,-30,0,63,90])for(const start of [0,30,180,295]){
    const circle=makeSelection('a',{elevation:90,azimuth:128,offset:Math.sin(latitude*Math.PI/180)});
    pointClose(pointOnBase(circle,start),latitudePoint(latitude,start));
  }
  for(const longitude of [0,25,190,359])for(const start of [0,41,90,180,270]){
    const circle=makeSelection('a',{elevation:0,azimuth:(longitude+90)%360});
    pointClose(pointOnBase(circle,start),meridianPoint(longitude,start));
  }
});

test('arc zero is nearest north, positive traversal is right-handed, and vertical axes ignore azimuth',()=>{
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  for(const elevation of [-90,-45,0,45,90])for(const azimuth of [0,73,241,360]){
    const {n,u,v}=circleFrame(azimuth,elevation);
    for(const p of [n,u,v])close(norm(p),1);
    close(dot(n,u),0);close(dot(n,v),0);close(dot(u,v),0);pointClose(cross(u,v),n);
    const s=makeSelection('a',{azimuth,elevation,offset:.3});
    if(Math.abs(elevation)===90){
      pointClose(u,[1,0,0]);
      pointClose(pointOnBase(s,42),pointOnBase({...s,azimuth:137},42));
    }else{
      for(let t=1;t<360;t+=13)assert.ok(pointOnBase(s,0)[2]>pointOnBase(s,t)[2]);
    }
  }
});

test('circle arcs retain angular sweep and endpoint/midpoint sampling at different offsets',()=>{
  for(const offset of [-.8,0,.8])for(const endpoints of [true,false]){
    const s=makeSelection('a',{azimuth:52,elevation:-30,offset,start:317,span:180,count:5,endpoints});
    const points=sampleSelection(s),first=endpoints?317:335,last=endpoints?497:479;
    pointClose(points[0],pointOnBase(s,first));pointClose(points[4],pointOnBase(s,last));
    const step=distance(points[0],points[1]);
    for(let i=1;i<4;i++)close(distance(points[i],points[i+1]),step);
  }
});

test('offset endpoints collapse to the signed axis and merge with coincident samples',()=>{
  for(const elevation of [-90,34,90])for(const offset of [-1,1]){
    const s=makeSelection('a',{azimuth:57,elevation,offset,count:64,start:23,span:143,endpoints:false});
    assert.equal(isCollapsedSelection(s),true);
    const expected=circleFrame(s.azimuth,elevation).n.map(v=>v*offset);
    for(const p of sampleSelection(s))pointClose(p,expected);
    const fibres=collectFibres([s]);assert.equal(fibres.length,1);assert.equal(fibres[0].owners.length,64);
    assert.equal(fibreForPoint(fibres[0].point).kind,expected[2]===1?'line':'circle');
    assert.equal(isCollapsedSelection({...s,offset:offset*.999999}),false);
  }
  assert.equal(collectFibres([makeSelection('a',{elevation:90,offset:1}),makeSelection('b',{elevation:90,offset:1})]).length,1);
});

test('fibres over circles obey the Hopf map after global base rotations',()=>{
  const selections=[makeSelection('a',{azimuth:29,elevation:-37,offset:-.42,start:13,span:217}),makeSelection('b',{azimuth:90,elevation:0,count:12})];
  assert.equal(collectFibres([selections[1]]).filter(f=>fibreForPoint(f.point).kind==='line').length,1);
  for(const axis of ['x','y','z'])for(const {point} of collectFibres(selections)){
    const moved=rotateBasePoint(point,axisRotation(axis,53)),fibre=fibreForPoint(moved),path=clippedFibre(fibre,4);
    for(const t of [0,.25,.5,.75,1])pointClose(hopf(inverseProjection(path.at(t))),moved);
  }
});
