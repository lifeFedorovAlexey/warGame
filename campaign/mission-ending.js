// Only an already completed mission owns this camera. Ordinary conversations
// never acquire it, and the simulation stays in its terminal state.
export class MissionEnding {
 constructor(world,panel){this.world=world;this.panel=panel;this.presenting=false;}
 reset(){
  this.finish();this.panel.hidden=true;this.panel.parentElement.classList.remove('mission-ended');
  this.mission=null;this.signalKey=null;
 }
 begin(mission){
  this.mission=mission;this.presenting=true;this.elapsed=0;this.signalKey=null;
  const {controls,keys}=this.world;
  this.previous={damping:controls.enableDamping,polar:controls.maxPolarAngle};
  controls.enableDamping=false;controls.enabled=false;keys.clear();controls.update();
  this.panel.hidden=false;this.panel.parentElement.classList.add('mission-ended');
  this.panel.querySelector('strong').textContent=mission.state.status==='victory'?'Задание выполнено':'Операция прервана';
  this.panel.querySelector('small').textContent='Завершение операции';
  const wrecks=[...mission.state.buildings,...mission.state.units].filter(e=>e.hp<=0&&Number.isFinite(e.destroyedAt)
   &&!['scav-fence','scav-gate'].includes(e.kind)&&(e.owner==='rai'||mission.exploredAt(e.x,e.y)));
  wrecks.sort((a,b)=>b.destroyedAt-a.destroyedAt);
  this.focus(wrecks[0]??controls.target);
 }
 focus(point){
  const {camera,controls,field}=this.world;
  this.from={position:camera.position.clone(),target:controls.target.clone()};this.moveTime=0;
  const target=controls.target.clone().set(point.x,point.y,field.heightAt(point.x,point.y)+8);
  const offset=camera.position.clone().sub(controls.target).normalize().multiplyScalar(360);
  const position=target.clone().add(offset);
  if(point.kind==='anomaly'){
   // The existing final signal supplies the subject and distance. The approach
   // stays on the player's side, as in the existing manual signal focus.
   const foreground=this.from.target,dx=point.x-foreground.x,dy=point.y-foreground.y,d=Math.hypot(dx,dy)||1;
   const x=foreground.x-dx/d*220,y=foreground.y-dy/d*220;
   target.z=field.heightAt(point.x,point.y)+62;
   position.set(x,y,field.heightAt(x,y)+140);
   controls.maxPolarAngle=Math.PI*.48;
  }
  position.z=Math.max(position.z,field.heightAt(position.x,position.y)+40);
  this.to={position,target};
 }
 update(seconds,signal){
  if(!this.presenting)return;
  const dt=Math.max(0,Math.min(.2,seconds));this.elapsed+=dt;this.moveTime+=dt;
  if(signal){const key=signal.kind+':'+signal.x+':'+signal.y;if(key!==this.signalKey){this.signalKey=key;this.focus(signal);}}
  const {camera,controls}=this.world,t=Math.min(1,this.moveTime/2.4),ease=t*t*(3-2*t);
  camera.position.lerpVectors(this.from.position,this.to.position,ease);
  controls.target.lerpVectors(this.from.target,this.to.target,ease);controls.update();
 }
 get ready(){return this.elapsed>=2.4&&this.moveTime>=2.4;}
 finish(){
  if(this.previous){this.world.controls.enableDamping=this.previous.damping;this.world.controls.maxPolarAngle=this.previous.polar;this.previous=null;}
  this.presenting=false;
  this.panel.querySelector('small').textContent='Итоги операции';
 }
}
