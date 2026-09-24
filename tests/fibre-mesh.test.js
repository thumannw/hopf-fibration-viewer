import test from 'node:test';
import assert from 'node:assert/strict';
import { createFibreGeometry, updateFibreGeometry } from '../src/fibre-mesh.js';
import { fibreForPoint, clippedFibre, distance, norm } from '../src/geometry.js';
import { rotateBasePoint, axisRotation } from '../src/rotation.js';

test('tube buffers are reused across closed circles, clipping and both poles',()=>{
  const g=createFibreGeometry(32,12),positions=g.attributes.position.array,normals=g.attributes.normal.array,indices=g.index.array;
  for(const angle of [0,20,90,179.999999,180,180.000001,250,360]){
    const fibre=fibreForPoint(rotateBasePoint([0,0,-1],axisRotation('y',angle))),path=clippedFibre(fibre,4);
    updateFibreGeometry(g,fibre,path,.02,4);
    assert.equal(g.attributes.position.array,positions);assert.equal(g.attributes.normal.array,normals);assert.equal(g.index.array,indices);
    for(let row=0;row<=32;row++)for(let side=0;side<=12;side++){
      const index=(row*13+side)*3;
      const p=positions.slice(index,index+3),n=normals.slice(index,index+3);
      assert.ok(p.every(Number.isFinite));assert.ok(Math.abs(norm(n)-1)<1e-6);
      assert.ok(Math.abs(distance(p,path.at(row/32))-.02)<1e-6);
      assert.ok(norm(p)<=g.boundingSphere.radius+1e-6);
    }
    if(path.closed)assert.deepEqual(positions.slice(0,39),positions.slice(-39));
  }
  g.dispose();
});

test('tube normals and triangle winding face outward for circles and the line',()=>{
  const g=createFibreGeometry(32,12);
  for(const point of [[0,0,-1],[1,0,0],[0,0,1]]){
    const f=fibreForPoint(point),path=clippedFibre(f,4);updateFibreGeometry(g,f,path,.02,4);
    const p=g.attributes.position.array,n=g.attributes.normal.array,indices=g.index.array;
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
      const u=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],v=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]];
      const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      assert.ok(cross[0]*n[a]+cross[1]*n[a+1]+cross[2]*n[a+2]>0);
    }
  }
  g.dispose();
});
