// Visual review of the production renderer, with repeatable real hit events.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export async function captureDamageIndividuality(page){
  await page.setViewportSize({width:1600,height:1000});
  await page.addStyleTag({content:'#game > :not(#world), #damage-debug { visibility:hidden !important; }'});
  const cases=await page.evaluate(async()=>{
    const c=window.campaign,w=c.world,m=c.mission,T=await import('three');c.renderSuspended=true;
    m.state.units=[];m.state.buildings=[];m.effects=[];m.events=[];w.damage.reset();
    w.fixedRenderScale=true;w.renderer.setPixelRatio(1);w.renderer.setSize(1600,1000,false);w.camera.aspect=1.6;w.camera.updateProjectionMatrix();
    w.minimumCameraHeight=3;w.controls.minDistance=18;w.controls.enableDamping=false;
    const p=w.field.gridToWorld(m.config.startGrid);
    const histories=[
      {name:'front',label:'Удары спереди',rays:[[[.55,5,1.65],[0,-1,0]],[[.4,5,1.8],[0,-1,0]],[[.6,5,1.7],[0,-1,0]]]},
      {name:'side',label:'Удары в правый борт',rays:[[[5,-.5,1.65],[-1,0,0]],[[5,-.8,1.8],[-1,0,0]],[[5,-.6,1.7],[-1,0,0]]]},
      {name:'rear',label:'Удары сзади',rays:[[[.45,-5,1.65],[0,1,0]],[[.3,-5,1.8],[0,1,0]],[[.55,-5,1.7],[0,1,0]]]},
      {name:'roof',label:'Удары по крыше',rays:[[[.55,-1.3,6],[0,0,-1]],[[.6,-1.1,6],[0,0,-1]],[[.4,-1.5,6],[0,0,-1]]]},
    ];
    const units=histories.map((h,i)=>{const u=m.addUnit('bukhanka','rai',{x:p.x+(i%2-.5)*32,y:p.y+(Math.floor(i/2)-.5)*38});u.hp=u.maxHp=450;u.heading=u.previousHeading=0;u.aimTarget=null;return u;});
    m.updateFog();w.update(m,new Set(),1/60);
    const hits=[];
    for(let i=0;i<units.length;i++){
      const u=units[i],matrix=w.damage.matrixFor(u).clone();hits[i]=[];
      for(const [origin,dir] of histories[i].rays){
        const from=new T.Vector3(...origin).applyMatrix4(matrix).toArray(),direction=new T.Vector3(...dir).transformDirection(matrix).toArray();
        hits[i].push(c.damageDebug.hit(u.id,{type:'collision',power:150,from,direction}));w.update(m,new Set(),1/30);
      }
    }
    const step=async n=>{for(let i=0;i<n;i++){await new Promise(requestAnimationFrame);w.update(m,new Set(),1/30);}};
    c.individuality={units,histories,step,overview(){const z=w.field.heightAt(p.x,p.y);w.controls.target.set(p.x,p.y,z+7);w.camera.position.set(p.x+83,p.y+64,z+78);w.controls.update();},focus(i){const u=units[i],z=w.field.heightAt(u.x,u.y);w.controls.target.set(u.x,u.y,z+7);w.camera.position.set(u.x+27,u.y+15,z+21);w.controls.update();}};
    c.individuality.overview();await step(180);
    const labels=document.createElement('div');labels.id='damage-comparison';labels.style.cssText='position:fixed;inset:0;pointer-events:none;color:#eee8d6;font:16px system-ui';
    for(let i=0;i<units.length;i++){
      const u=units[i],v=new T.Vector3(u.x,u.y,w.field.heightAt(u.x,u.y)+18).project(w.camera),label=document.createElement('div');
      label.textContent=histories[i].label;label.style.cssText=`position:absolute;left:${(v.x*.5+.5)*1600}px;top:${(-v.y*.5+.5)*1000}px;transform:translate(-50%,-100%);background:#17201bd9;padding:6px 10px;border-radius:3px`;labels.append(label);
    }
    document.body.append(labels);
    return units.map((u,i)=>({name:histories[i].name,label:histories[i].label,hits:hits[i],hp:u.hp,state:u.damage,meshBindings:w.damage.getTemplate(u).bindings.length,parts:w.damage.getTemplate(u).parts}));
  });
  assert(cases.every(c=>c.hp===0&&c.state.wreck&&c.hits.every(Boolean)),'All wrecks must result from three actual collision contacts');
  assert(cases.every(c=>c.state.burn===0),'Kinetic destruction must not invent a fire');
  for(const c of cases){c.cageHash=createHash('sha256').update(JSON.stringify(c.state.cage)).digest('hex');c.missing=Object.entries(c.state.parts).filter(([,s])=>s.detached).map(([id])=>c.parts[id].name);}
  assert.equal(new Set(cases.map(c=>c.cageHash)).size,4,'Different histories must produce different geometry, not just different decals');
  await page.screenshot({path:'campaign/previews/damage-individuality.png'});
  await page.evaluate(()=>document.querySelector('#damage-comparison').remove());
  for(let i=0;i<cases.length;i++){
    await page.evaluate(async i=>{window.campaign.individuality.focus(i);await window.campaign.individuality.step(2);},i);
    await page.screenshot({path:'campaign/previews/damage-history-'+cases[i].name+'.png'});
  }
  const statistics=await page.evaluate(()=>window.campaign.world.damage.statistics);
  const result={date:new Date().toISOString(),description:'Same original B01/C01/U01 assembly, three real 150-power collisions per vehicle, no wreck mesh selection',cases,statistics};
  fs.writeFileSync('campaign/reports/damage-individuality.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({individuality:cases.map(c=>({history:c.name,hits:c.hits.map(h=>h.partId),cageHash:c.cageHash,missing:c.missing})),statistics}));
}
export async function captureDamageLook(page){
  await page.setViewportSize({width:1600,height:1000});
  await page.addStyleTag({content:'#game > :not(#world), #damage-debug { visibility:hidden !important; }'});
  await page.evaluate(async()=>{
    const c=window.campaign,w=c.world,m=c.mission,T=await import('three');c.renderSuspended=true;
    const u=m.state.units.find(u=>u.kind==='bukhanka');u.hp=u.maxHp=5000;u.heading=u.previousHeading=0;u.aimTarget=null;
    m.state.units=[u];m.state.buildings=[];m.effects=[];m.events=[];w.damage.reset();
    w.fixedRenderScale=true;w.renderer.setPixelRatio(1);w.renderer.setSize(1600,1000,false);w.camera.aspect=1.6;w.camera.updateProjectionMatrix();
    w.minimumCameraHeight=3;w.controls.minDistance=18;w.controls.enableDamping=false;
    const z=w.field.heightAt(u.x,u.y);w.controls.target.set(u.x,u.y,z+7);w.camera.position.set(u.x+30,u.y+14,z+16);w.controls.update();
    c.lookdev={u,T,hit(y,z,type,power){const matrix=w.damage.matrixFor(u).clone(),from=new T.Vector3(5,y,z).applyMatrix4(matrix),direction=new T.Vector3(-1,0,0).transformDirection(matrix);return c.damageDebug.hit(u.id,{type,power,from:from.toArray(),direction:direction.toArray()});},async step(n){for(let i=0;i<n;i++){await new Promise(requestAnimationFrame);w.update(m,new Set(),1/30);}}};
    await c.lookdev.step(45);
  });
  const capture=async name=>{await page.screenshot({path:'campaign/previews/damage-look-'+name+'.png'});};
  await capture('pristine');
  await page.evaluate(async()=>{
    const c=window.campaign,l=c.lookdev;
    for(const [y,z] of [[.4,1.6],[.56,1.76],[.73,1.65],[.90,1.84],[1.03,1.70]])l.hit(y,z,'bullet',8);
    l.hit(-.55,1.58,'collision',150);l.hit(-.62,1.66,'collision',120);
    c.damageDebug.hit(l.u.id,{type:'bullet',power:22,partId:13});
    await l.step(100);
  });
  await capture('damaged');
  await page.evaluate(async()=>{const c=window.campaign,l=c.lookdev;c.damageDebug.hit(l.u.id,{type:'bullet',power:160,partId:7});c.damageDebug.hit(l.u.id,{type:'shell',power:l.u.hp,side:'rear'});await l.step(240);});
  await capture('wreck');
  const result=await page.evaluate(()=>{const c=window.campaign,l=c.lookdev;return {damage:l.u.damage,statistics:c.world.damage.statistics};});
  fs.writeFileSync('campaign/reports/damage-lookdev.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({lookdev:true,hits:result.damage.hits,activeDebris:result.statistics.activePhysics,images:['pristine','damaged','wreck']}));
}
