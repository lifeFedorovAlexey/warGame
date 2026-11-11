import {rankById} from '../personnel-ranks.js';

export class CrewStories{
 constructor(saved={}){this.losses=saved.losses??[];this.spokenLosses=new Set(saved.spokenLosses??[]);this.nextNoviceAt=saved.nextNoviceAt??75;this.serial=saved.serial??0;this.introductionAttempts=new Map(saved.introductionAttempts??[]);}
 lost(m,ids){
  const soldiers=m.state.campaign?.personnel?.soldiers??{};
  const living=Object.values(soldiers).filter(s=>!s.death),average=living.reduce((n,s)=>n+(rankById(s.rank)?.order??0),0)/Math.max(1,living.length);
  for(const id of ids){const s=soldiers[id];if(!s?.death||this.losses.some(l=>l.id===id))continue;
   this.losses.push({id,at:m.state.time,name:s.givenName??s.name,callSign:s.callsign,gender:s.gender,rank:s.rank,
    veteran:(rankById(s.rank)?.order??0)>average&&(rankById(s.rank)?.order??0)>0});}
  this.losses=this.losses.slice(-128);
 }
 tick(m,engine,emit){
  const now=m.state.time,p=m.state.campaign?.personnel;if(!p)return;
  const quiet=now-(engine.state.lastCombat??-Infinity)>=10;
  if(quiet){
   const pending=this.losses.filter(l=>!this.spokenLosses.has(l.id)&&now-l.at>=20&&now-l.at<180);
   if(pending.length>=3||pending.some(l=>l.veteran)){
    const named=pending.find(l=>l.veteran)??pending[0];
    const remembered=engine.state.introducedCrews?.includes(named.id)||engine.state.journal.some(j=>j.newcomerId===named.id&&j.crewId===named.id&&j.ruleId==='idle.driver_pair');
    emit('idle.crew_history',{incidentId:'remembrance-'+(++this.serial),facts:{personalLossCount:pending.length,lostCallSign:named.callSign,lostName:named.name,
     lostVeteran:named.veteran,lostNewcomerRemembered:remembered},flags:{confirmed:true}});
    pending.forEach(l=>this.spokenLosses.add(l.id));
   }
  }
  if(!quiet||now-(engine.state.lastLoss??-Infinity)<45||now<this.nextNoviceAt)return;this.nextNoviceAt=now+120;
  const free=m.state.units.filter(u=>u.owner==='rai'&&u.hp>0&&!u.task&&!u.path?.length&&!u.factoryVisit&&!u.combatRetreat);
  const crews=free.map(u=>({unit:u,soldier:p.soldiers[p.crews[u.id]?.memberIds?.[0]]})).filter(c=>c.soldier&&!c.soldier.death);
  const green=crews.filter(c=>(rankById(c.soldier.rank)?.order??0)===0&&!engine.state.introducedCrews?.includes(c.soldier.id))
   .sort((a,b)=>(this.introductionAttempts.get(a.soldier.id)??0)-(this.introductionAttempts.get(b.soldier.id)??0))[0];
  const older=crews.find(c=>(rankById(c.soldier.rank)?.order??0)>0);
  if(green&&older){
   this.introductionAttempts.set(green.soldier.id,(this.introductionAttempts.get(green.soldier.id)??0)+1);
   while(this.introductionAttempts.size>512)this.introductionAttempts.delete(this.introductionAttempts.keys().next().value);
   emit('idle.driver_pair',{incidentId:'newcomer-'+green.soldier.id+'-'+(++this.serial),affectedIds:[green.unit.id,older.unit.id],facts:{newcomerId:green.soldier.id,mentorId:older.soldier.id},flags:{confirmed:true}});
  }
 }
 save(){return {losses:this.losses,spokenLosses:[...this.spokenLosses],nextNoviceAt:this.nextNoviceAt,serial:this.serial,introductionAttempts:[...this.introductionAttempts]};}
}
