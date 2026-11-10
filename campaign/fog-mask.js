const gridSize=128,textureSize=512,gridStep=(gridSize-1)/textureSize;
const weights=[1,4,6,4,1];
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
function smoothstep(value){
  const t=clamp(value,0,1);
  return t*t*(3-2*t);
}

export function createFogMask(T){
  const data=new Uint8Array(textureSize*textureSize*2);
  const texture=new T.DataTexture(data,textureSize,textureSize,T.RGFormat);
  texture.minFilter=texture.magFilter=T.LinearFilter;
  const horizontal=new Float32Array(gridSize**2),history=new Float32Array(gridSize**2);
  const samples=Array.from({length:textureSize},(_,index)=>{
    const grid=(index+.5)*gridStep,base=Math.floor(grid);
    return {grid,base,weight:grid-base};
  });
  const mini=document.createElement('canvas');
  mini.width=mini.height=textureSize/2;
  const miniContext=mini.getContext('2d'),miniPixels=miniContext.createImageData(mini.width,mini.height);
  const exploredCopy=new Uint8Array(gridSize**2),baseMask=new Uint8Array(textureSize**2);
  const dirtyLeft=new Int32Array(textureSize),dirtyRight=new Int32Array(textureSize);
  const previousSources=[],previousBounds=[];
  let revision=-1,owner=null,state=null,lastUpdate=-Infinity,miniDirty=true,miniTop=0,miniBottom=mini.height-1;
  const stats={updates:0,historyUpdates:0,pixels:0};
  function dirty(x0,y0,x1,y1){
    for(let y=Math.max(0,y0);y<=Math.min(textureSize-1,y1);y++){
      dirtyLeft[y]=Math.min(dirtyLeft[y],Math.max(0,x0));dirtyRight[y]=Math.max(dirtyRight[y],Math.min(textureSize-1,x1));
    }
  }
  function sourceRect(source){
    dirty(Math.floor((source.x-source.radius)/gridStep-1),Math.floor((source.y-source.radius)/gridStep-1),
      Math.ceil((source.x+source.radius)/gridStep),Math.ceil((source.y+source.radius)/gridStep));
  }

  function blurHistory(explored,x0,y0,x1,y1){
    const left=Math.max(0,x0-2),right=Math.min(gridSize-1,x1+2);
    for(let y=y0;y<=y1;y++)for(let x=left;x<=right;x++){
      let sum=0;
      for(let j=0;j<weights.length;j++)sum+=weights[j]*explored[y*gridSize+clamp(x+j-2,0,gridSize-1)];
      horizontal[y*gridSize+x]=sum/16;
    }
    const top=Math.max(0,y0-2),bottom=Math.min(gridSize-1,y1+2);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      let sum=0;
      for(let j=0;j<weights.length;j++)sum+=weights[j]*horizontal[clamp(y+j-2,0,gridSize-1)*gridSize+x];
      history[y*gridSize+x]=sum/(16*255);
    }
    const tx0=Math.max(0,Math.floor((left-1)/gridStep)),tx1=Math.min(textureSize-1,Math.ceil((right+1)/gridStep));
    const ty0=Math.max(0,Math.floor((top-1)/gridStep)),ty1=Math.min(textureSize-1,Math.ceil((bottom+1)/gridStep));
    for(let y=ty0;y<=ty1;y++){
      const sy=samples[y],row=sy.base*gridSize,next=row+gridSize;
      for(let x=tx0;x<=tx1;x++){
        const sx=samples[x],col=sx.base,a=history[row+col]*(1-sx.weight)+history[row+col+1]*sx.weight;
        const b=history[next+col]*(1-sx.weight)+history[next+col+1]*sx.weight;
        baseMask[y*textureSize+x]=255*smoothstep((a+(b-a)*sy.weight-.18)/.68);
      }
    }
    dirty(tx0,ty0,tx1,ty1);stats.historyUpdates++;
  }

  // Gameplay visible[] remains on the fixed simulation tick. Only the visual
  // mask is wall-clock limited; paused/accelerated play does not alter vision.
  function update(mission,now=performance.now()){
    const reset=owner!==mission||state!==mission.state;
    if(!reset&&(revision===mission.fogRevision||now-lastUpdate<200))return false;
    owner=mission;state=mission.state;revision=mission.fogRevision;lastUpdate=now;
    dirtyLeft.fill(textureSize);dirtyRight.fill(-1);
    let x0=gridSize,y0=gridSize,x1=-1,y1=-1;
    for(let y=0;y<gridSize;y++)for(let x=0;x<gridSize;x++){
      const i=y*gridSize+x,value=mission.explored[i];
      if(reset||exploredCopy[i]!==value){exploredCopy[i]=value;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    }
    if(x1>=0)blurHistory(mission.explored,x0,y0,x1,y1);
    const sources=mission.visionSources;
    const changed=reset||sources.length!==previousSources.length||mission.state.bounds.some((v,i)=>v!==previousBounds[i])
      ||sources.some((v,i)=>v.x!==previousSources[i].x||v.y!==previousSources[i].y||v.radius!==previousSources[i].radius);
    if(changed){for(const source of previousSources)sourceRect(source);for(const source of sources)sourceRect(source);}
    if(reset)dirty(0,0,textureSize-1,textureSize-1);
    if(!changed&&x1<0)return false;
    for(let y=0;y<textureSize;y++)for(let x=dirtyLeft[y];x<=dirtyRight[y];x++){
      const i=y*textureSize+x;data[i*2]=0;data[i*2+1]=baseMask[i];stats.pixels++;
    }
    const [left,top,right,bottom]=mission.state.bounds,feather=1.35;
    const first=(centre,radius,bound)=>Math.max(0,Math.ceil(Math.max(centre-radius,bound-.5)/gridStep-.5));
    const last=(centre,radius,bound)=>Math.min(textureSize-1,Math.floor(Math.min(centre+radius,bound+.5)/gridStep-.5));
    for(const source of mission.visionSources){
      const x0=first(source.x,source.radius,left),x1=last(source.x,source.radius,right);
      const y0=first(source.y,source.radius,top),y1=last(source.y,source.radius,bottom);
      const outer2=source.radius*source.radius,inner2=Math.max(0,source.radius-feather)**2;
      for(let y=y0;y<=y1;y++){
        const dy=samples[y].grid-source.y;
        for(let x=Math.max(x0,dirtyLeft[y]);x<=Math.min(x1,dirtyRight[y]);x++){
          const i=(y*textureSize+x)*2;
          if(data[i]===255)continue; // max(union) is already saturated here
          const dx=samples[x].grid-source.x,d2=dx*dx+dy*dy;
          if(d2>=outer2)continue;
          const light=source.radius>=feather&&d2<=inner2?255:255*smoothstep((source.radius-Math.sqrt(d2))/feather);
          if(light>data[i])data[i]=light;
          if(light>data[i+1])data[i+1]=light;
        }
      }
    }
    for(let i=0;i<sources.length;i++){
      const copy=previousSources[i]??={};copy.x=sources[i].x;copy.y=sources[i].y;copy.radius=sources[i].radius;
    }
    previousSources.length=sources.length;
    for(let i=0;i<4;i++)previousBounds[i]=mission.state.bounds[i];
    let topDirty=textureSize,bottomDirty=-1;
    for(let y=0;y<textureSize;y++)if(dirtyRight[y]>=dirtyLeft[y]){
      // This bundled Three supports partial uploads only for RGBA. Keep the
      // compact RG upload intact; CPU rasterization and minimap use dirty rows.
      topDirty=Math.min(topDirty,y);bottomDirty=y;
    }
    if(bottomDirty>=0){
      miniTop=miniDirty?Math.min(miniTop,Math.floor(topDirty/2)):Math.floor(topDirty/2);
      miniBottom=miniDirty?Math.max(miniBottom,Math.floor(bottomDirty/2)):Math.floor(bottomDirty/2);
      miniDirty=true;texture.needsUpdate=true;stats.updates++;
    }
    return true;
  }

  function drawMinimap(context,size){
    if(miniDirty){
      const pixels=miniPixels.data;
      for(let y=miniTop;y<=miniBottom;y++)for(let x=0;x<mini.width;x++){
        const i=(y*mini.width+x)*4,offset=(y*textureSize+x)*4;
        const current=data[offset],explored=data[offset+1];
        pixels[i]=11;pixels[i+1]=14;pixels[i+2]=15;
        pixels[i+3]=255-current*.67-explored*.33;
      }
      miniContext.putImageData(miniPixels,0,0,0,miniTop,mini.width,miniBottom-miniTop+1);
      miniDirty=false;
    }
    context.drawImage(mini,0,0,size,size);
  }
  return {texture,update,drawMinimap,stats};
}
