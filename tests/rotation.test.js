import test from 'node:test';
import assert from 'node:assert/strict';
import { axisRotation, advanceOrientation, advanceRotation, changeRotationAxis, setRotationAngle, rotateBasePoint, defaultRotation, wrapAngle, angleDelta } from '../src/rotation.js';
import { hopf, multiply, inverseProjection, fibreForPoint, clippedFibre, distance, norm, collectFibres } from '../src/geometry.js';
import { preset } from '../src/state.js';

const near=(a,b,epsilon=1e-10)=>assert.ok(distance(a,b)<epsilon,`${a} differs from ${b}`);

test('positive quarter turns agree with fixed XYZ base axes and half-angle quaternions',()=>{
  near(rotateBasePoint([0,0,1],axisRotation('x',90)),[0,-1,0]);
  near(rotateBasePoint([0,0,1],axisRotation('y',90)),[1,0,0]);
  near(rotateBasePoint([1,0,0],axisRotation('y',90)),[0,0,-1]);
  near(rotateBasePoint([1,0,0],axisRotation('z',90)),[0,1,0]);
  near(rotateBasePoint([0,0,1],axisRotation('z',90)),[0,0,1]);
  near(axisRotation('x',180),[0,0,1,0]);near(axisRotation('y',180),[0,0,0,1]);
  near(axisRotation('z',180),[0,1,0,0]);
});

test('rotation of base points agrees with left multiplication on S3',()=>{
  for(const axis of ['x','y','z'])for(const angle of [-155,-30,0,90,275])for(const p of [[0,0,0],[1,0,0],[.7,-2,1.4]]){
    const q=inverseProjection(p),a=axisRotation(axis,angle);
    near(rotateBasePoint(hopf(q),a),hopf(multiply(a,q)));
  }
});

test('global rotations preserve angular spacing, duplicate owners and point order',()=>{
  const fibres=collectFibres(preset('crossing').selections),a=axisRotation('x',57);
  assert.equal(fibres.length,46);
  const rotated=fibres.map(f=>rotateBasePoint(f.point,a));
  for(let i=0;i<fibres.length;i++){
    assert.ok(Math.abs(norm(rotated[i])-1)<1e-12);
    assert.ok(Math.abs(distance(rotated[i],rotated[(i+1)%fibres.length])-distance(fibres[i].point,fibres[(i+1)%fibres.length].point))<1e-12);
  }
});

test('elapsed-time integration is frame-rate independent and full turns close',()=>{
  for(const axis of ['x','y','z']) {
    const initial={...defaultRotation(),axis,speed:30};
    let r={...initial};for(let i=0;i<360;i++)r.orientation=advanceOrientation(r,1/30);
    near(rotateBasePoint([.6,0,.8],r.orientation),[.6,0,.8]);
    const oneStep=advanceOrientation(initial,3.17);
    r={...initial};for(const dt of [.13,.6,.01,1.9,.53])r.orientation=advanceOrientation(r,dt);
    near(r.orientation,oneStep);
    r.direction=-1;near(advanceOrientation(r,3.17),initial.orientation);
  }
});

test('changing axes composes around fixed axes without discarding the current orientation',()=>{
  const r={...defaultRotation(),speed:90};r.orientation=advanceOrientation(r,1);
  r.axis='y';const final=advanceOrientation(r,1);
  near(rotateBasePoint([0,0,1],final),[0,-1,0]);
  near(final,multiply(axisRotation('y',90),axisRotation('x',90)));
});

test('rotating a point through north has a finite, continuous clipped line limit',()=>{
  for(const axis of ['x','y']){
    const start=rotateBasePoint([0,0,1],axisRotation(axis,-45));
    const paths=[45-1e-7,45,45+1e-7].map(angle=>{
      const point=rotateBasePoint(start,axisRotation(axis,angle));
      const fibre=fibreForPoint(point),path=clippedFibre(fibre,4);
      for(let i=0;i<=20;i++){const p=path.at(i/20);assert.ok(p.every(Number.isFinite));assert.ok(norm(p)<=4+1e-9);near(hopf(inverseProjection(p)),point,1e-9);}
      return {fibre,path};
    });
    assert.equal(paths[1].fibre.kind,'line');
    for(const t of [0,.25,.5,.75,1]){
      near(paths[0].path.at(t),paths[1].path.at(t),1e-6);
      near(paths[2].path.at(t),paths[1].path.at(t),1e-6);
    }
  }
});

test('rotations remain normalized after repeated axis changes',()=>{
  const r=defaultRotation();
  for(let i=0;i<5000;i++){r.axis=['x','y','z'][i%3];r.orientation=advanceOrientation(r,.016);}
  assert.ok(Math.abs(norm(r.orientation)-1)<1e-12);
});

test('cyclic angles wrap and take the short path across zero',()=>{
  assert.equal(wrapAngle(-725),355);assert.equal(wrapAngle(360),0);assert.equal(wrapAngle(721),1);
  assert.equal(angleDelta(359,1),2);assert.equal(angleDelta(1,359),-2);
  const r=setRotationAngle({...defaultRotation(),angle:359,orientation:axisRotation('x',359)},1);
  assert.equal(r.angle,1);near(r.orientation,axisRotation('x',361));
});

test('the dial edits only the current step and axis switches preserve the accumulated pose',()=>{
  let r=setRotationAngle(defaultRotation(),37);
  const firstPose=r.orientation;
  r=changeRotationAxis(r,'y');assert.equal(r.angle,0);near(r.orientation,firstPose);
  r=setRotationAngle(r,82);near(r.orientation,multiply(axisRotation('y',82),firstPose));
  assert.equal(changeRotationAxis(r,'y').angle,82);
  r=setRotationAngle(r,0);near(r.orientation,firstPose);
  r=setRotationAngle(r,28);
  const secondPose=r.orientation;
  r=changeRotationAxis(r,'x');assert.equal(r.angle,0);near(r.orientation,secondPose);
  r=setRotationAngle(r,61);near(r.orientation,multiply(axisRotation('x',61),secondPose));
  r=setRotationAngle(r,0);near(r.orientation,secondPose);
});

test('the dial tracks elapsed-time motion, reverse, and multiple full turns',()=>{
  const start={...defaultRotation(),speed:40};
  let r=start;for(const seconds of [.15,.03,.42,.4])r=advanceRotation(r,seconds);
  assert.ok(Math.abs(r.angle-40)<1e-10);near(r.orientation,axisRotation('x',40));
  r=advanceRotation({...r,direction:-1},1.5);
  assert.ok(Math.abs(r.angle-340)<1e-10);near(r.orientation,axisRotation('x',-20));
  r=advanceRotation(r,18);assert.ok(Math.abs(r.angle-340)<1e-10);
  near(rotateBasePoint([0,0,1],r.orientation),rotateBasePoint([0,0,1],axisRotation('x',-20)));
});

test('manual angle entry is independent of playback speed and direction',()=>{
  const r=setRotationAngle({...defaultRotation(),speed:90,direction:-1},-90);
  assert.equal(r.angle,270);near(r.orientation,axisRotation('x',-90));
  const next=advanceRotation(r,1);
  assert.equal(next.angle,180);near(next.orientation,axisRotation('x',-180));
});
