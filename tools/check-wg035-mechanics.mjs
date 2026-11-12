import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeMission} from './m02-fixture.mjs';
const report=[];
for(const ammo of [false,true]){
 const results=[];
 for(const kind of ['bukhanka','twin-machinegun']){
  const m=makeMission(),p=m.field.gridToWorld(m.config.startGrid);
  m.state.units=[];m.state.buildings=[];m.state.research['mg-ammo-1']=ammo;m.rebuildNavigation();
  const gun=m.addUnit(kind,'rai',p),target=m.addUnit('raider','scavs',{x:p.x,y:p.y+35}),spec=m.unitSpec(gun),hp=target.hp;
  assert(m.attack(gun,target,spec));assert(!m.attack(gun,target,spec),'The same cooldown prevents a second damage event');
  const shots=m.drainEffects().filter(e=>e.type==='shot');assert.equal(shots.length,1);
  results.push({kind,damage:hp-target.hp,cooldown:gun.cooldown,range:spec.range});
  m.load(m.save());assert.equal(m.entity(gun.id).kind,kind);assert.equal(m.unitSpec(m.entity(gun.id)).damage,spec.damage);
 }
 assert(Math.abs(results[1].damage/results[0].damage-1.4)<1e-9);
 assert.equal(results[1].cooldown,results[0].cooldown);assert.equal(results[1].range,results[0].range);
 report.push({ammo,results});
}
const folder='docs/playtest-evidence/wg035/'+(process.argv.includes('--baseline')?'before':'after');fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(folder+'/mechanics.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
