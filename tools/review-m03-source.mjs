import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1040,height:1040},deviceScaleFactor:1});
 await page.goto((process.env.WARGAME_URL??'http://127.0.0.1:8772')+'/');
 const result=await page.evaluate(async()=>{
  const source=(await import('/assets/campaign/alpha/mission03/original-map.js')).default,{createM03Field}=await import('/campaign/mission03-terrain.js'),{m03SurfaceAt}=await import('/campaign/mission03-surface-layout.js'),f=createM03Field();
  document.body.replaceChildren();document.body.style='margin:0;background:#24221d;color:#e2d8bd;font:17px sans-serif';
  const canvas=document.createElement('canvas');canvas.width=1040;canvas.height=1040;document.body.append(canvas);const ctx=canvas.getContext('2d');ctx.fillStyle='#24221d';ctx.fillRect(0,0,1040,1040);ctx.fillStyle='#e2d8bd';ctx.fillText('Оригинал sub1-1: тайлы и высоты',24,30);ctx.fillText('М03: те же клетки, материалы игры',530,30);
  const tiles=await Promise.all(Array.from({length:78},(_,i)=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src='/references/terrain/alpha/original-sub1-1/visual-source/tile-'+String(i).padStart(2,'0')+'.png';}))),cell=10;
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
   const index=y*source.width+x,tile=source.tiles[index],rotation=(tile>>12)&3,g=f.gradientAt((x+42+.5)*32-f.half,f.half-(y+17+.5)*32),shade=Math.max(.5,Math.min(1.2,.90+(g.x-g.y)*.17));
   ctx.save();ctx.translate(24+(x+.5)*cell,50+(y+.5)*cell);ctx.rotate(rotation*Math.PI/2);ctx.scale(tile&0x8000?-1:1,tile&0x4000?-1:1);ctx.drawImage(tiles[tile&511],-5,-5,10,10);ctx.restore();ctx.fillStyle='rgba(0,0,0,'+(1-Math.min(1,shade))+')';ctx.fillRect(24+x*cell,50+y*cell,cell,cell);
   const {color,type}=m03SurfaceAt(f,x+42+.5,y+17+.5);ctx.fillStyle='rgb('+color.map(v=>Math.round(v*shade)).join(',')+')';ctx.fillRect(530+x*cell,50+y*cell,cell,cell);
  }
  for(const left of [24,530]){
   for(const feature of source.features.filter(v=>/Warehouse|Ruin|ruin|HUT/.test(v.kind))){ctx.fillStyle='#332c23';ctx.fillRect(left+(feature.grid[0]-.4)*cell,50+(feature.grid[1]-.4)*cell,8,8);}
   ctx.strokeStyle='#eee0af';ctx.lineWidth=2;ctx.strokeRect(left+5*cell,50+81*cell,8*cell,6*cell);ctx.fillStyle='#eee0af';ctx.fillText('LZ',left+8*cell,50+85*cell);
  }
  ctx.fillStyle='#c3b99f';ctx.fillText('Сравнение исходных данных, не игровой скриншот. Масштаб по X/Y сохранён; высоты: 2 × 32 / 128 = 0,5 м.',24,1010);
  return {sourceSize:[source.width,source.height],heightUnit:f.heightUnitMetres,sourceTiles:source.tiles.length};
 });
 assert.equal(result.heightUnit,.5);await page.screenshot({path:'campaign/previews/m03/10-source-comparison.png'});console.log(result);
}finally{await browser.close();}
