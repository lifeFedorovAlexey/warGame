export function ignite(entity,hit,time,sourceId){
 const prior=entity.burning;
 entity.burning={until:time+4,lastTick:prior?.lastTick??time,rate:Math.max(prior?.rate??0,Math.min(4,Math.max(1,hit.power*.12))),sourceId,
  point:[...(hit.restPoint??hit.point)],normal:[...hit.normal],direction:[...hit.direction]};
}
export function updateBurning(mission){
 const now=mission.state.time;
 for(const entity of [...mission.state.units,...mission.state.buildings]){
  const burn=entity.burning;if(!burn)continue;
  const end=Math.min(now,burn.until),elapsed=Math.max(0,end-burn.lastTick);burn.lastTick=end;
  if(entity.hp>0&&elapsed>0)mission.damage(entity,burn.rate*elapsed,mission.entity(burn.sourceId),{
   type:'fire',burningTick:true,point:burn.point,normal:burn.normal,direction:burn.direction,partId:0,
   partSpec:{material:mission.config.units[entity.kind]?'metal':'concrete'}});
  if(now>=burn.until)delete entity.burning;
 }
}
