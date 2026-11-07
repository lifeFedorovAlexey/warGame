import assert from 'node:assert/strict';
import fs from 'node:fs';

export async function checkRallyFlag(page,folder) {
  const target=await page.evaluate(()=>{
    const c=window.campaign,m=c.mission,w=c.world,p=w.field.gridToWorld(m.config.startGrid);
    document.querySelector('#begin').click();document.querySelector('#pause').click();c.radio.setEnabled(false);
    const factory=m.addStructure('factory','rai',{x:p.x-100,y:p.y+110},{completed:true,progress:1});
    m.updateFog();c.select([factory.id]);
    const z=factory.groundHeight??w.field.heightAt(factory.x,factory.y);
    w.controls.target.set(factory.x+45,factory.y-35,z+5);
    w.camera.position.set(factory.x+180,factory.y-235,z+200);w.controls.update();w.update(m,new Set(c.selected),1/60);
    window.detailsReview.factoryId=factory.id;
    const point={x:factory.x+125,y:factory.y-70};
    return {point,screen:w.screen(point,0)};
  });
  await page.mouse.click(target.screen.x,target.screen.y,{button:'right'});
  const read=()=>page.evaluate(()=>{
    const c=window.campaign,w=c.world,m=c.mission,factory=m.entity(window.detailsReview.factoryId);
    w.update(m,new Set(c.selected),1/60);
    const root=w.scene.getObjectByName('factory_rally_flags'),flag=root.children.find(n=>n.visible);
    return {rally:factory?.rally,visible:root.children.filter(n=>n.visible).length,count:root.children.length,
      flag:flag&&{x:flag.position.x,y:flag.position.y,z:flag.position.z},terrain:factory?.rally&&w.field.heightAt(factory.rally.x,factory.rally.y)};
  });
  let state=await read();
  assert.equal(state.visible,1,'Right-clicking terrain while a factory is selected shows its rally flag');
  assert(Math.hypot(state.rally.x-target.point.x,state.rally.y-target.point.y)<.1);
  assert.deepEqual([state.flag.x,state.flag.y],[state.rally.x,state.rally.y]);
  assert(Math.abs(state.flag.z-state.terrain-.15)<1e-5,'The pole rests on terrain');
  await page.waitForTimeout(1250);state=await read();
  assert.equal(state.visible,1,'The flag persists after the transient order ring expires');
  await page.screenshot({path:folder+'/factory-rally.png'});
  const second=await page.evaluate(()=>{
    const {mission:m,world:w}=window.campaign,f=m.entity(window.detailsReview.factoryId),p={x:f.x+90,y:f.y-95};
    return {point:p,screen:w.screen(p,0)};
  });
  await page.mouse.click(second.screen.x,second.screen.y,{button:'right'});
  state=await read();
  assert.equal(state.count,1,'Moving the rally point reuses the same flag');
  assert(Math.hypot(state.flag.x-second.point.x,state.flag.y-second.point.y)<.1);
  await page.evaluate(()=>window.campaign.select([window.detailsReview.labId]));
  assert.equal((await read()).visible,0,'Selecting another building hides the factory marker');
  await page.evaluate(()=>{
    const c=window.campaign,saved=c.mission.save();c.mission.load(saved);c.select([window.detailsReview.factoryId]);
  });
  state=await read();
  assert.equal(state.visible,1,'The marker returns for the saved rally point');
  assert(Math.hypot(state.flag.x-second.point.x,state.flag.y-second.point.y)<.1);
  await page.screenshot({path:folder+'/factory-rally-moved.png'});
  await page.evaluate(()=>{const c=window.campaign;c.mission.entity(window.detailsReview.factoryId).hp=0;});
  assert.equal((await read()).count,0,'A destroyed factory leaves no stale flag');
  fs.mkdirSync('campaign/reports',{recursive:true});
  fs.writeFileSync('campaign/reports/rally-flag.json',JSON.stringify({click:true,persistent:true,terrainContact:true,reposition:true,selection:true,saveLoad:true,destroyed:true},null,2));
}
