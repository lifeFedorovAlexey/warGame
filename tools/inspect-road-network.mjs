import fs from 'node:fs';
import {createRequire} from 'node:module';
import {makeMission} from './m02-fixture.mjs';
import {baseApproachRoads} from '../campaign/base-roads.js';
import {scavBaseRoads} from '../campaign/scav-base-roads.js';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='campaign/previews/road-junctions';fs.mkdirSync(dir,{recursive:true});
const m=makeMission(),f=m.field;
const svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="1560" viewBox="0 0 1100 1560"><rect width="1100" height="1560" fill="#e5d6b4"/>'];
const p=q=>{const [x,y]=f.worldToGrid(q.x,q.y);return [(x-4)*21,(y-18)*21];};
for(const [roads,color] of [[f.roadNetwork.paths,'#555'],[scavBaseRoads(f,m.config),'#12a260'],[baseApproachRoads(f,m.config),'#3868dd'],[f.m02Roads,'#e14d24']])for(const r of roads){
 svg.push(`<polyline points="${r.points.map(q=>p(q).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${r.width*21/32}" stroke-linejoin="round"/>`);
}
for(const n of f.roadNetwork.nodes){const [x,y]=p(n);svg.push(`<circle cx="${x}" cy="${y}" r="4" fill="orange"/><text x="${x+8}" y="${y}" font-size="13">${n.id}</text>`);}
for(const c of m.config.camps){const [x,y]=p(f.gridToWorld(c.grid));svg.push(`<text x="${x}" y="${y}" font-size="16" fill="#23732d">${c.id}</text>`);}
svg.push('</svg>');fs.writeFileSync(dir+'/network.svg',svg.join('\n'));
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{const page=await browser.newPage({viewport:{width:1100,height:1560}});await page.setContent(svg.join(''));await page.screenshot({path:dir+'/network.png'});}finally{await browser.close();}
