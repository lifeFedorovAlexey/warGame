import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkBuildingPlacement,buildingHalfSize,buildingExit,buildingRotation} from '../campaign/building-placement.js';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const close=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(){
 const m={config:{...config,oilFields:[]},state:{buildings:[],research:{}},field:{heightAt:()=>0,gradientAt:()=>({x:0,y:0}),gridToWorld:([x,y])=>({x,y})},
  constructionUnlocked:()=>true,canSpend:()=>true,inBounds:(x,y)=>Math.abs(x)<1000&&Math.abs(y)<1000,exploredAt:()=>true,siteUnits:()=>[],buildingSpec:b=>config.buildings[b.kind]};
 m.field.localRoads=[-200,200].map(y=>({kind:'street',width:30,points:[{x:-500,y},{x:500,y}]}));
 m.nav={clearance:15,solids:[],terrainAllowed:()=>true,grid:(x,y)=>[Math.round(x/8),Math.round(y/8)],position:(x,y)=>({x:x*8,y:y*8}),
  allowed:(x,y)=>!m.state.buildings.some(b=>Math.abs(x*8-b.x)<b.halfWidth+15&&Math.abs(y*8-b.y)<b.halfDepth+15)};
 const add=(kind,x,y,rotation=0)=>{const [halfWidth,halfDepth]=buildingHalfSize(config.buildings[kind],config.worldScale,rotation),b={id:'b'+m.state.buildings.length,kind,x,y,rotation,hp:100,halfWidth,halfDepth};m.state.buildings.push(b);return b;};
 const place=(kind,x,y,angle=0,options)=>checkBuildingPlacement(m,kind,x,y,angle,options);
 return {m,add,place};
}
{
 const {place}=fixture(),grid=place('lab',13.1,22.6),free=place('lab',13.1,22.6,0,{snap:false});
 assert(grid.ok,grid.reason);assert.equal(grid.x,16);assert.equal(grid.y,24);
 assert(free.ok,free.reason);assert.equal(free.x,13.1);assert.equal(free.y,22.6);
 const turn=place('lab',13.1,22.6,1.1);assert(turn.ok,turn.reason);assert.equal(turn.rotation,Math.PI/2);
 assert.deepEqual([turn.halfWidth,turn.halfDepth],[36,40.5]);
 assert.equal(buildingRotation(-Math.PI/2),Math.PI*1.5);
}
{
 const {m,add,place}=fixture(),first=add('lab',-100,-100);
 const beside=place('lab',first.x+first.halfWidth*2+.8,first.y+1);
 assert(beside.ok,beside.reason);assert(beside.edgeSnapped);close(beside.x-first.x,first.halfWidth+beside.halfWidth);close(beside.y,first.y);
 const confirmed=place('lab',beside.x,beside.y,beside.rotation,{snap:false});assert.deepEqual({...confirmed,edgeSnapped:true},beside);
 const overlap=place('lab',beside.x-.01,beside.y,0,{snap:false});assert(!overlap.ok);assert.equal(overlap.reason,'Пересечение с постройкой');
 m.canSpend=()=>false;const unaffordable=place('lab',13.1,22.6);assert(!unaffordable.ok);assert.equal(unaffordable.x,16);assert.equal(unaffordable.halfWidth,40.5);
}
for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
 const {add,place}=fixture(),factory=add('factory',0,0,rotation),exit=buildingExit(factory,config.buildings.factory,config.worldScale);
 const blocked=place('bunker',exit.x,exit.y,0,{snap:false});assert.equal(blocked.reason,'Нельзя перекрывать выезд завода');
 const rear=place('bunker',-exit.x,-exit.y,rotation+Math.PI,{snap:false});assert.equal(rear.reason,'Нельзя перекрывать въезд завода');
}
{
 const {add,place}=fixture();add('bunker',0,-81);
 assert.equal(place('factory',0,0).reason,'Для въезда завода нет места');
}
{
 const {m,place}=fixture();m.config.oilFields=[[103,137]];
 const oil=place('derrick',100,140);assert(oil.ok,oil.reason);assert.equal(oil.x,103);assert.equal(oil.y,137);
 assert.equal(place('lab',103,137).reason,'Нефтяной участок зарезервирован для вышки');
 m.config.oilFields=[];m.nav.allowed=()=>false;
 assert.equal(place('lab',0,0).reason,'Нет площадки для подъезда строителя');
 m.field.gradientAt=()=>({x:1,y:0});assert.equal(place('lab',13,23).reason,'Слишком крутой склон');
 const bad=place('lab',13,23);assert.equal(bad.x,16);assert.equal(bad.y,24);
}
// Verify flush placement against the real terrain and navigation clearance.
{
 const {m,place}=fixture();
 m.field.heightAt=(x,y)=>x*.07+Math.sin(y/8)*.15;m.field.gradientAt=(x,y)=>({x:.07,y:Math.cos(y/8)*.15/8});
 const gentle=place('generator',0,0);assert(gentle.ok,gentle.reason);assert(gentle.height>2.5/2,'The old unscaled relief limit would reject this site');
 m.field.heightAt=x=>x*.108+Math.sin(x/8)*.16;m.field.gradientAt=x=>({x:.108+Math.cos(x/8)*.02,y:0});
 const factory=place('factory',0,0);
 assert(factory.ok,factory.reason);close(factory.height,m.field.heightAt(63));
 assert.equal(factory.accessRoads.length,2,'A cross slope still leaves two usable driveways');
 assert.deepEqual(place('factory',factory.x,factory.y,factory.rotation,{snap:false}),factory);
 assert.equal(place('generator',0,0).reason,'Слишком крутой склон','Small buildings keep their own grade limit');
 assert.equal(place('factory',0,0,Math.PI/2).reason,'Слишком большой перепад высоты у ворот завода','Rotating the gates downhill is unsafe here');
 m.field.heightAt=x=>x*.16;m.field.gradientAt=()=>({x:.16,y:0});
 assert.equal(place('factory',0,0).reason,'Слишком большой перепад высоты','Footing depth is limited');
 m.field.heightAt=x=>x*.3;m.field.gradientAt=()=>({x:.3,y:0});
 assert.equal(place('generator',0,0).reason,'Слишком крутой склон');
 assert.equal(place('factory',0,0).reason,'Слишком крутой склон');
 m.field.heightAt=()=>0;m.field.gradientAt=(x,y)=>({x:x===31.5&&y===27?.5:0,y:0});
 assert.equal(place('factory',0,0).reason,'Слишком крутой склон','A steep section inside the footprint also blocks placement');
}
{
 const source=createHeightfield(JSON.parse(fs.readFileSync('assets/maps/alpha/heightfield.json','utf8')));
 shapeMesaRims(source);
 const field=refineRoadHeightfield(source);
 applyRoadGrades(field,JSON.parse(fs.readFileSync('assets/maps/alpha/roads.json','utf8')));
 const m=new Mission(config,field),p=field.gridToWorld(config.startGrid);
 m.explored.fill(255);m.state.energy=2400;let verified=false;
 search:for(let x=p.x-200;x<=p.x+200;x+=24)for(let y=p.y-200;y<=p.y+200;y+=24){
  const a=m.placement('bunker',x,y);if(!a.ok)continue;
  const b=m.addStructure('bunker','rai',a,{...a,completed:true});m.rebuildNavigation();
  for(const direction of [-1,1]){
   const next=m.placement('bunker',b.x+direction*(b.halfWidth*2+.5),b.y);
   if(next.ok){close(Math.abs(next.x-b.x),next.halfWidth+b.halfWidth);verified=true;break search;}
  }
  m.state.buildings=m.state.buildings.filter(item=>item!==b);m.rebuildNavigation();
 }
 assert(verified,'Adjacent structures remain buildable on the real map with builder access');
}
console.log('PASS: grid/free placement, edge alignment, zero gap without overlap, normalized rotation, factory gates and slope limits, oil reservations, builder access, consistent invalid previews, real terrain');
