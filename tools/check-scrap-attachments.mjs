import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const T=await import('../demo/vendor/three.module.js');
const {FIELD_RECIPES,fieldEffects,fieldUnitSpec}=await import('../campaign/field-modifications.js');
const {vehicleDynamics}=await import('../campaign/vehicle-dynamics.js');
const {ensureSalvage,salvageFromImpact,salvageFromWreck,updateSalvage,armorMultiplier}=await import('../campaign/vehicle-salvage.js');
const {createDamageState,applyDamageHit,VEHICLE_PARTS}=await import('../campaign/damage-state.js');
const {prepareDamageGeometry,createDamageCollider,extractDamagePart}=await import('../campaign/damage-geometry.js');
const {createFieldModification}=await import('../campaign/field-modification-models.js');
const {createScavUnit}=await import('../campaign/scav-units.js');
const {recoveredPaint}=await import('../campaign/salvage-paint.js');
const tests=[],test=(name,fn)=>{fn();tests.push(name);};
const fixture=()=>{const m={config:{worldScale:4.5,units:{bukhanka:{components:['C01','B01','U01']}}},state:{time:0,units:[]},emit(){}};ensureSalvage(m);return m;};
const car=id=>({id,kind:'bukhanka',owner:'rai',hp:200,maxHp:320,x:0,y:0,damage:createDamageState()});
function drop(m,kind,part,id='donor'){
 const u={...car(id),kind,owner:'scavs'};u.damage.parts[part]={damage:1,detached:true};
 salvageFromImpact(m,u,{power:120},{partId:part,detached:true,secondaryFailures:[]});return m.state.salvage.items.at(-1);
}
const collect=(m,u,item)=>{u.previousX=u.x=item.x;u.previousY=u.y=item.y;m.state.time=item.readyAt+.01;updateSalvage(m);};
const bindings=root=>{root.updateMatrixWorld(true);const list=[];root.traverse(n=>{if(n.isMesh)list.push(prepareDamageGeometry(T,n,'body'));});return list;};
test('Two hoods fill separate sides; rear spare consumes one wheel; colour survives a second drop and save',()=>{
 const m=fixture(),u=car('receiver');m.state.units=[u];
 const a=drop(m,'scav-firetruck',30,'red');assert.equal(a.stock,'hood-stock');assert.equal(a.paintColor,'#914c39');collect(m,u,a);
 assert(u.damage.parts[27].installed);assert(!u.damage.parts[28]);assert.equal(recoveredPaint(u,27),'#914c39');
 collect(m,u,drop(m,'scav-zaporozhets',30,'green'));assert(u.damage.parts[28].installed);assert.equal(recoveredPaint(u,28),'#718d83');
 collect(m,u,drop(m,'raider',2));assert(u.damage.parts[29].installed);assert.equal(m.state.salvage.items.length,0);
 assert.deepEqual([u.hp,u.maxHp],[200,320]);assert.equal(fieldEffects(u).massKg,62);
 m.state=JSON.parse(JSON.stringify(m.state));const loaded=m.state.units[0];assert.equal(recoveredPaint(loaded,27),'#914c39');
 loaded.damage.parts[27].detached=true;loaded.damage.revision++;
 salvageFromImpact(m,loaded,{power:120},{partId:27,detached:true,secondaryFailures:[]});assert.equal(m.state.salvage.items[0].paintColor,'#914c39');
 assert.equal(fieldEffects(loaded).massKg,44);assert.equal(m.state.salvage.items[0].stock,'hood-stock');
});
test('Mass affects speed, acceleration and braking; detachment restores them without changing range or HP',()=>{
 const fresh={kind:'bukhanka'},baseSpec={speed:30};assert.equal(fieldEffects(fresh).massKg,0);assert.equal(fieldUnitSpec(fresh,baseSpec),baseSpec);assert(vehicleDynamics(fresh).acceleration>0);
 const u=car('mass'),spec={speed:30,range:400},empty=vehicleDynamics(u);
 for(const r of Object.values(FIELD_RECIPES))u.damage.parts[r.part]={installed:true,damage:0,detached:false};u.damage.revision++;
 const loaded=vehicleDynamics(u);assert(loaded.acceleration<empty.acceleration);assert(loaded.braking<empty.braking);assert(loaded.steeringRate<empty.steeringRate);assert.equal(loaded.steeringLimit,empty.steeringLimit);
 assert(fieldUnitSpec(u,spec).speed<spec.speed);assert.equal(fieldUnitSpec(u,spec).range,spec.range);assert.equal(fieldEffects(u).massKg,134);
 for(const r of Object.values(FIELD_RECIPES))u.damage.parts[r.part].detached=true;u.damage.revision++;
 assert.equal(vehicleDynamics(u),empty);assert.equal(fieldUnitSpec(u,spec),spec);assert.equal(u.hp,200);
});
test('Each new attachment intercepts only its physical area and disappears from raycasts when destroyed',()=>{
 for(const [id,origin,direction] of [['side-hood-left',[-4,-.22,1.43],[1,0,0]],['side-hood-right',[4,-.22,1.43],[-1,0,0]],['spare-wheel',[0,-5,1.48],[0,1,0]]]){
  const r=FIELD_RECIPES[id],root=createFieldModification(T,id),b=bindings(root),collider=createDamageCollider(T,b),s=createDamageState();
  assert.equal(collider.trace(origin,direction,s),null,id+' absent');s.parts[r.part]={installed:true,damage:0,detached:false};
  const hit=collider.trace(origin,direction,s);assert.equal(hit?.partId,r.part,id+' mounted');
  assert.equal(armorMultiplier({...hit,type:'bullet'},{damage:s}),r.bulletMultiplier);assert.equal(armorMultiplier({partId:0,type:'bullet'},{damage:s}),1);
  assert.equal(collider.trace([4,4,4],[-1,0,0],s),null,'No invisible global armour');
  applyDamageHit(s,{...hit,direction,type:'bullet',power:300},VEHICLE_PARTS[r.part]);assert(s.parts[r.part].detached);assert.equal(collider.trace(origin,direction,s),null);
  if(id==='spare-wheel'){assert(collider.bounds.max[1]<-2.1,'Spare sits behind rear doors');assert.equal(armorMultiplier({...hit,type:'fire'},{damage:s}),1.15);}
 }
});
test('Enemy bonnet is a real detachable painted mesh and wreck salvage cannot duplicate',()=>{
 for(const kind of ['scav-zaporozhets','scav-firetruck']){
  const model=createScavUnit(T,kind),root=model.root??model,b=bindings(root),part=extractDamagePart(T,b,30,createDamageState());assert(part,kind);
  let painted=0;part.root.traverse(n=>{if(n.material?.name==='field_body_scav')painted++;});assert(painted,kind+' paint');
  const m=fixture(),u={...car('wreck'),kind,owner:'scavs',hp:0};
  salvageFromWreck(m,u,{power:200,point:[0,2.5,1.5]});const count=m.state.salvage.items.length;assert(count>0&&count<=2);
  salvageFromWreck(m,u,{power:200,point:[0,2.5,1.5]});assert.equal(m.state.salvage.items.length,count);
  for(const item of m.state.salvage.items)assert(u.damage.parts[item.sourcePart].detached);
 }
});
test('Old save gains new blueprints without changing explicit pickup choices',()=>{
 const m=fixture();m.state.salvage={enabled:false,userConfigured:true,recipes:[],wanted:[],items:[],serial:0};ensureSalvage(m);
 assert(m.state.salvage.recipes.includes('spare-wheel'));assert(m.state.salvage.recipes.includes('side-hood-right'));assert.deepEqual(m.state.salvage.wanted,[]);assert.equal(m.state.salvage.enabled,false);
});
console.log(JSON.stringify({passed:tests.length,tests},null,2));
