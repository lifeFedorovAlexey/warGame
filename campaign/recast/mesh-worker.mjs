import {exportNavMesh,init} from 'recast-navigation';
import {generateTiledNavMesh} from 'recast-navigation/generators';

let ready;

function geometry({size,cell,half,bounds,walkable,occupied}){
  const [left,top,right,bottom]=bounds;
  const firstCol=Math.max(0,Math.ceil(left*32/cell));
  const lastCol=Math.min(size-1,Math.floor(right*32/cell));
  const firstRow=Math.max(0,Math.ceil(top*32/cell));
  const lastRow=Math.min(size-1,Math.floor(bottom*32/cell));
  const positions=[],indices=[];
  const open=new Map();
  const allowed=(col,row)=>walkable[row*size+col]&&!occupied[row*size+col];

  function addRectangle({left,right,top},bottom){
    const x0=(left-.5)*cell-half;
    const x1=(right+.5)*cell-half;
    const z0=half-(top-.5)*cell;
    const z1=half-(bottom+.5)*cell;
    const i=positions.length/3;
    positions.push(x0,0,z0,x1,0,z0,x1,0,z1,x0,0,z1);
    indices.push(i,i+1,i+2,i,i+2,i+3);
  }

  for(let row=firstRow;row<=lastRow+1;row++){
    const runs=new Map();
    if(row<=lastRow){
      for(let col=firstCol;col<=lastCol;col++){
        if(!allowed(col,row))continue;
        const left=col;
        while(col<lastCol&&allowed(col+1,row))col++;
        runs.set(`${left},${col}`,{left,right:col,top:row});
      }
    }
    for(const [key,rect] of open){
      if(runs.has(key))continue;
      addRectangle(rect,row-1);
      open.delete(key);
    }
    for(const [key,rect] of runs)if(!open.has(key))open.set(key,rect);
  }
  return {positions,indices};
}

self.onmessage=async ({data:{id,snapshot}})=>{
  try{
    await (ready??=init());
    const start=performance.now();
    const {positions,indices}=geometry(snapshot);
    if(!indices.length)throw new Error('No walkable geometry');
    const built=generateTiledNavMesh(positions,indices,{
      cs:4,ch:1,tileSize:64,walkableRadius:0,walkableHeight:2,
      walkableClimb:0,minRegionArea:0,mergeRegionArea:0,maxSimplificationError:.5,
    });
    if(!built.success)throw new Error(built.error);
    try{
      const bytes=exportNavMesh(built.navMesh);
      self.postMessage({id,bytes,bakeMs:performance.now()-start},[bytes.buffer]);
    }finally{
      built.navMesh.destroy();
    }
  }catch(error){
    self.postMessage({id,error:String(error)});
  }
};
