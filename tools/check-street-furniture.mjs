import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../demo/vendor/three.module.js',import.meta.url).href:s,c);}});
const {streetLampSites,updateStreetFurniture,LAMP_FALL_SECONDS}=await import('../campaign/street-furniture.js');
const {ensureSalvage,updateSalvage,FIELD_RECIPES,armorMultiplier,SALVAGE_LIMITS}=await import('../campaign/vehicle-salvage.js');
const T=await import('../demo/vendor/three.module.js');
const {createStreetLampLayer}=await import('../campaign/street-lamp-layer.js');
const {createFieldModification}=await import('../campaign/field-modification-models.js');
const {prepareDamageGeometry,createDamageCollider}=await import('../campaign/damage-geometry.js');
const {createDamageState,applyDamageHit,VEHICLE_PARTS}=await import('../campaign/damage-state.js');
const config=JSON.parse(fs.readFileSync('assets/campaign/alpha/mission01/gameplay.json','utf8'));
const field={gridToWorld:([x,y])=>({x,y}),heightAt:()=>0,gradientAt:()=>({x:0,y:0})};
const fixture=()=>{const m={config,state:{units:[],time:0,powered:true},field,emit(){}};ensureSalvage(m);return m;};
const drive=(m,offset=0,kind='bukhanka')=>{
 const p=streetLampSites(field,config)[0],u={id:'car-'+m.state.units.length,kind,owner:'rai',hp:320,maxHp:320,previousX:p.x-30,x:p.x+30,previousY:p.y+offset,y:p.y+offset,heading:-Math.PI/2,previousHeading:-Math.PI/2,driveSpeed:30,task:{type:'move'},path:[{x:p.x+200,y:p.y}]};
 m.state.units.push(u);return u;
};
const passed=[];const test=(name,fn)=>{fn();passed.push(name);};
test('Near miss, parked car, infantry and wreck do not knock down lamps',()=>{
 for(const scenario of ['near','parked','infantry','wreck']){
  const m=fixture(),u=drive(m,scenario==='near'?7:0,scenario==='infantry'?'scav-rifleman':'bukhanka');
  if(scenario==='parked'){u.x=streetLampSites(field,config)[0].x;u.previousX=u.x;u.previousY=u.y;}if(scenario==='wreck')u.hp=0;
  updateStreetFurniture(m);assert.equal(Object.keys(m.state.streetFurniture).length,0,scenario);assert.equal(m.state.salvage.items.length,0);
 }
});
test('A swept impact breaks once and never changes speed, route or position',()=>{
 const m=fixture(),u=drive(m),before=structuredClone(u);drive(m);updateStreetFurniture(m);
 assert.equal(Object.keys(m.state.streetFurniture).length,1);assert.equal(m.state.salvage.items.length,1);
 for(const k of ['x','y','driveSpeed','task','path'])assert.deepEqual(u[k],before[k],k);
 const item=m.state.salvage.items[0];assert.equal(item.stock,'tube-stock');assert.equal(item.readyAt,LAMP_FALL_SECONDS);
 updateStreetFurniture(m);assert.equal(m.state.salvage.items.length,1,'No duplicate stock on a repeated sweep');
 m.state=JSON.parse(JSON.stringify(m.state));updateStreetFurniture(m);assert.equal(m.state.salvage.items.length,1,'Broken state survives loading');
});
test('Fallen stock waits for its fall, requires a recipe and installs only once',()=>{
 const m=fixture(),u=drive(m);updateStreetFurniture(m);const item=m.state.salvage.items[0];
 u.x=u.previousX=item.x;u.y=u.previousY=item.y;
 updateSalvage(m);assert(!u.damage);
 m.state.time=item.readyAt+.1;m.state.salvage.recipes=[];updateSalvage(m);assert(!u.damage);
 m.state.salvage.recipes=['tube-bumper'];m.state.salvage.enabled=false;updateSalvage(m);assert(!u.damage);
 m.state.salvage.enabled=true;updateSalvage(m);assert(u.damage.parts[26].installed);
 assert.equal(u.maxHp,400);assert.equal(u.hp,400);assert.equal(m.state.salvage.items.length,0);
 updateSalvage(m);assert.equal(u.maxHp,400);assert.equal(Object.keys(m.state.streetFurniture).length,1);
});
test('Stock expires while the broken lamp stays broken',()=>{
 const m=fixture();drive(m);updateStreetFurniture(m);m.state.time=SALVAGE_LIMITS.lifetime+1;updateSalvage(m);
 assert.equal(m.state.salvage.items.length,0);updateStreetFurniture(m);assert.equal(m.state.salvage.items.length,0);
});
test('Old saves gain the recipe without overriding explicitly disabled salvage',()=>{
 const m=fixture();m.state.salvage={enabled:false,userConfigured:true,preferenceVersion:1,recipes:['hood-guard','window-grille'],wanted:['hood-guard'],items:[],serial:0};
 ensureSalvage(m);assert(m.state.salvage.recipes.includes('tube-bumper'));assert(!m.state.salvage.enabled);assert.deepEqual(m.state.salvage.wanted,['hood-guard']);
});
test('Instanced pole falls, loses its light, disappears on collection and does not upload at rest',()=>{
 const m=fixture(),layer=createStreetLampLayer(T,field,config,()=>{}),lamp=streetLampSites(field,config)[0];
 assert(layer.update(m));const initial=layer.revision;assert(!layer.update(m));assert.equal(layer.revision,initial);assert(layer.lights.every(l=>l.intensity>0));
 const u=drive(m);updateStreetFurniture(m);assert(layer.update(m));assert.equal(layer.lights[0].intensity,0);assert(layer.lights.slice(1).every(l=>l.intensity>0));
 m.state.time=LAMP_FALL_SECONDS;assert(layer.update(m));
 const matrix=new T.Matrix4();layer.root.getObjectByName('lamp_poles').getMatrixAt(0,matrix);
 const upright=new T.Vector3(0,0,1).transformDirection(matrix);assert(Math.abs(upright.z)<.1,'Pole rests horizontally');
 const revision=layer.revision;assert(!layer.update(m));assert.equal(layer.revision,revision);
 const item=m.state.salvage.items[0];u.x=u.previousX=item.x;u.y=u.previousY=item.y;updateSalvage(m);assert(layer.update(m));
 layer.root.getObjectByName('lamp_poles').getMatrixAt(0,matrix);assert.equal(new T.Vector3().setFromMatrixScale(matrix).length(),0);
 assert.equal(layer.visibleCount,6);assert.equal(layer.lights[0].intensity,0);
 m.state.streetFurniture={};assert(layer.update(m));assert.equal(layer.visibleCount,7);assert.equal(layer.lights[0].intensity,1800);
});
test('The new bumper has actual hit geometry and can be destroyed',()=>{
 const root=createFieldModification(T,'tube-bumper');root.updateMatrixWorld(true);
 const binding=prepareDamageGeometry(T,root.children[0],'body'),collider=createDamageCollider(T,[binding]),state=createDamageState();
 assert.equal(collider.trace([0,5,1.05],[0,-1,0],state),null);
 state.parts[26]={installed:true,damage:0,detached:false};const hit=collider.trace([0,5,1.05],[0,-1,0],state);assert.equal(hit?.partId,26);
 assert.equal(armorMultiplier({...hit,type:'bullet'},{damage:state}),FIELD_RECIPES['tube-bumper'].bulletMultiplier);
 applyDamageHit(state,{...hit,direction:[0,-1,0],type:'bullet',power:300},VEHICLE_PARTS[26]);
 assert.equal(collider.trace([0,5,1.05],[0,-1,0],state),null);
});
test('A fallen lamp with a downward-facing arm rests on its foot and head, without lifting the broken end',()=>{
 const m=fixture(),u=drive(m),p=streetLampSites(field,config)[0];
 u.x=u.previousX=p.x;u.previousY=p.y-30;u.y=p.y+30;u.heading=u.previousHeading=0;
 updateStreetFurniture(m);m.state.time=LAMP_FALL_SECONDS;
 const layer=createStreetLampLayer(T,field,config,()=>{});layer.update(m);
 const poles=layer.root.getObjectByName('lamp_poles'),matrix=new T.Matrix4(),point=new T.Vector3(),vertices=poles.geometry.attributes.position;poles.getMatrixAt(0,matrix);
 assert(Math.abs(new T.Vector3(0,0,0).applyMatrix4(matrix).z-.14*config.worldScale)<1e-5,'Broken end remains on its footing');
 let lowest=Infinity;for(let i=0;i<vertices.count;i++)lowest=Math.min(lowest,point.fromBufferAttribute(vertices,i).applyMatrix4(matrix).z);
 assert(lowest>.02*config.worldScale&&lowest<.03*config.worldScale,'Head touches terrain without sinking');
});
console.log(JSON.stringify({passed:passed.length,tests:passed},null,2));
if(process.argv.includes('--benchmark')){
 const m=fixture();m.field={...field,gridToWorld:([x,y])=>({x:x*32,y:-y*32})};const start=m.field.gridToWorld(config.startGrid);
 // 500 moving footprints beside seven intact lamps. Only the new contact pass
 // is timed; this is not a frame-rate benchmark of the complete game.
 m.state.units=Array.from({length:500},(_,i)=>({id:'bench-'+i,kind:'bukhanka',owner:'rai',hp:320,x:start.x-220+i%100*3,previousX:start.x-223+i%100*3,y:start.y,previousY:start.y,heading:-Math.PI/2,previousHeading:-Math.PI/2}));
 for(let i=0;i<100;i++)updateStreetFurniture(m);
 const samples=[];for(let i=0;i<1000;i++){const begin=performance.now();updateStreetFurniture(m);samples.push(performance.now()-begin);}
 samples.sort((a,b)=>a-b);assert.equal(Object.keys(m.state.streetFurniture).length,0);
 const report={units:500,lamps:7,samples:samples.length,metric:'street-furniture contact pass only, Node.js',medianMs:samples[500],p95Ms:samples[950],maxMs:samples.at(-1)};
 fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/street-furniture-cpu.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
