import fs from 'node:fs';
import assert from 'node:assert/strict';

export async function checkHudLayout(page) {
  const folder = 'campaign/previews/layout-review';
  fs.mkdirSync(folder, {recursive:true});
  const errors = [], checks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if(response.status() >= 400) errors.push(response.status()+' '+response.url()); });
  async function capture(name) {
    await page.evaluate(() => Promise.all([...new Set([...document.querySelectorAll('.atlas-cell')].map(icon=>icon.style.backgroundImage.slice(5,-2)))].map(src=>{const image=new Image();image.src=src;return image.decode();})));
    await page.waitForTimeout(300);
    const issues = await page.evaluate(() => {
      const rect = element => element.getBoundingClientRect();
      const overlaps = (a,b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
      const map = rect(document.querySelector('#world canvas'));
      const deck = rect(document.querySelector('.command-deck'));
      const problems=[];
      if(Math.abs(map.top)>1||Math.abs(map.left)>1||Math.abs(map.width-innerWidth)>1||Math.abs(map.height-innerHeight)>1) problems.push('Map is reduced to make space for HUD');
      for(const panel of document.querySelectorAll('.command-deck,.top,.operation-menu')) {
        const s=getComputedStyle(panel);
        if(s.backgroundColor!=='rgba(0, 0, 0, 0)'||s.backgroundImage!=='none') problems.push('Solid HUD plate: '+panel.className);
        if(['Top','Right','Bottom','Left'].some(side=>parseFloat(s['border'+side+'Width']))) problems.push('HUD frame: '+panel.className);
      }
      const clearX=innerWidth*.5,clearY=innerHeight-20;
      if(innerWidth>=1100&&document.elementFromPoint(clearX,clearY)!==document.querySelector('#world canvas'))problems.push('Empty HUD space blocks map input');
      const visible=e=>e.checkVisibility()&&e.getClientRects().length;
      const squad=rect(document.querySelector('.squad')),orders=rect(document.querySelector('.order-bar'));
      if(squad.right>orders.left+1)problems.push('Roster and orders are no longer in separate corners');
      if(innerWidth>700){
        const mapPanel=rect(document.querySelector('#minimap-panel'));
        if(Math.abs(orders.bottom-mapPanel.bottom)>1||orders.right>mapPanel.left)problems.push('Orders are detached from the minimap');
      }
      const controls=[...document.querySelectorAll('#mission-hud button,#mission-hud summary')].filter(visible);
      for(const control of controls) {
        const r=rect(control), id=control.id||control.getAttribute('aria-label');
        if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1) problems.push(id+' outside viewport');
        const icon=control.querySelector('.game-icon');
        if(!icon) problems.push(id+' missing icon');
        else {const ir=rect(icon),iconArea=r.width-(control.dataset.production?22:0);if(Math.abs(ir.left+ir.width/2-r.left-iconArea/2)>.75||Math.abs(ir.top+ir.height/2-r.top-r.height/2)>.75)problems.push(id+' off centre');}
        if(parseFloat(getComputedStyle(control).borderTopWidth)) problems.push(id+' framed');
      }
      for(let i=0;i<controls.length;i++) for(let j=i+1;j<controls.length;j++) if(overlaps(rect(controls[i]),rect(controls[j]))) problems.push('Controls overlap: '+(controls[i].id||controls[i].ariaLabel)+' / '+(controls[j].id||controls[j].ariaLabel));
      const panels=['#commands','#radio','#minimap-panel'].map(s=>document.querySelector(s)).filter(visible);
      for(let i=0;i<panels.length;i++) for(let j=i+1;j<panels.length;j++) if(overlaps(rect(panels[i]),rect(panels[j]))) problems.push('Panels overlap: '+panels[i].id+' / '+panels[j].id);
      return problems;
    });
    await page.screenshot({path:`${folder}/${name}.png`});
    assert.deepEqual(issues,[],name);
    checks.push(name);
  }
  await page.goto((process.env.WARGAME_URL ?? 'http://127.0.0.1:8766')+'/campaign/');
  await page.waitForFunction(()=>window.campaign?.ready, {}, {timeout:90000});
  await page.locator('#begin').click();
  await page.locator('#pause').click();
  // Freeze the initial dispatch so layout checks cover a long radio message.
  await page.evaluate(()=>{window.campaign.radio.until=Infinity;});
  await capture('01-field');
  await page.locator('#build-toggle').click();
  await capture('02-build');
  await page.locator('.settings summary').click();
  assert(await page.locator('#objectives').isVisible());
  assert(await page.locator('#control-hints').isHidden());
  await page.locator('#controls-help').click();
  assert(await page.locator('#control-hints').isVisible());
  assert(await page.locator('#objectives').isHidden());
  await page.locator('[aria-controls="operation-tasks"]').click();
  assert(await page.locator('#control-hints').isHidden());
  await capture('03-menu');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.settings').getAttribute('open'),null);
  assert(await page.locator('.settings > summary').evaluate(button=>button===document.activeElement));
  for(const [name,width,height] of [['04-compact',800,600],['05-narrow',390,844],['06-landscape',844,390]]) {
    await page.setViewportSize({width,height});
    await capture(name);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.settings summary').click();
  await capture('06a-narrow-menu-radio');
  assert(await page.locator('#radio [data-dismiss]').isVisible());
  const dispatch=await page.locator('#radio').boundingBox(),menu=await page.locator('.operation-menu').boundingBox();
  assert(dispatch.x+dispatch.width<menu.x,'Radio controls remain beside the operation menu');
  await page.locator('#radio [data-dismiss]').click();
  assert(await page.locator('#radio').isHidden());
  assert(await page.locator('.settings').getAttribute('open')!==null,'Skipping radio leaves the menu open');
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#close-build').click();
  await capture('07-field-quiet');
  await page.locator('.settings summary').click();
  await page.locator('[aria-controls="operation-actions"]').click();
  await page.locator('#home').click();
  assert.equal(await page.locator('.settings').getAttribute('open'),null);
  // Exercise construction through the resized canvas, then cancel the pending order.
  await page.locator('#build-toggle').click();
  await page.getByRole('button',{name:/^АЭС/}).click();
  await page.locator('#suggest-site').click();
  await capture('08-placement');
  await page.locator('#cancel-order').click();
  await page.evaluate(()=>{
    const c=window.campaign,m=c.mission,p=m.field.gridToWorld(m.config.startGrid);
    m.state.energy=2000;
    const factory=m.addStructure('factory','rai',{x:p.x+170,y:p.y+100},{completed:true,progress:1});
    c.select([factory.id]);
  });
  await page.waitForFunction(()=>document.querySelectorAll('#actions button').length>=2);
  await capture('09-factory');
  await page.locator('#actions [data-icon="builder"]').click();
  assert.equal(await page.evaluate(()=>window.campaign.mission.state.buildings.find(b=>b.kind==='factory'&&b.owner==='rai').queue.length),1);
  await capture('10-production');
  assert.deepEqual(errors,[]);
  fs.mkdirSync('campaign/reports', {recursive:true});
  fs.writeFileSync('campaign/reports/hud-layout.json',JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({checks,errors}));
}
