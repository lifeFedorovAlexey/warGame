import assert from 'node:assert/strict';
import {TerrainNavigator} from '../campaign/navigation.js';

const field={extent:4096,half:2048,cellMetres:32,heightAt:()=>0,gradientAt:()=>({x:0,y:0})};
const nav=new TerrainNavigator(field),from={x:-800,y:0,kind:'bukhanka',heading:0},to={x:-400,y:0};
let computes=0;const compute=nav.computePathSteps;
nav.computePathSteps=function*(...args){computes++;return yield* compute.apply(this,args);};
nav.rebuild([]);const original=nav.findPath(from,to),revision=nav.topologyRevision;
nav.rebuild([]);assert.equal(nav.topologyRevision,revision,'An identical static scene is not a topology change');
assert.deepEqual(nav.findPath(from,to),original);assert.equal(computes,1);
const far={id:'far',x:800,y:800,halfWidth:30,halfDepth:30,hp:1};
nav.rebuild([far]);assert.deepEqual(nav.findPath(from,to),original);assert.equal(computes,1,'A distant footprint preserves unrelated exact routes');
const near={id:'near',x:-600,y:0,halfWidth:30,halfDepth:30,hp:1};
nav.rebuild([far,near]);const detour=nav.findPath(from,to);
assert.notDeepEqual(detour,original);assert.equal(computes,2,'A changed dependency invalidates the affected route');
let previous=from;for(const point of detour){assert(nav.lineClear(previous,point,false,true));previous=point;}
const overlap={id:'overlap',x:-580,y:0,halfWidth:30,halfDepth:30,hp:1};
nav.rebuild([far,near,overlap]);const [col,row]=nav.grid(-590,0),id=row*nav.size+col;
assert.equal(nav.footprintCounts[id],2);
nav.rebuild([far,overlap]);assert.equal(nav.footprintCounts[id],1);assert.equal(nav.occupied[id],1,'Removing one footprint cannot erase its neighbour');
const counts=nav.footprintCounts.slice();nav.rebuild([far,overlap]);assert.deepEqual(nav.footprintCounts,counts,'Repeated updates cannot accumulate counts');
nav.rebuild([far]);assert.equal(nav.occupied[id],0);
const context=nav.createSearchContext();const cached=context.findPath(from,to),before=context.searchId;
far.y+=200;nav.rebuild([far]);context.refreshContext();
assert.deepEqual(context.findPath(from,to),cached);assert.equal(context.searchId,before);
assert.equal(context.edgeCache,nav.edgeCache,'Terrain edges remain shared across footprint changes');
assert.notEqual(context.occupied,nav.occupied,'Temporary command occupancy cannot alter movement occupancy');
console.log(JSON.stringify({passed:true,unrelatedCacheRetained:true,affectedCacheRejected:true,overlappingFootprints:true,privateContext:true,changedRegions:nav.lastChangedRegions.length}));
