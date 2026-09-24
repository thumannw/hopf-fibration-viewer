import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TAU, pointOnBase, collectFibres, fibreForPoint, clippedFibre, baseCoordinates, isCollapsedSelection, circleFrame } from './geometry.js';
import { defaultState, makeSelection, validateState, preset, MAX_SELECTIONS, MAX_NAME_LENGTH } from './state.js';
import { advanceRotation, changeRotationAxis, setRotationAngle, rotateBasePoint } from './rotation.js';
import { createFibreGeometry, updateFibreGeometry } from './fibre-mesh.js';
import { createAngleDial } from './angle-dial.js';

const $ = id => document.getElementById(id);
const selectionFields = ['azimuth','elevation','offset','start','span','count'];
let state = defaultState();
let fibres = [], baseObjects = [], fibreObjects = [], renderPending = false, geometryPending = false;
let base, space, angleDial, axisArrow;
// Playback is transient: configuration files always restore a paused scene.
let playing = false, lastFrameTime = null, lastDetailTime = 0, animationFrames = 0;
const palette = (owner) => {
  const index = state.selections.findIndex(s => s.id === owner.selectionId);
  const count = state.selections[index].count;
  return new THREE.Color().setHSL((0.49 + 0.83 * owner.sampleIndex / count + index * 0.17) % 1, 0.74, 0.63);
};

function notify(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
}
function disposeGroup(group) {
  group.traverse(object => {
    object.geometry?.dispose();
    if (object.material) for (const m of Array.isArray(object.material) ? object.material : [object.material]) { m.map?.dispose(); m.dispose(); }
  });
  group.clear();
}
function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(now => {
    renderPending = false;
    if (!base || !space) return;
    if (playing && document.hidden) setPlaying(false);
    if (playing) {
      advancePlayback(now);
      animationFrames++;
      // Keep the selected fibre's measurements current without rebuilding DOM every frame.
      if (now - lastDetailTime >= 125) { updateSummaries(); updateFibreDetails(); lastDetailTime = now; }
    }
    base.renderer.render(base.scene, base.camera);
    space.renderer.render(space.scene, space.camera);
    for (const [id,z] of [['north-label',1.22],['south-label',-1.22]]) {
      const p = new THREE.Vector3(0,0,z).project(base.camera);
      const label=$(id);
      label.style.left = `${Math.max(45,Math.min(base.width-45,(p.x+1)*base.width/2))}px`;
      label.style.top = `${Math.max(12,Math.min(base.height-12,(-p.y+1)*base.height/2))}px`;
      label.hidden = p.z > 1 || p.z < -1;
    }
    if (playing) requestRender();
  });
}

function syncPlaybackControls(resetEntry = false) {
  $('rotation-axis').value = state.rotation.axis;
  $('rotation-speed').value = state.rotation.speed;
  $('rotation-speed-value').textContent = `${state.rotation.speed}°/s`;
  $('rotation-play').textContent = playing ? 'Pause' : 'Play';
  $('rotation-play').setAttribute('aria-pressed', String(playing));
  $('rotation-reverse').setAttribute('aria-pressed', String(state.rotation.direction === -1));
  $('rotation-status').textContent = `${playing ? 'Playing' : 'Paused'} · ${state.rotation.axis.toUpperCase()} axis · ${state.rotation.direction === 1 ? 'forward' : 'reverse'}`;
  $('fibre-details').setAttribute('aria-live', playing ? 'off' : 'polite');
  $('totals').setAttribute('aria-live', playing ? 'off' : 'polite');
  angleDial.setLabel(`${state.rotation.axis.toUpperCase()} rotation`);
  angleDial.setValue(state.rotation.angle, { force: resetEntry });
}

function setPlaying(value) {
  if (playing) advancePlayback(performance.now());
  playing = value && !document.hidden;
  lastFrameTime = playing ? performance.now() : null;
  syncPlaybackControls();
  if (!playing) { updateSummaries(); updateFibreDetails(); }
  requestRender();
}

function advancePlayback(now) {
  // A queued RAF timestamp can precede an input event handled in the same frame.
  if (now <= lastFrameTime) return;
  const seconds = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (seconds > 0) {
    state.rotation = advanceRotation(state.rotation, seconds);
    angleDial.setValue(state.rotation.angle);
    updateMovingGeometry();
  }
}

function createView(id, isBase) {
  const container=$(id);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
  renderer.setClearColor(0x101e29);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('role','img');
  renderer.domElement.setAttribute('aria-label',isBase?'Interactive base sphere. Arrow keys rotate; plus and minus zoom.':'Interactive Hopf fibres. Arrow keys rotate; plus and minus zoom.');
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(isBase?40:42,1,.01,2000);
  camera.up.set(0,0,1);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=false;
  controls.enablePan=!isBase;
  controls.minDistance=isBase?2.6:.2;
  controls.maxDistance=isBase?12:150;
  const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(4,-3,7);scene.add(light);
  const fill=new THREE.DirectionalLight(0x77bbdf,1.4);fill.position.set(-5,1,-2);scene.add(fill);
  scene.add(new THREE.AmbientLight(0xffffff,1.15));
  const geometry=new THREE.Group(),guides=new THREE.Group(),highlights=new THREE.Group();scene.add(geometry,guides,highlights);
  const view={container,renderer,scene,camera,controls,geometry,guides,highlights,width:1,height:1};
  controls.addEventListener('change',requestRender);
  const resize=()=>{view.width=container.clientWidth;view.height=container.clientHeight;renderer.setSize(view.width,view.height,false);camera.aspect=view.width/view.height;camera.updateProjectionMatrix();requestRender();};
  new ResizeObserver(resize).observe(container);resize();
  renderer.domElement.addEventListener('keydown',e=>{
    const offset=camera.position.clone().sub(controls.target);
    if (['ArrowLeft','ArrowRight'].includes(e.key)) offset.applyAxisAngle(new THREE.Vector3(0,0,1),e.key==='ArrowLeft'?.12:-.12);
    else if (['ArrowUp','ArrowDown'].includes(e.key)) offset.applyAxisAngle(new THREE.Vector3().crossVectors(offset,new THREE.Vector3(0,0,1)).normalize(),e.key==='ArrowUp'?.12:-.12);
    else if (['+','=','-','_'].includes(e.key)) offset.multiplyScalar(['+','='].includes(e.key)?.9:1.1);
    else if (e.key==='Home') { e.preventDefault();isBase?resetBase():fitView();return; }
    else return;
    e.preventDefault();offset.setLength(THREE.MathUtils.clamp(offset.length(),controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();
  });
  let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)down=[e.clientX,e.clientY];});
  renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
  renderer.domElement.addEventListener('pointerup',e=>{
    if (!down || Math.hypot(e.clientX-down[0],e.clientY-down[1])>5) {down=null;return;} down=null;
    const bounds=renderer.domElement.getBoundingClientRect();
    const pointer=new THREE.Vector2(2*(e.clientX-bounds.left)/bounds.width-1,1-2*(e.clientY-bounds.top)/bounds.height);
    const ray=new THREE.Raycaster();ray.setFromCamera(pointer,camera);
    scene.updateMatrixWorld(true);
    const hit=ray.intersectObjects(isBase?baseObjects:fibreObjects,false).find(h=>h.object.visible);
    if (hit && Number.isInteger(hit.object.userData.index)) selectFibre(hit.object.userData.index);
  });
  return view;
}

class AnalyticCurve extends THREE.Curve {
  constructor(at) {super();this.at=at;}
  getPoint(t,target=new THREE.Vector3()) {return target.fromArray(this.at(t));}
  getPointAt(t,target) {return this.getPoint(t,target);}
}
function tube(at,radius,color,closed=false,segments=192) {
  return new THREE.Mesh(new THREE.TubeGeometry(new AnalyticCurve(at),segments,radius,8,closed),new THREE.MeshStandardMaterial({color,roughness:.3,metalness:.12,emissive:color,emissiveIntensity:.22}));
}
function line(points,color=0x36505e,opacity=1) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));
}
function bead(point,radius,color) {
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,12,10),new THREE.MeshBasicMaterial({color}));mesh.position.fromArray(point);return mesh;
}
function labelSprite(text,position) {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
  const context=canvas.getContext('2d');context.fillStyle='#a7c2c6';context.font='28px system-ui';context.textAlign='center';context.fillText(text,64,40);
  const texture=new THREE.CanvasTexture(canvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.position.fromArray(position);sprite.scale.set(.3,.15,1);return sprite;
}
function createAxisArrow() {
  const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(),1.32,0xdceee7,.16,.075);
  // A faint overlay keeps the direction readable through the opaque sphere.
  // Keep this helper outside rebuilt geometry and picking targets.
  for(const part of [arrow.line,arrow.cone]){
    part.material.transparent=true;part.material.opacity=.55;
    part.material.depthTest=false;part.material.depthWrite=false;part.renderOrder=2;
  }
  base.scene.add(arrow);
  return arrow;
}
function updateAxisArrow() {
  const s=current();
  const direction=circleFrame(s.azimuth,s.elevation).n;
  axisArrow.visible=s.visible;
  axisArrow.setDirection(new THREE.Vector3(...rotateBasePoint(direction,state.rotation.orientation)));
}
function resetBase() {base.controls.target.set(0,0,0);base.camera.position.set(2.7,-4.4,2.3);base.controls.update();requestRender();}
function fitView(direction) {
  const extent=Math.max(1,...fibres.map(f=>f.path.extent || 0));
  const aspect=space.width/space.height;
  const vertical=space.camera.fov*Math.PI/360;
  const limiting=Math.min(vertical,Math.atan(Math.tan(vertical)*aspect));
  const distance=extent/Math.sin(limiting)*1.1;
  let vector=direction?new THREE.Vector3(...direction):new THREE.Vector3(4,-6,3.2);
  space.controls.target.set(0,0,0);space.camera.position.copy(vector.normalize().multiplyScalar(distance));space.controls.update();requestRender();
}

function buildGuides() {
  disposeGroup(base.guides);disposeGroup(space.guides);
  // A fixed base surface occludes points on the back of the sphere.
  const globe=new THREE.Mesh(new THREE.SphereGeometry(.995,64,48),new THREE.MeshStandardMaterial({color:0x1c3442,roughness:.85,metalness:.08}));
  base.guides.add(globe);baseObjects=[globe];
  if (state.guides) {
    for (const latitude of [-60,-30,0,30,60]) base.guides.add(line(Array.from({length:129},(_,i)=>pointOnBase({azimuth:0,elevation:90,offset:Math.sin(latitude*Math.PI/180)},i*360/128).map(v=>v*1.002)),latitude===0?0x63828d:0x354f5e));
    for (let longitude=0;longitude<180;longitude+=30) base.guides.add(line(Array.from({length:129},(_,i)=>pointOnBase({azimuth:longitude+90,elevation:0,offset:0},i*360/128).map(v=>v*1.002))));
    base.guides.add(line([[0,0,-1.15],[0,0,1.15]],0x789296));
    space.guides.add(line(Array.from({length:129},(_,i)=>[Math.cos(i*TAU/128),Math.sin(i*TAU/128),0]),0x526c75));
    for (let axis=0;axis<3;axis++) {
      const a=[0,0,0],b=[0,0,0];a[axis]=-Math.min(state.clip,2);b[axis]=Math.min(state.clip,2);
      space.guides.add(line([a,b],0x304855));
      b[axis]+=.12;space.guides.add(labelSprite(['x','y','z'][axis],b));
    }
  }
  if (state.boundary) {
    for (let axis=0;axis<3;axis++) space.guides.add(line(Array.from({length:193},(_,i)=>{const p=[0,0,0];p[(axis+1)%3]=state.clip*Math.cos(i*TAU/192);p[(axis+2)%3]=state.clip*Math.sin(i*TAU/192);return p;}),0x66808b,.5));
  }
}

function rebuild() {
  geometryPending=false;
  disposeGroup(base.geometry);disposeGroup(space.geometry);disposeGroup(base.highlights);disposeGroup(space.highlights);
  buildGuides();fibreObjects=[];
  fibres=collectFibres(state.selections).map((item,index)=>{
    const color=palette(item.owners[0]);
    const dot=bead(item.point.map(v=>v*1.014),.034,color);dot.userData.index=index;base.geometry.add(dot);baseObjects.push(dot);
    const mesh=new THREE.Mesh(createFibreGeometry(),new THREE.MeshStandardMaterial({color,roughness:.3,metalness:.12,emissive:color,emissiveIntensity:.22}));
    mesh.userData.index=index;space.geometry.add(mesh);fibreObjects.push(mesh);
    // Allocate endpoint markers once, and reveal them only for clipped fibres.
    const ends=[0,1].map(()=>{const end=bead([0,0,0],Math.max(.027,state.thickness*1.4),color);end.userData.index=index;space.geometry.add(end);fibreObjects.push(end);return end;});
    return {...item,referencePoint:item.point,index,color,dot,mesh,ends};
  });
  for(const selection of state.selections.filter(s=>s.visible)) {
    if(isCollapsedSelection(selection))continue;
    const color=palette({selectionId:selection.id,sampleIndex:0});
    const arc=t=>pointOnBase(selection,selection.start+selection.span*t).map(v=>v*1.009);
    base.geometry.add(tube(arc,.005,color,selection.span===360,128));
  }
  if(state.selectedIndex!=null && !fibres[state.selectedIndex]) state.selectedIndex=null;
  syncFibreMenu();
  updateMovingGeometry();updateSummaries();
  updateHighlight();requestRender();
}

function updateMovingGeometry() {
  const [a,b,c,d]=state.rotation.orientation;
  base.geometry.quaternion.set(c,d,b,a);
  base.highlights.quaternion.copy(base.geometry.quaternion);
  updateAxisArrow();
  for(const item of fibres) {
    item.point=rotateBasePoint(item.referencePoint,state.rotation.orientation);
    item.fibre=fibreForPoint(item.point);
    item.path=clippedFibre(item.fibre,state.clip);
    const visible=!item.path.empty && (!state.isolated || item.index===state.selectedIndex);
    item.mesh.visible=visible;
    // All fibres stay current so picking and turning isolation off need no reconstruction.
    if(!item.path.empty) updateFibreGeometry(item.mesh.geometry,item.fibre,item.path,state.thickness,state.clip);
    item.ends.forEach((end,i)=>{
      end.visible=visible && item.path.clipped;
      if(!item.path.empty)end.position.fromArray(item.path.at(i));
    });
  }
}

function updateSummaries() {
  const clipped=fibres.filter(f=>f.path.clipped).length,lines=fibres.filter(f=>f.fibre.kind==='line').length;
  const outside=fibres.filter(f=>f.path.empty).length;
  const status=[];
  if(outside)status.push(`${outside} ${outside===1?'fibre':'fibres'} outside viewing sphere`);
  if(clipped)status.push(`${clipped} clipped ${clipped===1?'fibre':'fibres'} · beads mark the viewing boundary`);
  $('scene-status').textContent=status.length?status.join(' · '):'All selected fibres are complete';
  $('totals').textContent=`${fibres.length} distinct ${fibres.length===1?'fibre':'fibres'} · ${lines} ${lines===1?'line':'lines'} · ${state.selections.filter(s=>s.visible).length} visible selections`;
}
function scheduleRebuild() {
  if(geometryPending)return;
  geometryPending=true;requestAnimationFrame(rebuild);
}
function selectFibre(index) {state.selectedIndex=index;updateHighlight();}
function updateHighlight() {
  disposeGroup(base.highlights);
  const selected=fibres[state.selectedIndex];
  if(!selected && state.isolated)state.isolated=false;
  $('fibre-select').value=selected?String(selected.index):'';
  $('isolated').checked=state.isolated;$('isolated').disabled=!selected;
  for(const item of fibres) {
    const active=item===selected;
    item.dot.scale.setScalar(active?1.6:1);
    item.dot.material.color.copy(item.color).multiplyScalar(selected&&!active?.55:1);
    if(item.mesh) {
      item.mesh.visible=!item.path.empty && (!state.isolated||active);
      item.mesh.material.color.copy(item.color).multiplyScalar(selected&&!active?.32:1);
      item.mesh.material.emissive.copy(item.color);
      item.mesh.material.emissiveIntensity=active?.8:selected?.02:.22;
      item.mesh.material.roughness=active?.16:.3;
    }
    for(const end of item.ends){end.visible=!item.path.empty && item.path.clipped && (!state.isolated||active);end.material.color.copy(item.color).multiplyScalar(selected&&!active?.4:1);}
  }
  if(selected){
    const halo=new THREE.Mesh(new THREE.RingGeometry(.064,.077,40),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}));
    halo.position.fromArray(selected.referencePoint.map(v=>v*1.02));halo.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(...selected.referencePoint));base.highlights.add(halo);
  }
  updateFibreDetails();requestRender();
}

function updateFibreDetails() {
  const selected=fibres[state.selectedIndex];
  if(selected){
    const c=baseCoordinates(selected.point),f=selected.fibre;
    const details=[['Base latitude',`${c.latitude.toFixed(2)}°`],['Base longitude',Math.abs(c.latitude)>89.999999?'Pole':`${c.longitude.toFixed(2)}°`],['Fibre',f.kind==='line'?'Infinite z-axis':`Circle · radius ${f.radius.toFixed(3)}`],['Root disc',`r = ${f.rootRadius.toFixed(3)}`],['Visible portion',selected.path.empty?'Outside viewing sphere':selected.path.clipped?'Clipped at viewing sphere':'Complete circle']];
    if(selected.owners.length>1)details.push(['Shared by',`${selected.owners.length} samples`]);
    const grid=document.createElement('div');grid.className='detail-grid';
    for(const [label,value]of details){const wrap=document.createElement('div'),a=document.createElement('span'),b=document.createElement('strong');a.textContent=label;b.textContent=value;wrap.append(a,b);grid.append(wrap);}
    $('fibre-details').replaceChildren(grid);
  }else $('fibre-details').textContent='Select a point or a fibre to see the correspondence.';
}

function current() {return state.selections.find(s=>s.id===state.activeId) || state.selections[0];}
function labelFor(s,i) {return s.name?`${i+1}. ${s.name}`:String(i+1);}
function syncFibreMenu() {
  const menu=$('fibre-select');menu.replaceChildren(new Option('Choose on either view',''));
  for(const item of fibres) {
    const owner=state.selections.findIndex(s=>s.id===item.owners[0].selectionId);
    menu.add(new Option(`Fibre ${item.index+1} · selection ${labelFor(state.selections[owner],owner)}`,item.index));
  }
  menu.value=state.selectedIndex==null?'':String(state.selectedIndex);
}
function syncList() {
  const list=$('selection-list');list.replaceChildren();
  state.selections.forEach((s,i)=>{
    const row=document.createElement('div');row.className='selection-row';
    const visible=document.createElement('input');visible.type='checkbox';visible.checked=s.visible;visible.setAttribute('aria-label',`Show selection ${i+1}`);visible.addEventListener('change',()=>{s.visible=visible.checked;state.selectedIndex=null;rebuild();});
    const select=document.createElement('button');select.className='select-path';select.textContent=labelFor(s,i);select.setAttribute('aria-pressed',String(s.id===state.activeId));select.addEventListener('click',()=>{state.activeId=s.id;syncControls();});
    const remove=document.createElement('button');remove.className='remove-path';remove.textContent='×';remove.setAttribute('aria-label',`Remove selection ${i+1}`);remove.disabled=state.selections.length===1;remove.addEventListener('click',()=>{state.selections=state.selections.filter(x=>x.id!==s.id);if(state.activeId===s.id)state.activeId=state.selections[0].id;state.selectedIndex=null;syncControls();rebuild();});
    row.append(visible,select,remove);list.append(row);
  });
  $('selection-count').textContent=`${state.selections.length} / ${MAX_SELECTIONS}`;
  $('add-selection').disabled=state.selections.length>=MAX_SELECTIONS;
}
function syncEditor() {
  const s=current();$('selection-name').value=s.name;
  const collapsed=isCollapsedSelection(s),vertical=Math.abs(s.elevation)===90;
  for(const key of selectionFields){
    $(key).value=s[key];$(key+'-number').value=s[key];
    $(key).disabled=$(key+'-number').disabled=(key==='azimuth' && vertical) || (['start','span','count'].includes(key) && collapsed);
  }
  $('endpoints').checked=s.endpoints;$('endpoints').disabled=s.span===360 || collapsed;
  $('axis-hint').textContent=vertical?'Vertical axis: azimuth is unused and retained. Start 0° uses +X.':'Azimuth turns from +X toward +Y; elevation is above the XY plane. Start 0° is nearest north.';
  $('active-label').textContent=`#${state.selections.indexOf(s)+1}`;
  const sampling=s.span===360?'Full circle; endpoint is not repeated.':s.endpoints?'Both endpoints included.':'Samples at interval midpoints.';
  $('sampling-hint').textContent=collapsed?'Circle collapsed to a point: one base point and one fibre. Arc and point-count settings are retained.':sampling+' Positive angles follow the right-hand rule about the axis.';
  updateAxisArrow();requestRender();
}
function syncControls() {
  syncList();syncEditor();
  $('clip').value=state.clip;$('clip-value').textContent=state.clip.toFixed(1);
  $('thickness').value=state.thickness;$('thickness-value').textContent=state.thickness.toFixed(3);
  $('guides').checked=state.guides;$('boundary').checked=state.boundary;
  syncPlaybackControls(true);
  for(const button of document.querySelectorAll('[data-preset]'))button.removeAttribute('aria-pressed');
}
function addSelection() {
  if(state.selections.length>=MAX_SELECTIONS)return;
  let n=1;while(state.selections.some(s=>s.id===`s${n}`))n++;
  const s=makeSelection(`s${n}`);
  state.selections.push(s);state.activeId=s.id;state.selectedIndex=null;syncControls();rebuild();
}
function download(blob,name) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function configuration() {
  const cameras={};for(const [name,view]of [['base',base],['fibres',space]])cameras[name]={position:view.camera.position.toArray(),target:view.controls.target.toArray()};
  return {...state,cameras};
}
function restoreConfiguration(input) {
  const validated=validateState(input);setPlaying(false);state=validated;syncControls();rebuild();
  if(state.cameras)for(const [name,view]of [['base',base],['fibres',space]]){view.camera.position.fromArray(state.cameras[name].position);view.controls.target.fromArray(state.cameras[name].target);view.controls.update();}
  else {resetBase();fitView();}
  requestRender();
}
function bindControls() {
  angleDial = createAngleDial({
    id: 'rotation-angle', label: 'X rotation', descriptionId: 'rotation-dial-help',
    onStart: () => setPlaying(false),
    onInput: angle => {
      state.rotation = setRotationAngle(state.rotation, angle);
      updateMovingGeometry(); updateSummaries(); updateFibreDetails(); requestRender();
    },
  });
  $('rotation-dial-slot').append(angleDial.element);
  $('rotation-play').addEventListener('click',()=>setPlaying(!playing));
  $('rotation-axis').addEventListener('change',()=>{if(playing)advancePlayback(performance.now());state.rotation=changeRotationAxis(state.rotation,$('rotation-axis').value);syncPlaybackControls(true);});
  $('rotation-speed').addEventListener('input',()=>{if(playing)advancePlayback(performance.now());state.rotation.speed=Number($('rotation-speed').value);syncPlaybackControls();});
  $('rotation-reverse').addEventListener('click',()=>{if(playing)advancePlayback(performance.now());state.rotation.direction*=-1;syncPlaybackControls();});
  $('rotation-reset').addEventListener('click',()=>{setPlaying(false);state.rotation.orientation=[1,0,0,0];state.rotation.angle=0;syncPlaybackControls(true);updateMovingGeometry();updateSummaries();updateFibreDetails();requestRender();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)setPlaying(false);});
  $('selection-name').maxLength=MAX_NAME_LENGTH;
  $('selection-name').addEventListener('change',()=>{
    current().name=$('selection-name').value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,MAX_NAME_LENGTH);
    $('selection-name').value=current().name;
    // Preserve the list buttons: blur may be caused by clicking another selection.
    const index=state.selections.indexOf(current());
    $('selection-list').querySelectorAll('.select-path')[index].textContent=labelFor(current(),index);
    syncFibreMenu();
  });
  $('selection-name').addEventListener('keydown',event=>{if(event.key==='Enter')event.currentTarget.blur();});
  for(const key of selectionFields) {
    $(key).addEventListener('input',()=>{current()[key]=Number($(key).value);state.selectedIndex=null;syncEditor();syncList();scheduleRebuild();});
    $(key+'-number').addEventListener('change',()=>{
      const input=$(key+'-number'),value=Number(input.value);
      if(input.value.trim()==='' || !Number.isFinite(value) || value<Number(input.min) || value>Number(input.max) || (key==='count'&&!Number.isInteger(value))){notify(`Enter ${key} from ${input.min} to ${input.max}${key==='count'?' as a whole number':''}.`,true);syncEditor();return;}
      current()[key]=value;state.selectedIndex=null;syncEditor();syncList();rebuild();
    });
  }
  $('endpoints').addEventListener('change',()=>{current().endpoints=$('endpoints').checked;state.selectedIndex=null;syncEditor();rebuild();});
  for(const key of ['clip','thickness'])$(key).addEventListener('input',()=>{state[key]=Number($(key).value);$(key+'-value').textContent=state[key].toFixed(key==='clip'?1:3);scheduleRebuild();});
  for(const key of ['guides','boundary'])$(key).addEventListener('change',()=>{state[key]=$(key).checked;rebuild();});
  $('add-selection').addEventListener('click',addSelection);
  for(const button of document.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>{setPlaying(false);state=preset(button.dataset.preset);syncControls();rebuild();resetBase();fitView();button.setAttribute('aria-pressed','true');notify('Preset loaded. Adjust the circle or arc in the selection controls.');});
  $('fibre-select').addEventListener('change',()=>selectFibre($('fibre-select').value===''?null:Number($('fibre-select').value)));
  $('clear-selection').addEventListener('click',()=>{state.isolated=false;selectFibre(null);});
  $('isolated').addEventListener('change',()=>{state.isolated=$('isolated').checked;updateHighlight();});
  $('base-reset').addEventListener('click',resetBase);$('fit-view').addEventListener('click',()=>fitView());
  $('top-view').addEventListener('click',()=>fitView([0,-.0001,1]));$('front-view').addEventListener('click',()=>fitView([0,-1,0]));
  $('save').addEventListener('click',()=>{download(new Blob([JSON.stringify(configuration(),null,2)],{type:'application/json'}),'hopf-configuration.json');notify('Configuration saved, including both camera views.');});
  $('load').addEventListener('click',()=>$('load-file').click());
  $('load-file').addEventListener('change',async()=>{
    const file=$('load-file').files[0];if(!file)return;
    try{if(file.size>200000)throw new Error('Configuration files must be smaller than 200 KB.');restoreConfiguration(JSON.parse(await file.text()));notify(`Loaded ${file.name}.`);}
    catch(error){notify(`Could not load configuration: ${error.message}`,true);}
    finally{$('load-file').value='';}
  });
  $('image-save').addEventListener('click',()=>{space.renderer.render(space.scene,space.camera);space.renderer.domElement.toBlob(blob=>{if(blob){download(blob,'hopf-fibres.png');notify('Fibre image saved.');}else notify('The browser could not export the image.',true);},'image/png');});
  $('about-open').addEventListener('click',()=>$('about').showModal());$('about-close').addEventListener('click',()=>$('about').close());
  $('about').addEventListener('click',e=>{if(e.target===$('about')){const b=$('about').getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)$('about').close();}});
}

try {
  base=createView('base-viewport',true);space=createView('fibre-viewport',false);
  axisArrow=createAxisArrow();
  bindControls();syncControls();rebuild();resetBase();fitView();
  // Read-only status for diagnostics without coupling the app to a host service.
  window.hopfExplorer={getState:()=>structuredClone(configuration()),getSummary:()=>({fibres:fibres.length,clipped:fibres.filter(f=>f.path.clipped).length,lines:fibres.filter(f=>f.fibre.kind==='line').length,selected:state.selectedIndex,playing,animationFrames}),ready:true};
}catch(error){console.error(error);$('startup-error').hidden=false;$('startup-error').textContent=`The 3D views could not start. This explorer needs WebGL 2. Try a current browser with hardware acceleration enabled. Details: ${error.message}`;}
