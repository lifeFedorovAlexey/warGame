// Real mission attacks on the original Bukhanka, at unchanged combat HP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const label=process.argv.includes('--before')?'before':'after',folder='campaign/previews/damage-readability';
fs.mkdirSync(folder,{recursive:true});fs.mkdirSync('campaign/reports',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto((process.env.DAMAGE_BASE_URL??'http://127.0.0.1:8893')+'/campaign/?damage=1');
 await page.waitForFunction(()=>window.campaign?.ready&&window.campaign.damageDebug,null,{timeout:120000});
 await page.locator('#begin').click();await page.locator('#pause').click();
 const fixture=await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world;c.renderSuspended=true;c.radio.setEnabled(false);
  m.state.units=[];m.state.buildings=[];m.state.camps=[];m.state.salvage.items=[];m.state.artifacts=[];m.effects=[];m.events=[];m.state.pendingCinematics=[];w.damage.reset();
  const p=m.field.gridToWorld(m.config.startGrid),u=m.addUnit('bukhanka','rai',p),enemy=m.addUnit('raider','scavs',{x:p.x+70,y:p.y+25});
  u.heading=u.previousHeading=0;m.updateFog();m.explored.fill(1);m.rebuildNavigation();
  c.damageDebug.panel.hidden=true;w.fixedRenderScale=true;w.renderer.setPixelRatio(1);w.controls.enableDamping=false;w.controls.minDistance=18;w.minimumCameraHeight=3;
  c.damageReadability={u,enemy,async render(distance){const width=innerWidth,height=innerHeight;w.renderer.setSize(width,height,false);w.camera.aspect=width/height;w.camera.updateProjectionMatrix();
    const z=w.field.heightAt(u.x,u.y);w.controls.target.set(u.x,u.y,z+7);w.camera.position.set(u.x+distance*.85,u.y+distance*.45,z+7+distance*.65);w.controls.update();
    for(let i=0;i<3;i++){await new Promise(requestAnimationFrame);w.update(m,new Set([u.id]),1/60);}
  }};
  await c.damageReadability.render(48);return {hp:u.hp,maxHp:u.maxHp,weapon:m.unitSpec(enemy)};
 });
 await page.screenshot({path:folder+'/'+label+'-pristine.png'});
 const result=await page.evaluate(async()=>{
  const c=campaign,m=c.mission,w=c.world,{u,enemy}=c.damageReadability,shots=[];
  // No artificial HP assignment: 27 real raider MG hits, 6 damage each.
  for(let i=0;i<27;i++){
   const a=.2+Math.sin(i*.63)*.6;enemy.x=u.x+70*Math.cos(a);enemy.y=u.y+70*Math.sin(a);enemy.previousX=enemy.x;enemy.previousY=enemy.y;
   enemy.cooldown=0;m.state.time+=m.unitSpec(enemy).cooldown;
   shots.push(m.attack(enemy,u,m.unitSpec(enemy)));w.update(m,new Set([u.id]),1/60);
  }
  m.effects=[];c.select([u.id]);c.advance(0);
  // Let transient bullet sparks expire before judging permanent damage.
  for(let i=0;i<100;i++){await new Promise(requestAnimationFrame);w.update(m,new Set([u.id]),1/60);}
  await c.damageReadability.render(48);
  const stats={...w.damage.statistics},g=w.renderer.getContext(),ext=g.getExtension('WEBGL_debug_renderer_info');
  return {hp:u.hp,maxHp:u.maxHp,shots,damage:JSON.parse(JSON.stringify(u.damage)),stats,renderer:ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)};
 });
 assert.equal(result.hp,158);assert(result.shots.every(Boolean));assert.equal(result.damage.hits,27);
 await page.screenshot({path:folder+'/'+label+'-half-close.png'});
 if(process.argv.includes('--diagnose')){
  await page.evaluate(async()=>{const w=campaign.world;w.scene.traverse(o=>{for(const mat of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){
   const compile=mat.onBeforeCompile,key=mat.customProgramCacheKey.bind(mat);mat.onBeforeCompile=function(s){compile.call(this,s);s.fragmentShader=s.fragmentShader.replace('if(vDamageState.x>.5&&vDamageState.y<.5){','if(false){');};mat.customProgramCacheKey=()=>key()+'_no_bump';mat.needsUpdate=true;
  }});await campaign.damageReadability.render(48);});
  await page.screenshot({path:folder+'/diagnostic-no-bump.png'});
  await page.evaluate(async()=>{campaign.world.scene.traverse(o=>{o.receiveShadow=false;});await campaign.damageReadability.render(48);});
  await page.screenshot({path:folder+'/diagnostic-no-shadow.png'});
  await page.evaluate(async()=>{campaign.world.scene.traverse(o=>{for(const mat of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){
   const compile=mat.onBeforeCompile,key=mat.customProgramCacheKey.bind(mat);mat.onBeforeCompile=function(s){compile.call(this,s);if(s.fragmentShader.includes('void damageLayer'))s.fragmentShader=s.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.rgb=mix(vec3(.12),vec3(.8),damageCoverage);');};mat.customProgramCacheKey=()=>key()+'_mask';mat.needsUpdate=true;
  }});await campaign.damageReadability.render(48);});
  await page.screenshot({path:folder+'/diagnostic-mask.png'});
 }
 await page.evaluate(()=>campaign.damageReadability.render(175));await page.screenshot({path:folder+'/'+label+'-half-rts.png'});
 await page.setViewportSize({width:800,height:900});await page.evaluate(()=>campaign.damageReadability.render(105));await page.screenshot({path:folder+'/'+label+'-half-narrow.png'});
 const idle=await page.evaluate(async()=>{
  const c=campaign,w=c.world,m=c.mission,before={...w.damage.statistics},saved=m.save(),damage=JSON.stringify(c.damageReadability.u.damage);
  for(let i=0;i<30;i++)w.update(m,new Set(),1/60);
  const after={...w.damage.statistics};m.load(saved);
  return {geometryUpdates:after.geometryUpdates-before.geometryUpdates,textureRows:after.textureRows-before.textureRows,persists:JSON.stringify(m.entity(c.damageReadability.u.id).damage)===damage};
 });
 assert.equal(idle.geometryUpdates,0);assert.equal(idle.textureRows,0);assert(idle.persists);assert.deepEqual(errors,[]);
 fs.writeFileSync('campaign/reports/damage-readability-'+label+'.json',JSON.stringify({date:new Date().toISOString(),fixture,...result,idle,errors},null,2));
 console.log(JSON.stringify({label,hp:result.hp,hits:result.damage.hits,marks:result.damage.marks.length,cageMax:Math.max(0,...(result.damage.cage??[]).map(Math.abs)),idle,errors,renderer:result.renderer}));
}finally{await browser.close();}
