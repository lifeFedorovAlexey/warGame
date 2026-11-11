import {personnelRanks,rankInsignia} from './personnel-ranks.js';

const slots=new Map(personnelRanks.map((rank,index)=>[rank.id,index+1]));
export const rankAtlasSlot=id=>slots.get(id)??0;
export const RANK_ATLAS_COLUMNS=8,RANK_ATLAS_ROWS=5;
// One texture and one instanced draw for all HP/rank indicators. No DOM
// element, SVG decoding or texture upload is performed per vehicle/frame.
export function createRankAtlas(T){
 const canvas=typeof document!=='undefined'?document.createElement('canvas'):null;
 if(!canvas)return {texture:new T.Texture(),ready:Promise.resolve()};
 const scale=3,cw=24*scale,ch=32*scale;
 canvas.width=cw*RANK_ATLAS_COLUMNS;canvas.height=ch*RANK_ATLAS_ROWS;
 const context=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);
 texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;
 const image=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Rank atlas image failed: '+src.slice(0,80)));img.src=src;});
 const ready=Promise.all(personnelRanks.map(async rank=>{
  if(!rank.stars&&!rank.bars)return;
  const svg=rankInsignia(rank.id,{compact:true}).replace(/<image[^>]*\/>/g,'').replaceAll('currentColor','#d9c58d');
  const img=await image('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg));
  const slot=rankAtlasSlot(rank.id),x=slot%RANK_ATLAS_COLUMNS*cw+2*scale,y=Math.floor(slot/RANK_ATLAS_COLUMNS)*ch+2*scale;
  context.save();context.shadowColor='#131b13';context.shadowBlur=scale*1.2;context.shadowOffsetY=scale*.6;
  context.drawImage(img,x,y,20*scale,28*scale);
  if(rank.special==='emblem')context.drawImage(await image(new URL('../assets/campaign/personnel/insignia/russian-eagle.svg',import.meta.url).href),x+5*scale,y+scale,10*scale,11*scale);
  context.restore();
 })).then(()=>{texture.needsUpdate=true;});
 return {texture,ready};
}
