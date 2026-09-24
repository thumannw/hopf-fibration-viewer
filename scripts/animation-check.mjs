// Deterministic offline browser checks; see browser-check.mjs for Playwright setup.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rotateBasePoint, axisRotation } from '../src/rotation.js';
import { collectFibres, distance, multiply } from '../src/geometry.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'test-results');await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1100,height:800},offline:true,acceptDownloads:true,hasTouch:true});
const page=await context.newPage();
const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
const readState=()=>page.evaluate(()=>window.hopfExplorer.getState());
const summary=()=>page.evaluate(()=>window.hopfExplorer.getSummary());
// Exercise elapsed-time motion with skipped frames, and keep software WebGL runs manageable.
const tick=async ms=>{while(ms>0){const step=Math.min(ms,64);await page.clock.fastForward(step);ms-=step;}};
// Skip animation-stability waits while the page's RAF clock is deliberately paused.
const click=selector=>page.locator(selector).click({force:true});
const near=(a,b,epsilon=1e-10)=>assert.ok(distance(a,b)<epsilon,`${a} differs from ${b}`);
const samePose=(a,b)=>assert.ok(Math.min(distance(a,b),distance(a,b.map(v=>-v)))<1e-8,`${a} differs from pose ${b}`);
const dial=page.locator('#rotation-angle'),angleInput=page.locator('#rotation-angle-number');
const dialValue=async()=>Number(await dial.getAttribute('aria-valuenow'));
const checkDial=async()=>{
  const angle=(await readState()).rotation.angle,value=await dialValue();
  assert.ok(Math.min(Math.abs(angle-value),360-Math.abs(angle-value))<=.051);
};
const upload=async(config,name='rotation.json')=>{
  await page.locator('#load-file').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});
  await page.waitForFunction(name=>document.getElementById('message').textContent===`Loaded ${name}.`,name);
  await tick(32);
};

try {
  await page.clock.install({time:new Date('2026-01-01T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-01-01T00:00:00Z'));
  await page.goto(pathToFileURL(resolve(root,'hopf-explorer.html')).href);
  await page.waitForFunction(()=>window.hopfExplorer?.ready);await tick(32);
  const initial=await readState();
  assert.equal((await summary()).playing,false);
  assert.equal(await dialValue(),0);
  await page.locator('#fibre-select').selectOption('0');await tick(32);
  const beforeImage=await page.locator('#fibre-viewport canvas').screenshot();
  await click('#rotation-play');await tick(1000);
  const moving=await readState(),movingSummary=await summary();
  assert.equal(movingSummary.playing,true);assert.equal(movingSummary.selected,0);assert.equal(movingSummary.fibres,16);
  assert.ok(movingSummary.animationFrames>=12);
  assert.ok(distance(initial.rotation.orientation,moving.rotation.orientation)>.1);
  assert.deepEqual(moving.cameras,initial.cameras);
  assert.deepEqual(moving.selections,initial.selections);
  await checkDial();assert.ok(moving.rotation.angle>19 && moving.rotation.angle<=20);
  const afterImage=await page.locator('#fibre-viewport canvas').screenshot();assert.ok(!beforeImage.equals(afterImage));
  await click('#rotation-play');
  const paused=await readState();await tick(2000);assert.deepEqual((await readState()).rotation,paused.rotation);
  await page.screenshot({path:resolve(output,'rotation-paused.png'),fullPage:true});
  console.log('PASS: playback deforms the fibres, preserves selection/cameras and pauses exactly.');

  // The UI changes speed in base-sphere degrees, not quaternion half-angles.
  const angle=2*Math.atan2(Math.hypot(...moving.rotation.orientation.slice(1)),moving.rotation.orientation[0])*180/Math.PI;
  assert.ok(Math.abs(angle-20)<.5,`Expected about 20 base degrees, got ${angle}`);
  await page.locator('#rotation-axis').selectOption('y');
  near((await readState()).rotation.orientation,paused.rotation.orientation);
  assert.equal(await dialValue(),0);assert.equal((await readState()).rotation.angle,0);
  assert.equal(await page.locator('#rotation-angle-label').textContent(),'Y rotation');
  await click('#rotation-play');await tick(500);await click('#rotation-play');
  const composed=await readState();assert.ok(distance(composed.rotation.orientation,paused.rotation.orientation)>.05);
  await click('#rotation-reverse');await click('#rotation-play');await tick(500);await click('#rotation-play');
  near((await readState()).rotation.orientation,paused.rotation.orientation,1e-8);
  console.log('PASS: base angle, axis switching without a jump, and reversal of the last rotation.');

  // Manual input pauses at the input time; angle zero belongs to the latest axis step.
  await click('#rotation-reverse');await click('#rotation-play');await tick(400);
  await angleInput.fill('90');await tick(32);
  assert.equal((await summary()).playing,false);assert.equal((await readState()).rotation.angle,90);
  samePose((await readState()).rotation.orientation,multiply(axisRotation('y',90),paused.rotation.orientation));
  const yPose=(await readState()).rotation.orientation;
  await page.locator('#rotation-axis').selectOption('x');
  assert.equal(await dialValue(),0);samePose((await readState()).rotation.orientation,yPose);
  await click('#rotation-play');await tick(400);
  await page.locator('#rotation-axis').selectOption('y');
  const stepOrigin=multiply(axisRotation('x',8),yPose);
  samePose((await readState()).rotation.orientation,stepOrigin);
  assert.equal(await dialValue(),0);assert.equal((await summary()).playing,true);
  await tick(400);await dial.press('Home');await tick(32);
  assert.equal((await summary()).playing,false);samePose((await readState()).rotation.orientation,stepOrigin);
  assert.deepEqual((await readState()).cameras,initial.cameras);
  assert.deepEqual((await readState()).selections,initial.selections);
  assert.equal((await summary()).selected,0);
  console.log('PASS: live dial, input pauses playback, and axis switches start a new step without losing the pose.');

  await angleInput.fill('359');await dial.focus();
  await dial.press('ArrowRight');assert.equal(await dialValue(),0);
  samePose((await readState()).rotation.orientation,stepOrigin);
  await dial.press('Shift+ArrowRight');assert.equal(await dialValue(),10);
  await dial.press('PageDown');assert.equal(await dialValue(),355);
  await dial.press('End');assert.equal(await dialValue(),359);
  await dial.press('Home');assert.equal(await dialValue(),0);
  await click('#rotation-play');await tick(100);
  await dial.evaluate(el=>el.scrollIntoView({block:'center'}));
  const dialBox=await dial.boundingBox();
  const pointerAt=degrees=>({x:dialBox.x+dialBox.width*(.5+.4*Math.sin(degrees*Math.PI/180)),y:dialBox.y+dialBox.height*(.5-.4*Math.cos(degrees*Math.PI/180))});
  let p=pointerAt(90);await page.mouse.move(p.x,p.y);await page.mouse.down();
  assert.equal((await summary()).playing,false);
  p=pointerAt(180);await page.mouse.move(p.x,p.y);await tick(32);
  assert.equal(await dialValue(),180); // The scene updates before releasing the pointer.
  samePose((await readState()).rotation.orientation,multiply(axisRotation('y',180),stepOrigin));
  for(const a of [270,350,359,1]){p=pointerAt(a);await page.mouse.move(p.x,p.y);}
  await page.mouse.up();await tick(32);
  const dragged=(await readState()).rotation;
  assert.ok(Math.abs(dragged.angle-1)<.01); // Pointer coordinates are rounded by the browser.
  samePose(dragged.orientation,multiply(axisRotation('y',dragged.angle),stepOrigin));
  await angleInput.fill('-45');assert.equal((await readState()).rotation.angle,315);
  await dial.focus();assert.equal(await angleInput.inputValue(),'315');
  await angleInput.fill('360');assert.equal((await readState()).rotation.angle,0);
  samePose((await readState()).rotation.orientation,stepOrigin);
  await angleInput.fill('');await dial.focus();assert.equal(await angleInput.inputValue(),'0');
  await angleInput.fill('135');await dial.focus();await tick(32);await checkDial();
  await page.screenshot({path:resolve(output,'dial-desktop.png'),fullPage:true});
  console.log('PASS: cyclic keyboard input, live pointer dragging across zero, numeric wrapping and empty-input recovery.');

  const beforeZ=(await readState()).rotation.orientation;
  await page.locator('#rotation-axis').selectOption('z');
  assert.equal(await dialValue(),0);samePose((await readState()).rotation.orientation,beforeZ);
  assert.equal(await page.locator('#rotation-angle-label').textContent(),'Z rotation');
  await angleInput.fill('90');await dial.focus();await tick(32);
  samePose((await readState()).rotation.orientation,multiply(axisRotation('z',90),beforeZ));
  await click('#rotation-play');await tick(500);await click('#rotation-play');
  assert.ok(Math.abs((await readState()).rotation.angle-100)<1e-8);await checkDial();
  samePose((await readState()).rotation.orientation,multiply(axisRotation('z',100),beforeZ));
  console.log('PASS: Z axis preserves the pose on switching and supports the dial and animation.');

  // Picking remains linked after the base's selection group has rotated.
  await click('#clear-selection');
  const rotated=await readState();
  const points=collectFibres(rotated.selections).map(f=>rotateBasePoint(f.point,rotated.rotation.orientation));
  // Clearing the inspector can scroll the sphere partly above the viewport.
  // Raw mouse coordinates require the actual sample to be visible on screen.
  await page.locator('#base-viewport canvas').evaluate(el=>el.scrollIntoView({block:'center'}));
  const box=await page.locator('#base-viewport canvas').boundingBox();
  const camera=new THREE.PerspectiveCamera(40,box.width/box.height,.01,2000);camera.up.set(0,0,1);camera.position.fromArray(rotated.cameras.base.position);camera.lookAt(...rotated.cameras.base.target);camera.updateMatrixWorld();
  const candidate=points.map((point,index)=>({point,index,score:new THREE.Vector3(...point).dot(camera.position)})).sort((a,b)=>b.score-a.score)[0];
  const projected=new THREE.Vector3(...candidate.point).multiplyScalar(1.014).project(camera);
  await page.mouse.click(box.x+(projected.x+1)*box.width/2,box.y+(1-projected.y)*box.height/2);await tick(32);
  assert.equal((await summary()).selected,candidate.index);
  await page.locator('#isolated').check({force:true});await click('#rotation-play');await tick(400);await click('#rotation-play');
  assert.equal((await summary()).selected,candidate.index);assert.equal((await readState()).isolated,true);
  console.log('PASS: picking and isolation follow rotated points.');

  const savePromise=page.waitForEvent('download');await click('#save');const savedDownload=await savePromise;
  const savedPath=resolve(output,'animated-config.json');await savedDownload.saveAs(savedPath);
  const saved=JSON.parse(await readFile(savedPath,'utf8'));assert.equal(saved.version,4);
  await click('#rotation-reset');assert.deepEqual((await readState()).rotation.orientation,[1,0,0,0]);
  assert.equal(await dialValue(),0);
  assert.deepEqual((await readState()).selections,saved.selections);
  assert.deepEqual((await readState()).cameras,saved.cameras);
  await click('#rotation-play');await tick(100);assert.equal((await summary()).playing,true);
  await upload(saved);assert.equal((await summary()).playing,false);
  near((await readState()).rotation.orientation,saved.rotation.orientation);
  assert.equal((await readState()).rotation.axis,'z');
  assert.equal((await readState()).rotation.direction,saved.rotation.direction);
  assert.equal((await readState()).rotation.angle,saved.rotation.angle);await checkDial();
  assert.equal((await summary()).selected,saved.selectedIndex);assert.equal((await readState()).isolated,true);
  console.log('PASS: reset preserves geometry/cameras, and rotation settings round-trip paused.');

  // A full turn at 90 degrees/sec passes through both poles and returns to the starting family.
  await page.locator('[data-preset="poles"]').click();await tick(32);
  assert.equal(await dialValue(),0);
  await page.locator('#fibre-select').selectOption('0');
  await page.locator('#rotation-speed').press('End');assert.equal((await readState()).rotation.speed,90);
  await page.locator('#rotation-axis').selectOption('y');
  await click('#rotation-play');
  const beforeTurn=await summary();
  // Pause for exact measurements: the live inspector intentionally refreshes at 8 Hz.
  await tick(2000);await click('#rotation-play');
  assert.match(await page.locator('#fibre-details').textContent(),/Circle · radius 1\.000/);
  await click('#rotation-play');await tick(2000);await click('#rotation-play');
  near((await readState()).rotation.orientation,[-1,0,0,0],1e-8);
  assert.equal(await dialValue(),0);
  assert.equal((await summary()).lines,1);assert.equal((await summary()).selected,0);
  assert.ok((await summary()).animationFrames-beforeTurn.animationFrames>60);
  assert.match(await page.locator('#fibre-details').textContent(),/Infinite z-axis/);
  console.log('PASS: full animated revolution crosses both poles and restores the straight fibre.');

  await click('#rotation-play');await tick(32);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal((await summary()).playing,false);
  const background=await readState();await tick(5000);near((await readState()).rotation.orientation,background.rotation.orientation);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal((await summary()).playing,false);
  console.log('PASS: visibility loss pauses playback without a catch-up jump.');

  await page.setViewportSize({width:390,height:844});
  // ResizeObserver runs on the browser's layout clock; let it resize the canvases before our next RAF.
  await page.evaluate(()=>new Promise(resolve=>{
    const observer=new ResizeObserver(()=>{observer.disconnect();resolve();});
    observer.observe(document.getElementById('base-viewport'));
  }));
  await tick(32);
  await click('#rotation-play');await tick(32);
  await dial.evaluate(el=>el.scrollIntoView({block:'center'}));
  const touchBox=await dial.boundingBox();
  await page.touchscreen.tap(touchBox.x+touchBox.width*.9,touchBox.y+touchBox.height*.5);
  await tick(32);assert.ok(Math.abs(await dialValue()-90)<1);
  assert.equal((await summary()).playing,false);
  console.log('PASS: touch input on the mobile dial.');
  for(const id of ['base-viewport','fibre-viewport'])assert.ok(await page.evaluate(id=>{
    const canvas=document.querySelector(`#${id} canvas`),gl=canvas.getContext('webgl2');
    const pixels=new Uint8Array(canvas.width*canvas.height*4);
    gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const colours=new Set();
    for(let i=0;i<pixels.length;i+=4*23)colours.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return colours.size>12;
  },id),`${id} must draw the resized scene`);
  await page.screenshot({path:resolve(output,'rotation-mobile.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log('PASS: mobile layout and offline operation without browser errors.');
} finally {await browser.close();}
