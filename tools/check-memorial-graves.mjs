import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {graveAppearances,graveAppearance} from '../campaign/memorial-graves.js';
import {personnelRanks} from '../campaign/personnel-ranks.js';

assert.equal(graveAppearances.length,39);
assert.equal(new Set(graveAppearances.map(a=>a.url)).size,39,'Every rank has its own sprite');
for(const r of personnelRanks){const a=graveAppearance({rank:r.id});assert.equal(a.id,r.id);assert.equal(a.service,r.service);assert.equal(a.order,r.order);}
assert.equal(graveAppearance({rank:'unknown'}).id,'private');assert.equal(graveAppearance({}).id,'private');
assert.equal(graveAppearance({rank:'major',death:{rank:'sergeant'}}).id,'sergeant','Saved death rank takes precedence');
for(const service of ['army','navy']){
 const rows=graveAppearances.filter(a=>a.service===service);
 for(let i=1;i<rows.length;i++)assert(rows[i].order>rows[i-1].order);
}
assert(graveAppearance('private').url.endsWith('/grave-private-v2.png'),'Approved private stays unchanged');
const hashes=new Set(),report=[];
for(const a of graveAppearances){
 const path=fileURLToPath(a.url);assert(fs.existsSync(path),'Missing sprite '+a.id);const png=fs.readFileSync(path),hash=createHash('sha256').update(png).digest('hex');assert(!hashes.has(hash),'Duplicate artwork '+a.id);hashes.add(hash);
 assert.equal(png.subarray(1,4).toString(),'PNG');const width=png.readUInt32BE(16),height=png.readUInt32BE(20);assert(width>=512&&height>=512);assert.equal(png[24],8);assert.equal(png[25],6,'RGBA transparency '+a.id);assert.equal(png[28],0,'Non-interlaced PNG');
 const chunks=[];for(let offset=8;offset<png.length;){const n=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);if(type==='IDAT')chunks.push(png.subarray(offset+8,offset+8+n));offset+=n+12;}
 const data=inflateSync(Buffer.concat(chunks)),stride=width*4;let previous=Buffer.alloc(stride),transparent=0,solid=0,edgeSolid=0;
 const paeth=(x,y,z)=>{const p=x+y-z,dx=Math.abs(p-x),dy=Math.abs(p-y),dz=Math.abs(p-z);return dx<=dy&&dx<=dz?x:dy<=dz?y:z;};
 for(let y=0;y<height;y++){
  const offset=y*(stride+1),filter=data[offset],row=Buffer.allocUnsafe(stride);
  for(let x=0;x<stride;x++){const left=x>=4?row[x-4]:0,up=previous[x],corner=x>=4?previous[x-4]:0;row[x]=(data[offset+1+x]+(filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,corner)))&255;}
  for(let x=0;x<width;x++){const alpha=row[x*4+3];if(!alpha)transparent++;if(alpha>200)solid++;if((x===0||x===width-1||y===0||y===height-1)&&alpha>200)edgeSolid++;}previous=row;
 }
 assert(transparent>width*height*.15,'Actual clear background '+a.id);assert(solid>width*height*.08,'Nonempty artwork '+a.id);assert(edgeSolid<Math.max(width,height)*.08,'Monument is not cropped '+a.id);
 report.push({rank:a.id,width,height,bytes:png.length,sha256:hash,transparentPixels:transparent});
}
fs.mkdirSync('campaign/reports',{recursive:true});fs.writeFileSync('campaign/reports/memorial-graves-assets.json',JSON.stringify(report,null,2));
console.log('PASS: 39 unique rank sprites, true alpha, uncropped silhouettes, private preservation, death-rank lookup and complete army/navy coverage');
