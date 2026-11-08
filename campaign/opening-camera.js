// The opening shows the first car's salvage pickup, then the builder's job.
// Normal radio dialogue never starts or restores this controller.
export class OpeningCamera {
  constructor(world,mission){
    this.world=world;this.mission=mission;this.phase='drive';this.elapsed=0;
    const {camera,controls}=world;
    this.damping=controls.enableDamping;controls.enableDamping=false;
    controls.update();
    this.overview={position:camera.position.clone(),target:controls.target.clone()};
    controls.enabled=false;world.keys.clear();
  }

  dispose(){this.world.controls.enableDamping=this.damping;this.phase='done';}

  update(seconds,canHandOver=false){
    if(this.phase==='done')return true;
    const dt=Math.max(0,Math.min(.2,seconds)),{camera,controls,field}=this.world;
    if(canHandOver&&this.phase!=='return'){
      this.phase='return';this.returnTime=0;
      this.returnFrom={position:camera.position.clone(),target:controls.target.clone()};
    }
    if(this.phase==='return'){
      this.returnTime+=dt;
      const t=Math.min(1,this.returnTime/2.6),ease=t*t*t*(t*(t*6-15)+10);
      camera.position.lerpVectors(this.returnFrom.position,this.overview.position,ease);
      controls.target.lerpVectors(this.returnFrom.target,this.overview.target,ease);controls.update();
      if(t<1)return false;
      camera.position.copy(this.overview.position);controls.target.copy(this.overview.target);
      controls.enableDamping=this.damping;controls.update();this.phase='done';return true;
    }
    const scene=this.mission.state.openingScene,sign=this.mission.entity(scene?.signId),builder=this.mission.entity(scene?.builderId);
    if(!sign||!builder)return false;
    this.elapsed+=dt;
    const aspect=Math.max(.25,camera.aspect),framing=Math.max(1,Math.min(1.7,.9/aspect));
    const signZ=sign.groundHeight??field.heightAt(sign.x,sign.y),truckZ=field.heightAt(builder.x,builder.y)+7;
    const target=controls.target.clone(),position=camera.position.clone();
    let angle,radius,height;
    const demo=scene.salvageDemo,car=demo&&demo.status!=='done'?this.mission.entity(demo.vehicleId):null;
    if(car){
      this.phase=demo.status==='show'?'bumper':'salvage';
      const forward={x:-Math.sin(car.heading),y:Math.cos(car.heading)};
      target.set(car.x+forward.x*5,car.y+forward.y*5,field.heightAt(car.x,car.y)+6);
      // Front quarter: the falling pole and the newly fitted tubes remain visible.
      angle=car.heading+Math.PI-.55;radius=demo.status==='show'?95:112;height=demo.status==='show'?52:78;
    }else if(sign.completed){
      this.phase='sign';target.set(sign.x,sign.y,signZ+9);angle=sign.rotation;radius=108;height=58;
    }else if(sign.progress>0||builder.builderWorking){
      this.phase='build';target.set(builder.x*.60+sign.x*.40,builder.y*.60+sign.y*.40,truckZ*.60+(signZ+8)*.40);
      angle=sign.rotation-.24;radius=125;height=74;
    }else{
      this.phase='drive';
      const dx=sign.x-builder.x,dy=sign.y-builder.y,distance=Math.max(1,Math.hypot(dx,dy));
      target.set(builder.x+dx/distance*5,builder.y+dy/distance*5,truckZ);
      const arc=Math.max(0,Math.min(1,(this.elapsed-4)/18)),ease=arc*arc*(3-2*arc);
      angle=.65-1.05*ease;radius=100-6*ease;height=96-6*ease;
    }
    radius*=framing;height*=framing;
    position.set(target.x+Math.sin(angle)*radius,target.y-Math.cos(angle)*radius,target.z+height);
    // Keep the shot above the actual terrain, including the slope by the sign.
    position.z=Math.max(position.z,field.heightAt(position.x,position.y)+44);
    for(let t=.15;t<1;t+=.1){
      const x=target.x+(position.x-target.x)*t,y=target.y+(position.y-target.y)*t;
      const clearance=field.heightAt(x,y)+5-(target.z+(position.z-target.z)*t);
      if(clearance>0)position.z+=clearance/t;
    }
    const follow=1-Math.exp(-dt*2.2);
    controls.target.lerp(target,follow);camera.position.lerp(position,follow);controls.update();
    return false;
  }
}
