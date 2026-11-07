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
  let revision=-1,owner=null,miniDirty=true;

  function blurHistory(explored){
    for(let y=0;y<gridSize;y++)for(let x=0;x<gridSize;x++){
      let sum=0;
      for(let j=0;j<weights.length;j++)sum+=weights[j]*explored[y*gridSize+clamp(x+j-2,0,gridSize-1)];
      horizontal[y*gridSize+x]=sum/16;
    }
    for(let y=0;y<gridSize;y++)for(let x=0;x<gridSize;x++){
      let sum=0;
      for(let j=0;j<weights.length;j++)sum+=weights[j]*horizontal[clamp(y+j-2,0,gridSize-1)*gridSize+x];
      history[y*gridSize+x]=sum/(16*255);
    }
  }

  function update(mission){
    if(owner===mission&&revision===mission.fogRevision)return;
    owner=mission;revision=mission.fogRevision;miniDirty=true;
    blurHistory(mission.explored);
    let offset=0;
    for(const y of samples){
      const row=y.base*gridSize,next=row+gridSize;
      for(const x of samples){
        const col=x.base,top=history[row+col]*(1-x.weight)+history[row+col+1]*x.weight;
        const bottom=history[next+col]*(1-x.weight)+history[next+col+1]*x.weight;
        data[offset++]=0;
        data[offset++]=255*smoothstep((top+(bottom-top)*y.weight-.18)/.68);
      }
    }
    const [left,top,right,bottom]=mission.state.bounds,feather=1.35;
    const first=(centre,radius,bound)=>Math.max(0,Math.ceil(Math.max(centre-radius,bound-.5)/gridStep-.5));
    const last=(centre,radius,bound)=>Math.min(textureSize-1,Math.floor(Math.min(centre+radius,bound+.5)/gridStep-.5));
    for(const source of mission.visionSources){
      const x0=first(source.x,source.radius,left),x1=last(source.x,source.radius,right);
      const y0=first(source.y,source.radius,top),y1=last(source.y,source.radius,bottom);
      for(let y=y0;y<=y1;y++){
        const dy=samples[y].grid-source.y;
        for(let x=x0;x<=x1;x++){
          const dx=samples[x].grid-source.x;
          const light=255*smoothstep((source.radius-Math.sqrt(dx*dx+dy*dy))/feather);
          const i=(y*textureSize+x)*2;
          if(light>data[i])data[i]=light;
          if(light>data[i+1])data[i+1]=light;
        }
      }
    }
    texture.needsUpdate=true;
  }

  function drawMinimap(context,size){
    if(miniDirty){
      const pixels=miniPixels.data;
      for(let y=0;y<mini.height;y++)for(let x=0;x<mini.width;x++){
        const i=(y*mini.width+x)*4,offset=(y*textureSize+x)*4;
        const current=data[offset],explored=data[offset+1];
        pixels[i]=11;pixels[i+1]=14;pixels[i+2]=15;
        pixels[i+3]=255-current*.67-explored*.33;
      }
      miniContext.putImageData(miniPixels,0,0);
      miniDirty=false;
    }
    context.drawImage(mini,0,0,size,size);
  }
  return {texture,update,drawMinimap};
}
