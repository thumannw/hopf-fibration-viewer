// Optional offline browser checks; setup is documented in README.md.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectFibres } from '../src/geometry.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const results=resolve(root,'test-results');await mkdir(results,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000},offline:true,acceptDownloads:true});
const page=await context.newPage();
const errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
const summary=()=>page.evaluate(()=>window.hopfExplorer.getSummary());
const state=()=>page.evaluate(()=>window.hopfExplorer.getState());
const ready=()=>page.waitForFunction(()=>window.hopfExplorer?.ready);
const screenshot=name=>page.screenshot({path:resolve(results,name+'.png'),fullPage:true});
try {
  await page.goto(pathToFileURL(resolve(root,'index.html')).href);await ready();
  assert.equal((await summary()).fibres,16);await screenshot('latitude-desktop');
  console.log('PASS: standalone file loads with network disabled.');

  // Pick an actually visible point on the base using the documented camera and geometry.
  const initial=await state(),points=collectFibres(initial.selections);
  const box=await page.locator('#base-viewport canvas').boundingBox();
  const camera=new THREE.PerspectiveCamera(40,box.width/box.height,.01,2000);
  camera.up.set(0,0,1);camera.position.fromArray(initial.cameras.base.position);camera.lookAt(...initial.cameras.base.target);camera.updateMatrixWorld();
  const candidate=points.map((p,index)=>({p,index,score:new THREE.Vector3(...p.point).dot(camera.position)})).sort((a,b)=>b.score-a.score)[0];
  const projected=new THREE.Vector3(...candidate.p.point).multiplyScalar(1.014).project(camera);
  await page.mouse.click(box.x+(projected.x+1)*box.width/2,box.y+(1-projected.y)*box.height/2);
  assert.equal((await summary()).selected,candidate.index);
  await page.locator('#isolated').check();assert.equal((await state()).isolated,true);
  await page.locator('#clear-selection').click();assert.equal((await summary()).selected,null);
  console.log('PASS: point picking, linked selection and isolation.');

  for(const [name,count,lines]of [['south',17,0],['poles',17,1],['crossing',46,1]]){
    await page.locator(`[data-preset="${name}"]`).click();
    const result=await summary();assert.equal(result.fibres,count);assert.equal(result.lines,lines);
    if(name==='poles'){
      assert.ok(result.clipped>0);await page.locator('#fibre-select').selectOption('0');
      assert.match(await page.locator('#fibre-details').textContent(),/Infinite z-axis/);await screenshot('pole-to-pole');
    }
  }
  console.log('PASS: arc presets, poles, shared-point deduplication and clipping.');

  await page.locator('[data-preset="torus"]').click();
  const cameraBefore=(await state()).cameras.fibres;
  await page.locator('#offset-number').fill('1');await page.locator('#offset-number').press('Tab');
  assert.equal((await summary()).fibres,1);assert.equal((await summary()).lines,1);
  assert.deepEqual((await state()).cameras.fibres,cameraBefore);
  await page.locator('#offset-number').fill('-1');await page.locator('#offset-number').press('Tab');
  assert.equal((await summary()).fibres,1);assert.equal((await summary()).lines,0);
  await page.locator('#offset-number').fill('-0.34');await page.locator('#offset-number').press('Tab');
  await page.locator('#add-selection').click();assert.equal((await state()).selections.length,2);
  await page.locator('#span-number').fill('180');await page.locator('#span-number').press('Tab');
  await page.locator('#endpoints').uncheck();
  assert.equal((await state()).selections[1].endpoints,false);
  await page.locator('#fibre-select').selectOption('4');
  await page.locator('#fibre-viewport canvas').focus();await page.keyboard.press('ArrowLeft');
  const saved=await state();
  const downloadPromise=page.waitForEvent('download');await page.locator('#save').click();
  const download=await downloadPromise,configPath=resolve(results,'saved-config.json');await download.saveAs(configPath);
  const stored=JSON.parse(await readFile(configPath,'utf8'));assert.deepEqual(stored,saved);
  await page.locator('[data-preset="south"]').click();await page.locator('#load-file').setInputFiles(configPath);
  await page.waitForFunction(()=>document.getElementById('message').textContent.startsWith('Loaded'));
  const restored=await state();assert.deepEqual(restored.selections,saved.selections);assert.equal(restored.selectedIndex,saved.selectedIndex);
  for(const view of ['base','fibres'])for(let i=0;i<3;i++)assert.ok(Math.abs(restored.cameras[view].position[i]-saved.cameras[view].position[i])<1e-9);
  console.log('PASS: editing, pole latitudes, stable camera, and saved configuration round-trip.');

  const prior=await state();
  await page.locator('#load-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"format":"bad"}')});
  await page.waitForFunction(()=>document.getElementById('message').classList.contains('error'));
  assert.deepEqual((await state()).selections,prior.selections);
  const pngPromise=page.waitForEvent('download');await page.locator('#image-save').click();
  const png=await pngPromise;await png.saveAs(resolve(results,'export.png'));assert.equal(png.suggestedFilename(),'hopf-fibres.png');
  await page.locator('#about-open').click();assert.equal(await page.locator('#about').isVisible(),true);await page.keyboard.press('Escape');
  console.log('PASS: invalid-file rejection, image export and help dialog.');

  // Exercise the new controls through the UI, including the singular cases.
  await page.locator('[data-preset="torus"]').click();
  await page.locator('#add-selection').click();
  assert.equal((await state()).selections[1].azimuth,0);
  assert.equal((await state()).selections[1].elevation,0);
  assert.equal(await page.locator('#type, #latitude-field, #longitude-field').count(),0);
  assert.deepEqual(await page.locator('.select-path').allTextContents(),['1','2']);
  await page.locator('[aria-label="Remove selection 1"]').click();
  const circleCameras=(await state()).cameras;
  const edit=async(key,value)=>{
    await page.locator(`#${key}-number`).fill(String(value));
    await page.locator(`#${key}-number`).press('Tab');
  };
  // Range keyboard input exercises the live input path as well as numeric edits.
  await page.locator('#azimuth').press('ArrowRight');
  assert.equal((await state()).selections[0].azimuth,1);
  await page.locator('#elevation').press('ArrowLeft');
  assert.equal((await state()).selections[0].elevation,-.5);
  await page.locator('#offset').press('ArrowRight');
  assert.equal((await state()).selections[0].offset,.01);
  await edit('azimuth',53);await edit('elevation',32);await edit('offset',-.4);
  await edit('start',307);await edit('span',150);await edit('count',11);
  await page.locator('#endpoints').uncheck();
  assert.equal((await summary()).fibres,11);
  assert.deepEqual((await state()).cameras,circleCameras);
  await page.locator('#fibre-select').selectOption('0');
  await page.locator('#rotation-axis').selectOption('y');
  const detailsBefore=await page.locator('#fibre-details').textContent();
  await page.locator('#rotation-angle-number').fill('57');
  await page.locator('#rotation-angle-number').press('Tab');
  assert.notEqual(await page.locator('#fibre-details').textContent(),detailsBefore);
  // Renaming must preserve geometry, selection, isolation and both cameras.
  await page.locator('#isolated').check();
  const beforeRename=await state(),beforeRenameSummary=await summary();
  const beforeRenameImage=await page.locator('#fibre-viewport canvas').screenshot();
  const rename=async name=>{await page.locator('#selection-name').fill(name);await page.locator('#selection-name').press('Enter');};
  await rename('  My circle α  ');
  assert.equal(await page.locator('.select-path').textContent(),'1. My circle α');
  assert.equal(await page.locator('#selection-name').inputValue(),'My circle α');
  assert.match(await page.locator('#fibre-select option:checked').textContent(),/My circle α/);
  const renamed=await state();
  assert.deepEqual({...renamed,selections:beforeRename.selections},beforeRename);
  assert.deepEqual({...renamed.selections[0],name:beforeRename.selections[0].name},beforeRename.selections[0]);
  assert.deepEqual(await summary(),beforeRenameSummary);
  assert.ok(beforeRenameImage.equals(await page.locator('#fibre-viewport canvas').screenshot()));
  await rename('');assert.equal(await page.locator('.select-path').textContent(),'1');
  await rename('<b>literal</b>');assert.equal(await page.locator('.select-path b').count(),0);
  await rename('My circle α');
  const circleSaved=await state();
  const circleDownloadPromise=page.waitForEvent('download');await page.locator('#save').click();
  const circleDownload=await circleDownloadPromise,circlePath=resolve(results,'circle-config.json');
  await circleDownload.saveAs(circlePath);
  assert.deepEqual(JSON.parse(await readFile(circlePath,'utf8')),circleSaved);
  assert.equal(circleSaved.version,4);
  await page.locator('[data-preset="poles"]').click();
  await page.locator('#load-file').setInputFiles(circlePath);
  await page.waitForFunction(()=>document.getElementById('message').textContent==='Loaded circle-config.json.');
  assert.deepEqual((await state()).selections,circleSaved.selections);
  assert.deepEqual((await state()).rotation,circleSaved.rotation);
  await screenshot('circle-desktop');
  console.log('PASS: circle sliders and numeric input, camera preservation, global rotation and named save/load.');

  await page.locator('#rotation-reset').click();
  for(const offset of [-1,1]){
    await edit('offset',offset);
    assert.equal((await summary()).fibres,1);
    assert.match(await page.locator('#sampling-hint').textContent(),/collapsed to a point/);
    for(const key of ['start','span','count'])for(const suffix of ['','-number'])assert.equal(await page.locator('#'+key+suffix).isDisabled(),true);
    assert.equal(await page.locator('#endpoints').isDisabled(),true);
  }
  await edit('elevation',90);
  assert.equal((await summary()).lines,1);
  assert.equal(await page.locator('#azimuth').isDisabled(),true);
  assert.equal(await page.locator('#azimuth-number').isDisabled(),true);
  await edit('offset',-1);assert.equal((await summary()).lines,0);
  await edit('elevation',-90);assert.equal((await summary()).lines,1);
  await edit('offset',-.4);await edit('elevation',32);
  for(const key of ['azimuth','start','span','count','endpoints'])assert.equal(await page.locator('#'+key).isDisabled(),false);
  const restoredArc=(await state()).selections[0];
  for(const key of ['azimuth','start','span','count','endpoints'])assert.equal(restoredArc[key],circleSaved.selections[0][key]);
  assert.equal((await summary()).fibres,11);
  await edit('offset',1.01);assert.equal((await state()).selections[0].offset,-.4);
  assert.match(await page.locator('#message').textContent(),/Enter offset/);
  await edit('offset',.999999);assert.equal((await summary()).fibres,11);
  await edit('offset',-.4);
  await edit('span',360);assert.equal(await page.locator('#endpoints').isDisabled(),true);
  await edit('span',150);assert.equal(await page.locator('#endpoints').isDisabled(),false);
  console.log('PASS: collapsed offsets, vertical axes, setting restoration, input bounds and renaming.');

  // Hide selections while exercising the list limit to keep software rendering light.
  await page.locator('[aria-label="Show selection 1"]').uncheck();
  for(let i=1;i<8;i++){
    await page.locator('#add-selection').click();
    await page.locator(`[aria-label="Show selection ${i+1}"]`).uncheck();
    assert.equal((await state()).selections[i].azimuth,0);
    assert.equal((await state()).selections[i].elevation,0);
  }
  assert.equal(await page.locator('#add-selection').isDisabled(),true);
  assert.deepEqual(await page.locator('.select-path').allTextContents(),['1. My circle α','2','3','4','5','6','7','8']);
  await page.locator('[aria-label="Remove selection 8"]').click();
  assert.equal(await page.locator('#add-selection').isDisabled(),false);
  await page.locator('#load-file').setInputFiles(circlePath);
  await page.waitForFunction(()=>window.hopfExplorer.getState().selections.length===1);
  assert.equal(await page.locator('#selection-name').inputValue(),'My circle α');
  await page.locator('#add-selection').click();
  await page.locator('#selection-name').fill('Second circle');
  await page.locator('.select-path').nth(0).click();
  assert.equal((await state()).activeId,(await state()).selections[0].id);
  await page.locator('.select-path').nth(1).click();
  assert.equal(await page.locator('#selection-name').inputValue(),'Second circle');
  await page.locator('[aria-label="Remove selection 1"]').click();
  assert.equal(await page.locator('.select-path').textContent(),'1. Second circle');
  await page.locator('#load-file').setInputFiles(circlePath);
  await page.waitForFunction(()=>window.hopfExplorer.getState().selections[0].name==='My circle α');
  await page.setViewportSize({width:390,height:844});
  await rename('A long name '.repeat(5).trim());await screenshot('mobile');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.setViewportSize({width:1024,height:800});await screenshot('tablet');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.setViewportSize({width:1440,height:1000});await page.locator('[data-preset="south"]').click();await screenshot('southern-arc');
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log('PASS: responsive layout; no browser errors or network requests.');
} finally {await browser.close();}
