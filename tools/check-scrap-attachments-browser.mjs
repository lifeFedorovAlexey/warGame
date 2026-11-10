import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const folder='campaign/previews/scrap-attachments';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});
 page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
 await page.addInitScript(()=>{for(const key of ['fieldRadio','fieldSound','fieldStoryVoice'])localStorage.setItem('warGame.'+key,'off');});
 await page.goto('http://127.0.0.1:8766/campaign/?damage=1');
 try{await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});}catch(e){await page.screenshot({path:folder+'/load-failure.png'});console.error(await page.locator('body').innerText());throw e;}
 await page.locator('#begin').click();await page.evaluate(()=>campaign.advance(40));await page.waitForFunction(()=>campaign.state.active,null,{timeout:60000});await page.locator('#pause').click();
 console.log('Game ready');
 await page.evaluate(async()=>{
  campaign.radio.setEnabled(false);campaign.damageDebug.panel.hidden=true;
  const {DesignPreview}=await import('./design-preview.js'),setModel=DesignPreview.prototype.setModel;
  DesignPreview.prototype.setModel=function(...args){setModel.apply(this,args);window.scrapPreview=this;};
 });
 await page.locator('#design-toggle').click();await page.locator('[data-design-slot="field"]').click();
 assert.equal(await page.locator('[data-design-modification]').count(),6);
 assert(!(await page.locator('.designer-paint-row').isVisible()));
 const hp=await page.locator('[data-design-hp]').textContent();
 for(const id of ['side-hood-left','side-hood-right','spare-wheel'])await page.locator('[data-design-modification="'+id+'"]').click();
 assert.equal(await page.locator('[data-design-hp]').textContent(),hp);
 await page.evaluate(()=>{const p=scrapPreview;p.controls.enableDamping=false;const distance=p.camera.position.distanceTo(p.controls.target);p.camera.position.set(-.72,-1,.5).normalize().multiplyScalar(distance).add(p.controls.target);p.controls.update();});
 await page.waitForTimeout(500);await page.screenshot({path:folder+'/constructor-rear-wide.png'});
 await page.locator('[data-design-slot="paint"]').click();assert(await page.locator('.designer-paint-row').isVisible());assert(!(await page.locator('[data-design-field-note]').isVisible()));
 await page.locator('.design-paint').first().click();await page.screenshot({path:folder+'/paint-wide.png'});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(400);
  await page.screenshot({path:folder+'/paint-'+width+'.png'});
  const audit=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,tabs:[...document.querySelectorAll('.designer-tabs button')].map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};})}));
  assert(!audit.overflow);assert(audit.tabs.every(t=>t.left>=0&&t.right<=width&&t.width>=32));
  await page.locator('[data-design-slot="field"]').click();assert(!(await page.locator('.designer-paint-row').isVisible()));await page.waitForTimeout(600);
  await page.screenshot({path:folder+'/attachments-'+width+'.png'});await page.locator('[data-design-slot="paint"]').click();
 }
 await page.locator('[data-close-designer]').click();await page.setViewportSize({width:1440,height:900});
 const result=await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world,d=c.damageDebug,T=await import('three'),{updateSalvage}=await import('./vehicle-salvage.js');
  const p=w.field.gridToWorld(m.config.startGrid);m.state.units=[];m.state.salvage.items=[];m.effects=[];m.events=[];
  const receiver=m.addUnit('bukhanka','rai',p);receiver.paint='sand';window.scrapReceiver=receiver.id;
  const builder=m.addUnit('builder','rai',{x:p.x+200,y:p.y});
  const parts=[];
  for(const [kind,partId] of [['scav-firetruck',30],['scav-zaporozhets',30],['raider',1]]){
   const source=m.addUnit(kind,'scavs',{x:p.x+80+parts.length*40,y:p.y});w.update(m,new Set(),0);
   const hit=d.hit(source.id,{partId:partId,type:'bullet',power:140});if(!hit||hit.partId!==partId)throw new Error('Wrong donor contact '+JSON.stringify({kind,partId,hit}));
   const item=m.state.salvage.items.find(i=>i.sourceUnit===source.id&&i.sourcePart===partId);if(!item)throw new Error('No detached donor '+kind);
   parts.push({kind,partId,stock:item.stock,paintColor:item.paintColor});
   receiver.x=receiver.previousX=item.x;receiver.y=receiver.previousY=item.y;m.state.time=item.readyAt+.01;updateSalvage(m);w.update(m,new Set(),0);
  }
  m.state.units=[receiver,builder];m.state.salvage.items=[];receiver.x=p.x;receiver.y=p.y;receiver.previousX=p.x;receiver.previousY=p.y;m.updateFog();c.select([receiver.id],false,false);
  const save=m.save();m.load(save);const u=m.entity(receiver.id);w.update(m,new Set(),0);
  const matrix=w.damage.matrixFor(u).clone();w.controls.enableDamping=false;w.controls.minDistance=10;w.minimumCameraHeight=2;w.fixedRenderScale=1;w.renderer.setPixelRatio(1);
  w.controls.target.copy(new T.Vector3(0,0,1.2).applyMatrix4(matrix));w.camera.position.copy(new T.Vector3(-6,-8,5).applyMatrix4(matrix));w.controls.update();w.update(m,new Set(),0);
  d.panel.hidden=true;
  const localHit=(o,dir)=>{const origin=new T.Vector3(...o).applyMatrix4(matrix),direction=new T.Vector3(...dir).transformDirection(matrix);return w.damage.trace(u,origin.toArray(),direction.toArray())?.partId;};
  return {parts,installed:[27,28,29].map(id=>!!u.damage.parts[id]?.installed),colours:[u.fieldModifications['side-hood-left'].paintColor,u.fieldModifications['side-hood-right'].paintColor],hits:[localHit([-5,-.22,1.43],[1,0,0]),localHit([5,-.22,1.43],[-1,0,0]),localHit([0,-5,1.48],[0,1,0])],hp:u.hp,maxHp:u.maxHp,speed:m.unitSpec(u).speed};
 });
 assert(result.installed.every(Boolean));assert.deepEqual(result.colours,['#914c39','#718d83']);assert.deepEqual(result.hits,[27,28,29]);assert.equal(result.maxHp,320);assert(result.speed<30);
 await page.waitForTimeout(500);assert(!(await page.locator('#result').isVisible()));await page.screenshot({path:folder+'/installed-rear.png'});
 await page.evaluate(async()=>{const w=campaign.world,u=campaign.mission.entity(window.scrapReceiver),T=await import('three'),matrix=w.damage.matrixFor(u);w.camera.position.copy(new T.Vector3(6,8,5).applyMatrix4(matrix));w.controls.update();});
 await page.waitForTimeout(400);await page.screenshot({path:folder+'/installed-right.png'});
 assert.deepEqual(errors,[]);fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/scrap-attachments.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
