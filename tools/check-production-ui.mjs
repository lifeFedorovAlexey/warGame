import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const folder='campaign/previews/production-ui';fs.mkdirSync(folder,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8884')+'/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:90000});
  await page.locator('#begin').click();await page.locator('#pause').click();
  await page.evaluate(()=>window.campaign.radio.setEnabled(false));
  await page.locator('#production-toggle').click();
  assert.equal(await page.evaluate(()=>window.campaign.state.buildKind),'factory');
  await page.keyboard.press('Escape');
  const factoryId=await page.evaluate(()=>{
    const c=window.campaign,m=c.mission,w=c.world,p=w.field.gridToWorld(m.config.startGrid);
    const add=(kind,x,y)=>m.addStructure(kind,'rai',{x,y},{completed:true,progress:1,groundHeight:w.field.heightAt(x,y)});
    const factory=add('factory',p.x+170,p.y+100);add('lab',p.x-170,p.y+100);
    add('generator',p.x-190,p.y+220);add('derrick',p.x-100,p.y+240);
    m.state.energy=2400;m.state.research.flamethrower=true;m.saveDesign('Огнемёт',['C01','B01','mission-flamer']);
    m.rebuildNavigation();m.updateFog();m.updateEconomy(0);c.advance(0);return factory.id;
  });
  const camera=()=>page.evaluate(()=>{
    const w=window.campaign.world;return [...w.camera.position.toArray(),...w.controls.target.toArray()];
  });
  for(const [id,kind] of [['lab-toggle','lab'],['production-toggle','factory']]){
    await page.waitForTimeout(150);const before=await camera();
    await page.locator('#'+id).click();const after=await camera();
    assert(after.every((value,i)=>Math.abs(value-before[i])<1e-6),'Single click opens '+kind+' without moving the camera');
    assert.equal(await page.evaluate(()=>window.campaign.mission.entity(window.campaign.selected[0]).kind),kind);
    await page.locator('#'+id).dblclick();
    assert(await page.evaluate(()=>{
      const c=window.campaign,b=c.mission.entity(c.selected[0]),p=c.world.controls.target;
      return Math.hypot(p.x-b.x,p.y-b.y)<.01;
    }),'Double click focuses '+kind);
  }
  await page.locator('#design-toggle').click();
  assert(await page.locator('#designer').isVisible(),'Constructor opens with one click');
  await page.locator('[data-close-designer]').click();
  await page.locator('#production-toggle').click();
  assert.deepEqual(await page.evaluate(()=>window.campaign.selected),[factoryId]);
  assert.equal(await page.locator('#actions [data-production]').count(),3);
  for(const [kind,count] of [['bukhanka',11],['builder',2],['flamer',1]])for(let i=0;i<count;i++)await page.locator('#actions [data-icon="'+kind+'"]').click();
  const counts=()=>page.locator('#actions [data-production]').evaluateAll(buttons=>Object.fromEntries(buttons.map(b=>[b.dataset.icon,Number(b.querySelector('.production-count').textContent)])));
  assert.deepEqual(await counts(),{bukhanka:11,builder:2,flamer:1});
  assert(await page.locator('#queue').isHidden());assert.equal(await page.locator('#queue').textContent(),'');
  const pair=await page.evaluate(()=>{
    const a=document.querySelector('#lab-toggle'),b=document.querySelector('#production-toggle'),d=document.querySelector('#design-toggle');
    return {adjacent:b.nextElementSibling===a&&a.nextElementSibling===d,topA:a.getBoundingClientRect().top,topB:b.getBoundingClientRect().top};
  });
  assert(pair.adjacent&&pair.topA===pair.topB,'Toolbar order is production, NII, constructor');
  await page.mouse.move(700,300);await page.waitForTimeout(200);
  await page.screenshot({path:folder+'/queue-desktop.png'});
  await page.locator('#commands').screenshot({path:folder+'/queue-controls.png'});
  await page.evaluate(()=>{const c=window.campaign;c.mission.state.energy=0;c.advance(0);});
  assert.equal(await page.locator('#actions [data-icon="bukhanka"]').evaluate(b=>getComputedStyle(b).opacity),'1','Queued badge remains readable when ordering is disabled');
  assert(await page.locator('#actions [data-icon="builder"]').isEnabled(),'Cancellation remains available at zero energy');
  await page.locator('#actions [data-icon="builder"]').click({button:'right'});
  assert.equal((await counts()).builder,1,'Right click removes one waiting order');
  assert.equal(await page.evaluate(()=>window.campaign.mission.state.energy),160,'An unstarted order refunds its cost');
  await page.locator('#actions [data-icon="builder"]').click();
  assert.equal((await counts()).builder,2);
  await page.evaluate(()=>{const c=window.campaign,m=c.mission;m.state.energy=1200;m.updateEconomy(m.config.units.bukhanka.seconds);c.advance(0);});
  assert.deepEqual(await counts(),{bukhanka:10,builder:2,flamer:1},'Count decreases after actual production');
  await page.evaluate(()=>{const c=window.campaign,m=c.mission;m.saveDesign('Новый пулемёт',['C01','B01','U01']);c.advance(0);});
  assert.equal((await counts()).bukhanka,10,'Queued older project is counted on the replacement icon');
  await page.locator('#actions [data-icon="bukhanka"]').click({button:'right'});
  assert.equal((await counts()).bukhanka,9,'Cancellation also finds orders made before renaming');
  await page.locator('#actions [data-icon="bukhanka"]').click();
  await page.locator('#lab-toggle').click();assert(await page.locator('#actions [data-production]').count()===0);
  await page.locator('#production-toggle').click();assert.equal((await counts()).bukhanka,10);
  await page.evaluate(()=>{const c=window.campaign,m=c.mission;m.load(m.save());c.advance(0);});
  assert.equal((await counts()).bukhanka,10,'Save/load preserves badge count');
  for(const [name,width,height] of [['queue-narrow',390,844],['queue-landscape',844,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(250);
    const issues=await page.evaluate(()=>{
      const controls=[...document.querySelectorAll('#mission-hud button')].filter(b=>b.checkVisibility()),issues=[];
      for(const b of controls){const r=b.getBoundingClientRect();if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)issues.push(b.id||b.ariaLabel);}
      for(const b of document.querySelectorAll('#actions [data-production]')){
        const icon=b.querySelector('.game-icon').getBoundingClientRect(),badge=b.querySelector('.production-count').getBoundingClientRect(),r=b.getBoundingClientRect();
        if(badge.left-icon.right<3.75||Math.abs(badge.top+badge.height/2-icon.top-icon.height/2)>.75||badge.right>r.right+.75)issues.push('Badge overlaps or is misaligned');
      }
      const a=document.querySelector('#lab-toggle').getBoundingClientRect(),b=document.querySelector('#production-toggle').getBoundingClientRect();
      if(a.top!==b.top)issues.push('NII and production split across rows');
      return issues;
    });assert.deepEqual(issues,[]);await page.screenshot({path:folder+'/'+name+'.png'});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({shortcut:true,singleClickKeepsCamera:true,doubleClickFocuses:true,constructorOneClick:true,badges:true,cancelAtZeroEnergy:true,refund:true,completion:true,renamedProject:true,saveLoad:true,narrow:true,errors}));
}finally{await browser.close();}
