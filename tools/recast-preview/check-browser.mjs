import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH??'playwright');
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH,headless:true,args:['--mute-audio','--use-angle=d3d11']});
const origin=process.env.WARGAME_URL??'http://127.0.0.1:8803';

try{
  for(const mission of ['m01','m02']){
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{
      if(message.text().startsWith('Recast navigation is unavailable'))console.error(message.text());
    });
    await page.goto(`${origin}/campaign/?mission=${mission}`);
    await page.waitForFunction(()=>window.campaign?.ready,null,{timeout:120000});
    await page.evaluate(()=>{campaign.renderSuspended=true;});
    await page.locator('#begin').click();
    await page.waitForFunction(()=>document.querySelector('#welcome').hidden&&(campaign.state.active||campaign.state.openingPlaying),null,{timeout:120000});

    // Delay delivery of the two synthetic topology changes in one browser
    // task. This forces the first response to be stale regardless of speed.
    const before=await page.evaluate(()=>{
      const nav=campaign.mission.nav,advisor=nav.routeAdvisor;
      if(!advisor?.mesh)throw new Error('Play started without the prepared mesh');
      const discarded=advisor.stats.discarded;
      const p=nav.position(0,0),bounds=campaign.mission.config.finalMapBounds;
      nav.topologyRevision++;
      void advisor.prepareForPlay(nav,bounds);
      nav.topologyRevision++;
      void advisor.prepareForPlay(nav,bounds);
      if(advisor.candidate(nav,p,p))throw new Error('Stale mesh returned a route');
      return discarded;
    });
    await page.waitForFunction(discarded=>{
      const nav=campaign.mission.nav,advisor=nav.routeAdvisor;
      return advisor.stats.discarded>discarded&&advisor.mesh?.job.revision===nav.topologyRevision;
    },before,{timeout:20000});

    const report=await page.evaluate(()=>{
      const nav=campaign.mission.nav,advisor=nav.routeAdvisor;
      let seed=335;
      const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
      const points=[];
      while(points.length<160){
        const col=Math.floor(random()*nav.size),row=Math.floor(random()*nav.size);
        if(nav.allowed(col,row))points.push(nav.position(col,row));
      }
      for(let i=0;i<points.length;i+=2){
        const from=points[i],to=points[i+1];
        if(nav.lineClear(from,to,false,true)||!advisor.candidate(nav,from,to))continue;
        const before=advisor.stats.accepted,path=nav.computePath(from,to);
        if(!path?.length||advisor.stats.accepted!==before+1)continue;
        // An updated topology must use the same terrain mesh and live
        // segment checks. Results cannot wait for a new worker response.
        const requested=advisor.stats.requested;
        nav.topologyRevision++;
        const repeated=nav.computePath(from,to);
        if(advisor.stats.requested!==requested||JSON.stringify(path)!==JSON.stringify(repeated))throw new Error('A topology revision changed mesh availability');
        return {stats:advisor.stats,exact:path.at(-1).x===to.x&&path.at(-1).y===to.y,segments:path.length};
      }
      throw new Error('No non-direct route was accepted by the game navigator');
    });
    assert(report.exact,JSON.stringify(report));
    assert.equal(report.stats.errors,0,JSON.stringify(report));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({mission,...report}));
    await page.close();
  }
}finally{
  await browser.close();
}
