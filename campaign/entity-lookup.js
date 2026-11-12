const indices=new WeakMap();

// Keep an index hint, not a cached entity. Validate the current array slot on
// every read so removal, replacement, death and save loading are immediately
// visible. IDs are unique within a mission, as assigned by Mission.id().
export function livingEntity(items,id){
 if(id==null)return undefined;
 let index=indices.get(items);if(!index){index=new Map();indices.set(items,index);}
 const slot=index.get(id),known=slot===undefined?undefined:items[slot];
 if(known&&known.id===id&&known.hp>0)return known;
 const found=items.findIndex(item=>item.id===id&&item.hp>0);
 if(found<0){index.delete(id);return undefined;}
 if(index.size>items.length*2+128)index.clear();
 index.set(id,found);return items[found];
}
