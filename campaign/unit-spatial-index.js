// Broad phase only. Exact collision/combat tests retain their existing rules
// and original state-array order. Updated after each sequential unit move.
export class UnitSpatialIndex{
  constructor(cellSize=64){this.cellSize=cellSize;this.cells=new Map();this.entries=new Map();this.queries=new Map();this.owners=new Map();}
  key(x,y){return Math.floor(x/this.cellSize)*65536+Math.floor(y/this.cellSize);}
  rebuild(units){this.cells.clear();this.entries.clear();this.queries.clear();this.owners.clear();for(let i=0;i<units.length;i++)this.insert(units[i],i);}
  insert(unit,order=this.entries.size){
    this.owners.set(unit.owner,(this.owners.get(unit.owner)??0)+1);
    const key=this.key(unit.x,unit.y),entry={key,order,unit,owner:unit.owner};if(!this.cells.has(key))this.cells.set(key,new Set());this.cells.get(key).add(entry);this.entries.set(unit,entry);this.queries.clear();
  }
  update(unit){const entry=this.entries.get(unit);if(!entry){this.insert(unit);return;}if(entry.owner!==unit.owner){this.owners.set(entry.owner,this.owners.get(entry.owner)-1);this.owners.set(unit.owner,(this.owners.get(unit.owner)??0)+1);entry.owner=unit.owner;}const key=this.key(unit.x,unit.y);if(key===entry.key)return;this.cells.get(entry.key)?.delete(entry);if(!this.cells.has(key))this.cells.set(key,new Set());this.cells.get(key).add(entry);entry.key=key;this.queries.clear();}
  query(point,radius,excludeOwner){
    if(excludeOwner!==undefined&&this.owners.get(excludeOwner)===this.entries.size)return [];
    const result=[],cell=this.cellSize,x0=Math.floor((point.x-radius)/cell),x1=Math.floor((point.x+radius)/cell),y0=Math.floor((point.y-radius)/cell),y1=Math.floor((point.y+radius)/cell),key=[x0,x1,y0,y1].join(',');
    let entries=this.queries.get(key);
    if(!entries){
      entries=[];for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)for(const entry of this.cells.get(x*65536+y)??[])entries.push(entry);
      entries.sort((a,b)=>a.order-b.order);this.queries.set(key,entries);
    }
    for(const {unit} of entries)if((excludeOwner===undefined||unit.owner!==excludeOwner)&&Math.abs(unit.x-point.x)<=radius&&Math.abs(unit.y-point.y)<=radius)result.push(unit);
    return result;
  }
}
