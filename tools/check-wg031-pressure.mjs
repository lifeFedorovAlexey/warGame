import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const source=process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:process.cwd();
const {makeMission}=await import(pathToFileURL(source+'/tools/m02-fixture.mjs'));
const {prepareM02Diagnostic}=await import(pathToFileURL(source+'/campaign/mission02-diagnostic.js'));
const baseline=process.argv.includes('--baseline'),late=process.argv.includes('--late');
const m=process.argv.includes('--m02')?prepareM02Diagnostic(makeMission()):makeMission();m.state.openingScene={handedOver:true};
if(late&&!m.state.m02){m.state.flags.raidWon=true;for(const id of m.state.raidReserve??[]){const u=m.entity(id);if(u)u.hp=0;}}
for(const u of [...m.state.units,...m.state.buildings])if(u.owner==='rai')u.hp=u.maxHp=100000;
const hits={},damage=m.damage.bind(m);m.damage=(victim,amount,attacker,detail)=>{const hp=victim.hp;const result=damage(victim,amount,attacker,detail);if(victim.owner==='rai'&&attacker?.owner==='scavs'&&hp>victim.hp&&detail?.type!=='collision'){const key=attacker.kind+(attacker.producerId?':produced':':guard');hits[key]=(hits[key]??0)+1;}return result;};
const events=[];let next=60,loaded=false,peak=0,snapshot=false;
for(let i=0;i<(late?1680:1200)&&m.state.status==='running';i++){
 m.advance(.25);events.push(...m.drainEvents().filter(e=>['scav-produced','scav-sortie','under-attack','raid-start'].includes(e.type)));m.drainEffects();
 if(!baseline&&m.state.m02&&!snapshot&&m.state.time>=170){fs.mkdirSync('campaign/previews/wg031',{recursive:true});fs.writeFileSync('campaign/previews/wg031/m02-battle.json',m.save());snapshot=true;}
 peak=Math.max(peak,m.state.units.filter(u=>u.hp>0&&(u.m02Produced||u.reinforcement)).length);
 if(!baseline&&!loaded&&m.state.time>=210){const before=JSON.stringify(m.state.buildings.filter(b=>b.scavProduction).map(b=>b.scavProduction)),groups=JSON.stringify(m.state.m02?.groups);m.load(m.save());assert.equal(JSON.stringify(m.state.buildings.filter(b=>b.scavProduction).map(b=>b.scavProduction)),before);assert.equal(JSON.stringify(m.state.m02?.groups),groups);loaded=true;}
 if(m.state.time>=next){console.log(JSON.stringify({time:Math.round(m.state.time),units:m.state.units.length,sorties:events.filter(e=>e.type==='scav-sortie').length}));next+=60;}
}
const producers=m.state.buildings.filter(b=>b.scavProduction).map(b=>({id:b.id,camp:b.campId,type:b.scavProduction.type,...b.scavProduction,waitingUnits:b.scavProduction.waiting.map(id=>{const u=m.entity(id);return u&&{id,kind:u.kind,x:u.x,y:u.y,contact:u.scavContact,remaining:u.path.length,task:u.task,navigation:u.navigation?.reason};})}));
const report={hits,peak,saveLoad:loaded,mode:m.state.m02?'m02':late?'late':'opening',groups:m.state.m02?.groups,bases:m.state.m02?.bases,time:m.state.time,status:m.state.status,raids:m.state.flags,events,producers};
if(!baseline){
 if(m.state.m02){assert(events.some(e=>e.type==='scav-sortie'&&e.building.includes('east_factory')));assert(events.some(e=>e.type==='under-attack'));assert(peak<=40);assert(m.state.m02.groups.filter(g=>g.type==='raid').length<=2);}
 else if(late){for(const p of producers.filter(p=>p.camp!=='west-south'))assert(p.waves>=1,p.camp+' '+p.type+' sends attackers');assert(Object.keys(hits).some(k=>k.includes('scav-rifleman:produced')||k.includes('scav-grenadier:produced')),'Produced infantry reaches combat');}
 else assert.equal(events.filter(e=>e.type==='scav-produced').length,0,'Opening is not piled on with regular reinforcements');
}
const folder='docs/playtest-evidence/wg031';fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/pressure-'+report.mode+'-'+(baseline?'before':'after')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify({time:m.state.time,mode:report.mode,produced:events.filter(e=>e.type==='scav-produced').length,sorties:events.filter(e=>e.type==='scav-sortie'),hits:events.filter(e=>e.type==='under-attack').length,producers:producers.map(p=>({camp:p.camp,type:p.type,count:p.count,waves:p.waves,waiting:p.waiting.length}))}));
