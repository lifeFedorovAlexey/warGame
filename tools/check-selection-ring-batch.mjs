import assert from 'node:assert/strict';
import * as T from '../demo/vendor/three.module.js';
import {createSelectionRings,placeSelectionRing} from '../campaign/selection-rings.js';
const field={heightAt:(x,y)=>Math.sin(x/7)*3+Math.cos(y/9)*5},source=new T.RingGeometry(1,1.08,64),parent=new T.Group();
const materials=[0xc0ce93,0xff352b].map(color=>new T.MeshBasicMaterial({color,transparent:true,side:T.DoubleSide}));
const batch=createSelectionRings(T,parent,field,source,materials);
for(const count of [500,3,700,0]){
 batch.begin();const slots=[0,0];
 for(let i=0;i<count;i++){
  const x=i*2.01-501,y=Math.sin(i)*80,radius=i%5?8:19,colour=i%7?0:1,slot=slots[colour]++;
  batch.add(x,y,radius,colour);
  const old=new T.Mesh(source.clone(),materials[colour]);placeSelectionRing(old,field,x,y,radius);
  const packed=batch.layers[colour].geometry.attributes.position,positions=old.geometry.attributes.position;
  for(let j=0;j<positions.count;j++)for(let axis=0;axis<3;axis++){
   const expected=positions.array[j*3+axis]+old.position.getComponent(axis),actual=packed.array[(slot*positions.count+j)*3+axis];
   assert(Math.abs(actual-expected)<.0002,'Batch retains every ground-following vertex');
  }
  old.geometry.dispose();
 }
 batch.end();assert.equal(parent.children.filter(m=>m.visible).length,count?2:0);
 for(let c=0;c<2;c++)assert.equal(batch.layers[c].geometry.drawRange.count,slots[c]*source.index.count);
}
assert(materials.every(m=>m.forceSinglePass),'Flat rings need one transparent pass');
console.log('PASS identical ground-following rings, 700 selections, growth, shrinking and clearing; at most two meshes');
