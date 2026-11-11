// Only an already completed mission owns this camera. Ordinary conversations
// never acquire it, and the simulation stays in its terminal state.
export class MissionEnding {
 constructor(world,panel){
  this.world=world;this.panel=panel;this.presenting=false;
  panel.addEventListener('keydown',event=>{
   if(event.key!=='Tab')return;
   const buttons=[...panel.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled),first=buttons[0],last=buttons.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
 }
 reset(){
  this.finish();this.closeChoices();this.panel.parentElement.classList.remove('mission-ended');
  this.mission=null;this.signalKey=null;
 }
 begin(mission){
  this.mission=mission;this.presenting=true;this.elapsed=0;this.signalKey=null;this.returningToMap=false;
  const {controls,keys}=this.world;
  this.previous={damping:controls.enableDamping,polar:controls.maxPolarAngle};
  controls.enableDamping=false;controls.enabled=false;keys.clear();controls.update();
  this.panel.hidden=true;this.panel.parentElement.classList.add('mission-ended');
  const wrecks=[...mission.state.buildings,...mission.state.units].filter(e=>e.hp<=0&&Number.isFinite(e.destroyedAt)
   &&!['scav-fence','scav-gate'].includes(e.kind)&&(e.owner==='rai'||mission.exploredAt(e.x,e.y)));
  wrecks.sort((a,b)=>b.destroyedAt-a.destroyedAt);
  const home=mission.state.buildings.find(b=>b.owner==='rai'&&b.hp>0&&b.completed&&b.kind==='factory')
   ??mission.state.units.find(u=>u.owner==='rai'&&u.hp>0)??wrecks[0]??controls.target;
  this.returnPoint={x:home.x,y:home.y};
  this.focus(wrecks[0]??controls.target);
 }
 focus(point){
  const {camera,controls,field}=this.world;
  this.from={position:camera.position.clone(),target:controls.target.clone()};this.moveTime=0;
  const target=controls.target.clone().set(point.x,point.y,field.heightAt(point.x,point.y)+8);
  const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(360);
  // Keep the familiar overhead game view, including the final signal.
  // Looking along the horizon replaces the map with sky behind the UI.
  offset.z=Math.max(offset.z,260);
  const position=target.clone().add(offset);
  position.z=Math.max(position.z,field.heightAt(position.x,position.y)+40);
  this.to={position,target};
 }
 update(seconds,signal){
  if(!this.presenting)return;
  const dt=Math.max(0,Math.min(.2,seconds));this.elapsed+=dt;this.moveTime+=dt;
  if(signal&&!this.returningToMap){const key=signal.kind+':'+signal.x+':'+signal.y;if(key!==this.signalKey){this.signalKey=key;this.focus(signal);}}
  const {camera,controls}=this.world,t=Math.min(1,this.moveTime/2.4),ease=t*t*(3-2*t);
  camera.position.lerpVectors(this.from.position,this.to.position,ease);
  controls.target.lerpVectors(this.from.target,this.to.target,ease);controls.update();
 }
 get ready(){return this.elapsed>=2.4&&this.moveTime>=2.4;}
 prepareChoices(){
  if(this.returningToMap)return;
  // The final signal can be outside explored terrain. Return to the army
  // on the same map instead of leaving the choices over unexplored darkness.
  this.returningToMap=true;this.focus(this.returnPoint);
 }
 finish(){
  if(this.previous){this.world.controls.enableDamping=this.previous.damping;this.world.controls.maxPolarAngle=this.previous.polar;this.previous=null;}
  this.presenting=false;
 }
 showChoices(mission,canRestart=true){
  this.finish();this.panel.hidden=false;this.panel.parentElement.classList.add('ending-choices');
  this.world.controls.enabled=false;this.world.keys.clear();
  const next=this.panel.querySelector('#ending-continue'),restart=this.panel.querySelector('#ending-restart');
  next.hidden=mission.state.status!=='victory'||!!mission.state.m02;
  restart.disabled=!canRestart;restart.title=canRestart?'Начать эту операцию заново':'Начало этой операции отсутствует в старом сохранении';
  this.panel.querySelector('button:not([hidden]):not(:disabled)')?.focus();
 }
 closeChoices(){
  this.panel.hidden=true;this.panel.parentElement.classList.remove('ending-choices');
  if(!this.presenting)this.world.controls.enabled=true;
 }
}
