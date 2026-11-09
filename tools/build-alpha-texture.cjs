// Source roads and smoothed mesa masks are independent of the demonstration route.
const {chromium}=require('C:/Users/Алексей/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8766/references/terrain/README.md');
  const {createHeightfield}=await import('../demo/map-route.js'),{shapeMesaRims}=await import('../demo/mesa-shaping.js'),{refineRoadHeightfield}=await import('../demo/road-heightfield.js'),{applyRoadGrades}=await import('../demo/road-grading.js'),raw=JSON.parse(fs.readFileSync('assets/maps/alpha/heightfield.json','utf8')),coarse=createHeightfield(raw),roads=JSON.parse(fs.readFileSync('assets/maps/alpha/roads.json','utf8'));shapeMesaRims(coarse);const field=refineRoadHeightfield(coarse);applyRoadGrades(field,roads);
  const result=await page.evaluate(async({size,samples,roads,roadsOnly})=>{
   const load=async src=>{const im=new Image();im.src=src;await im.decode();return im;},make=(w,h=w)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
   const clamp=v=>Math.max(0,Math.min(1,v)),smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);},gauss=(x,y,cx,cy,r)=>Math.exp(-((x-cx)**2+(y-cy)**2)/(r*r));
   const source=await load('/references/terrain/alpha/map-sectors.jpg'),ref=make(2048),rc=ref.getContext('2d',{willReadFrequently:true});rc.drawImage(source,192,320,4096,4096,0,0,2048,2048);rc.drawImage(ref,380,804,180,64,184,804,180,64);
   const pixels=rc.getImageData(0,0,2048,2048).data,roadPaths=roads.paths;
   const roadCanvas=make(1024),roadCtx=roadCanvas.getContext('2d'),shoulders=make(1024),shoulderCtx=shoulders.getContext('2d'),roadDetail=make(2048),rd=roadDetail.getContext('2d');
   for(const [ctx,res] of [[roadCtx,1024],[shoulderCtx,1024],[rd,2048]]){ctx.fillStyle='#000';ctx.fillRect(0,0,res,res);ctx.strokeStyle=ctx.fillStyle='#fff';ctx.lineCap=ctx.lineJoin='round';}
   for(const path of roadPaths)for(const [context,extra,res] of [[shoulderCtx,8,1024],[roadCtx,-7,1024],[rd,0,2048]])for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i];context.lineWidth=(((a.width??path.width)+(b.width??path.width))/2+extra)/4064*res;context.beginPath();context.moveTo((a.x+2032)/4064*res,(2032-a.y)/4064*res);context.lineTo((b.x+2032)/4064*res,(2032-b.y)/4064*res);context.stroke();}
   for(const node of roads.nodes??[])if(node.degree>2||node.base){for(const [context,res,extra] of [[roadCtx,1024,-3.5],[rd,2048,0],[shoulderCtx,1024,4]]){context.beginPath();context.arc((node.x+2032)/4064*res,(2032-node.y)/4064*res,((node.apronRadius??28)+extra)/4064*res,0,Math.PI*2);context.fill();}}
   // R stores coverage; G stores distance into the pavement. The shader uses
   // this field to collect sand on broken edges without moving the road itself.
   const roadPixels=rd.getImageData(0,0,2048,2048),distanceBins=new Map(),distanceBucket=96,signedField=new Float32Array(2048*2048);
   const bin=(item,minx,miny,maxx,maxy)=>{for(let y=Math.floor(miny/distanceBucket);y<=Math.floor(maxy/distanceBucket);y++)for(let x=Math.floor(minx/distanceBucket);x<=Math.floor(maxx/distanceBucket);x++){const key=x+','+y;if(!distanceBins.has(key))distanceBins.set(key,[]);distanceBins.get(key).push(item);}};
   for(const path of roadPaths)for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],ha=(a.width??path.width)/2,hb=(b.width??path.width)/2,r=Math.max(ha,hb)+16;bin({a,b,ha,hb},Math.min(a.x,b.x)-r,Math.min(a.y,b.y)-r,Math.max(a.x,b.x)+r,Math.max(a.y,b.y)+r);}
   for(const node of roads.nodes??[])if(node.base||node.degree>2){const radius=node.apronRadius??28;bin({node,radius},node.x-radius-16,node.y-radius-16,node.x+radius+16,node.y+radius+16);}
   for(let y=0;y<2048;y++)for(let x=0;x<2048;x++){const wx=(x+.5)/2048*4064-2032,wy=2032-(y+.5)/2048*4064,index=(y*2048+x)*4,candidates=distanceBins.get(Math.floor(wx/distanceBucket)+','+Math.floor(wy/distanceBucket));let signed=-16;
    for(const item of candidates??[]){if(item.node){const dx=wx-item.node.x,dy=wy-item.node.y;signed=Math.max(signed,item.radius-Math.sqrt(dx*dx+dy*dy));continue;}const {a,b,ha,hb}=item,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((wx-a.x)*dx+(wy-a.y)*dy)/(dx*dx+dy*dy||1))),px=wx-a.x-dx*t,py=wy-a.y-dy*t;signed=Math.max(signed,ha+(hb-ha)*t-Math.sqrt(px*px+py*py));}
    signedField[y*2048+x]=signed;
   }
   // Smooth the geometric distance field, then threshold it in the shader.
   // Straight edges remain sharp; junction cusps acquire a small real fillet.
   const distanceScratch=new Float32Array(signedField.length),kernel=[1,6,15,20,15,6,1];
   for(let y=0;y<2048;y++)for(let x=0;x<2048;x++){let sum=0;for(let d=-3;d<=3;d++)sum+=signedField[y*2048+Math.max(0,Math.min(2047,x+d))]*kernel[d+3];distanceScratch[y*2048+x]=sum/64;}
   for(let y=0;y<2048;y++)for(let x=0;x<2048;x++){let signed=0;for(let d=-3;d<=3;d++)signed+=distanceScratch[Math.max(0,Math.min(2047,y+d))*2048+x]*kernel[d+3];signed/=64;const index=(y*2048+x)*4;roadPixels.data[index]=smooth(-2.2,2.2,signed)*255;roadPixels.data[index+1]=Math.max(0,Math.min(255,(.5+signed/24)*255));roadPixels.data[index+2]=0;}
   rd.putImageData(roadPixels,0,0);
   if(roadsOnly)return {output:{'road-detail.png':roadDetail.toDataURL('image/png').split(',')[1]},roads};
   const road=roadCtx.getImageData(0,0,1024,1024).data,shoulder=shoulderCtx.getImageData(0,0,1024,1024).data;
   const names=['dune-sand','bleached-sand','rust-clay','desert-gravel','scorched-rock','ash-earth','ruined-asphalt','weathered-concrete','transition-sand','dusty-sandstone','sandy-talus','weathered-limestone'];
   const controls=Array.from({length:4},()=>make(1024)),data=controls.map(c=>c.getContext('2d').createImageData(1024,1024)),mini=make(1024),mc=mini.getContext('2d'),mp=mc.createImageData(1024,1024),totals=Array(12).fill(0),dominant=Array(12).fill(0);
   const sample=(gx,gy)=>{const x=Math.max(0,Math.min(size-1.00001,gx/127*(size-1))),y=Math.max(0,Math.min(size-1.00001,gy/127*(size-1))),ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy,a=samples[iy*size+ix],b=samples[iy*size+ix+1],c=samples[(iy+1)*size+ix],d=samples[(iy+1)*size+ix+1];return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);};
   const palette=[[166,124,76],[186,153,109],[142,95,64],[132,112,84],[80,77,66],[103,91,73],[57,58,54],[139,134,119],[177,141,94],[132,101,67],[149,119,80],[173,150,110]];
   for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){
    const i=(y*1024+x)*4,gx=x/1023*127,gy=y/1023*127,n=.5+.24*Math.sin(gx*.23+Math.sin(gy*.17)*1.5)+.16*Math.cos(gy*.28-gx*.10),px=gx+Math.sin(gy*.55+gx*.09)*.24,py=gy+Math.cos(gx*.51-gy*.1)*.24,h=sample(px,py),dx=(sample(px+.55,py)-sample(px-.55,py))/35.2,dy=(sample(px,py+.55)-sample(px,py-.55))/35.2,slope=Math.hypot(dx,dy);
    const low=1-smooth(14,32,h),mid=smooth(15,29,h)*(1-smooth(42,55,h)),high=smooth(42,58,h),face=smooth(.12,.55,slope),flat=1-smooth(.08,.38,slope);
    const west=gauss(gx,gy,25,100,27),north=gauss(gx,gy,22,22,21),east=gauss(gx,gy,113,80,24),central=gauss(gx,gy,67,49,34);
    const w=[
     .06+low*(.9+central*1.9),.04+low*east*2.5,
     .01+low*west*3.4,.08+mid*flat*2.1,
     .015+face*(north*.9+gauss(gx,gy,108,21,22)*.65),.01+low*north*1.7,
     0,0,.12+low*(1-central)*.45,
     .04+face*2.2,.06+smooth(.04,.20,slope)*(1-smooth(.30,.72,slope))*1.5,
     .04+high*flat*2.5
    ];
    w[10]+=(shoulder[i]-road[i])/255*(.55+n*.65);w[8]+=(shoulder[i]-road[i])/255*.65;
    const max=Math.max(...w);for(let j=0;j<12;j++)w[j]=Math.pow(Math.max(0,w[j]-max*.28),1.55);const sum=w.reduce((a,b)=>a+b,0);for(let j=0;j<12;j++)w[j]/=sum;
    const sx=Math.min(2047,Math.floor(gx*16)),sy=Math.min(2047,Math.floor(gy*16)),ri=(sy*2048+sx)*4,r=pixels[ri],g=pixels[ri+1],b=pixels[ri+2],paved=r>75&&Math.max(r,g,b)-Math.min(r,g,b)<28?smooth(75,110,r)*clamp((g-r+2)/12)*clamp((b-r+10)/18)*(1-smooth(.12,.4,slope))*.85:0;
    const asphalt=road[i]/255*(.90+.10*n)*(1-paved),remaining=1-asphalt-paved;for(let j=0;j<12;j++)w[j]*=remaining;w[6]=asphalt;w[7]=paved;
    for(let j=0;j<12;j++){totals[j]+=w[j];data[Math.floor(j/3)].data[i+j%3]=w[j]*255;}for(const d of data)d.data[i+3]=255;dominant[w.indexOf(Math.max(...w))]++;
    const light=Math.max(.5,Math.min(1.17,(.96-dx*.4-dy*.3)/Math.sqrt(1+dx*dx+dy*dy))),color=[0,0,0];w.forEach((a,j)=>palette[j].forEach((v,k)=>color[k]+=v*a*light));mp.data.set([...color,255],i);
   }
   const output={'road-detail.png':roadDetail.toDataURL('image/png').split(',')[1]};controls.forEach((c,i)=>{const cc=c.getContext('2d');cc.putImageData(data[i],0,0);if(i!==2){const q=make(1024),qc=q.getContext('2d');qc.filter='blur(3.2px)';qc.drawImage(c,0,0);cc.drawImage(q,0,0);}output['surface-control-'+i+'.png']=c.toDataURL('image/png').split(',')[1];});mc.putImageData(mp,0,0);const small=make(512);small.getContext('2d').drawImage(mini,0,0,512,512);output['minimap.jpg']=small.toDataURL('image/jpeg',.9).split(',')[1];
   const means=[];
   for(const name of names){const im=await load('/assets/maps/alpha/materials/source/'+name+'.png'),tile=make(1024),tc=tile.getContext('2d');tc.drawImage(im,0,0,1024,1024);output['materials/'+name+'.jpg']=tile.toDataURL('image/jpeg',.93).split(',')[1];const tp=tc.getImageData(0,0,1024,1024).data,mean=[0,0,0];let samples=0;for(let q=0;q<tp.length;q+=64){for(let k=0;k<3;k++)mean[k]+=Math.pow(tp[q+k]/255,2.2);samples++;}means.push(mean.map(v=>v/samples));if(name==='transition-sand'){const bump=make(256),bc=bump.getContext('2d',{willReadFrequently:true});bc.drawImage(im,0,0,256,256);const bp=bc.getImageData(0,0,256,256);for(let i=0;i<bp.data.length;i+=4){const v=bp.data[i]*.25+bp.data[i+1]*.55+bp.data[i+2]*.2;bp.data[i]=bp.data[i+1]=bp.data[i+2]=v;}bc.putImageData(bp,0,0);output['materials/ground-bump.png']=bump.toDataURL('image/png').split(',')[1];}}
   const macro=make(1024),mx=macro.getContext('2d'),md=mx.createImageData(1024,1024),selection=make(1024),sc=selection.getContext('2d'),sd=sc.createImageData(1024,1024),decoded=controls.map(c=>c.getContext('2d').getImageData(0,0,1024,1024).data);
   means.forEach((m,i)=>{for(let k=0;k<3;k++)m[k]=Math.pow(palette[i][k]/255,2.2);});
   for(let i=0;i<md.data.length;i+=4){const weights=names.map((_,j)=>decoded[Math.floor(j/3)][i+j%3]/255),paved=weights[7];let total=0,color=[0,0,0];for(let j=0;j<12;j++){if(j===6||j===7)continue;total+=weights[j];for(let k=0;k<3;k++)color[k]+=means[j][k]*weights[j];}for(let k=0;k<3;k++){color[k]/=Math.max(.001,total);color[k]=color[k]*(1-paved)+means[7][k]*.87*paved;md.data[i+k]=Math.pow(Math.max(0,color[k]),1/2.2)*255;}md.data[i+3]=255;weights[6]=0;let a=0,b=1;for(let j=0;j<12;j++)if(weights[j]>weights[a])a=j;for(let j=0;j<12;j++)if(j!==a&&(b===a||weights[j]>weights[b]))b=j;sd.data.set([a,b,Math.round(weights[b]/Math.max(.001,weights[a]+weights[b])*255),255],i);}
   mx.putImageData(md,0,0);sc.putImageData(sd,0,0);output['macro-albedo.jpg']=macro.toDataURL('image/jpeg',.94).split(',')[1];output['detail-selection.png']=selection.toDataURL('image/png').split(',')[1];
   const sky=await load('/assets/maps/alpha/materials/source/desert-sky.png'),sk=make(2048,1024);sk.getContext('2d').drawImage(sky,0,0,2048,1024);output['materials/desert-sky.jpg']=sk.toDataURL('image/jpeg',.93).split(',')[1];
   return {output,roads,layout:names.map((name,i)=>({name,coveragePercent:totals[i]/1024**2*100,dominantPercent:dominant[i]/1024**2*100}))};
  },{size:field.renderSize,samples:Array.from(field.renderSamples),roads,roadsOnly:process.argv.includes('--roads-only')});
  for(const [name,data] of Object.entries(result.output)){const target=path.resolve('assets/maps/alpha',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,Buffer.from(data,'base64'));}
  if(result.layout)fs.writeFileSync('assets/maps/alpha/material-layout.json',JSON.stringify(result.layout,null,2)+'\n');console.log(JSON.stringify({materials:result.layout?.length,roadSegments:result.roads.paths.length,roadSource:result.roads.source,files:Object.keys(result.output).length}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
