const fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
 const {createHeightfield,createMapRoute}=await import('../demo/map-route.js'),{shapeMesaRims}=await import('../demo/mesa-shaping.js'),{refineRoadHeightfield}=await import('../demo/road-heightfield.js'),{applyRoadGrades}=await import('../demo/road-grading.js');
 const data=JSON.parse(fs.readFileSync('assets/maps/alpha/heightfield.json','utf8')),sourceField=createHeightfield(data),roads=JSON.parse(fs.readFileSync('assets/maps/alpha/roads.json','utf8'));let field=sourceField;
 const hash=crypto.createHash('sha256').update(fs.readFileSync('references/terrain/alpha/heightmap-128-16bit.png')).digest('hex');
 if(hash!==data.sourceSha256||data.samples.length!==16384||field.extent!==4064)throw new Error('Source identity or scale failed');
 let nodalError=0,flatCells=0,flatError=0;
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const p=field.gridToWorld([x,y]);nodalError=Math.max(nodalError,Math.abs(field.heightAt(p.x,p.y)-data.samples[y*128+x]*.3));
  if(x<127&&y<127){const values=[data.samples[y*128+x],data.samples[y*128+x+1],data.samples[(y+1)*128+x],data.samples[(y+1)*128+x+1]];if(values.every(v=>v===values[0])){flatCells++;for(const [u,v] of [[.25,.25],[.5,.5],[.75,.75]]){const q=field.gridToWorld([x+u,y+v]);flatError=Math.max(flatError,Math.abs(field.heightAt(q.x,q.y)-values[0]*.3));}}}
 }
 if(nodalError>.0001||flatError>.0001||flatCells<100)throw new Error('Mesa refinement altered source nodes or flat cells');
 const mesaShaping=shapeMesaRims(field);if(mesaShaping.maxChangeMetres>6.001)throw new Error('Mesa shaping exceeded its bound');
 let preservedCoreSamples=0;
 for(let y=3;y<125;y++)for(let x=3;x<125;x++){const h=data.samples[y*128+x];let flat=true;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)if(data.samples[(y+dy)*128+x+dx]!==h)flat=false;if(flat){const p=field.gridToWorld([x,y]);if(Math.abs(field.heightAt(p.x,p.y)-h*.3)>.0001)throw new Error('Flat plateau interior changed');preservedCoreSamples++;}}
 if(!preservedCoreSamples)throw new Error('No preserved level interiors');
 if(roads.paths.length!==19)throw new Error('Road backbone missing');
 const graph=new Map(roads.nodes.map(node=>[node.id,[]]));for(const [a,b] of roads.edges){if(!graph.has(a)||!graph.has(b))throw new Error('Missing road node');graph.get(a).push(b);graph.get(b).push(a);}const visited=new Set(),queue=[roads.nodes[0].id];while(queue.length){const id=queue.pop();if(visited.has(id))continue;visited.add(id);queue.push(...graph.get(id));}if(visited.size!==graph.size||roads.edges.length!==graph.size-1)throw new Error('Road network disconnected or contains duplicate loops');
 const nodes=new Map(roads.nodes.map(node=>[node.id,node]));let junctionError=0;
 for(const branch of roads.paths)for(const [id,p] of [[branch.from,branch.points[0]],[branch.to,branch.points.at(-1)]]){const node=nodes.get(id);if(!node)throw new Error('Missing branch endpoint: '+id);junctionError=Math.max(junctionError,Math.hypot(p.x-node.x,p.y-node.y, p.z-node.z));}
 if(junctionError>.01)throw new Error('Road junction gap');field=refineRoadHeightfield(field);const grading=applyRoadGrades(field,roads);if(grading.maxChangeMetres>8.001)throw new Error('Road cut/fill exceeded allowed change');
 const layout=JSON.parse(fs.readFileSync('assets/maps/alpha/material-layout.json','utf8'));if(layout.length!==12)throw new Error('Material count failed');
 for(const material of layout)if(fs.statSync('assets/maps/alpha/materials/'+material.name+'.jpg').size<10000)throw new Error('Material missing: '+material.name);
 const pbr=JSON.parse(fs.readFileSync('assets/maps/alpha/materials/pbr/manifest.json','utf8'));if(pbr.assets.length!==4||pbr.license!=='CC0-1.0')throw new Error('PBR material manifest invalid');for(const asset of pbr.assets)for(const file of Object.values(asset.files)){const actual=crypto.createHash('sha256').update(fs.readFileSync('assets/maps/alpha/materials/pbr/'+file.path)).digest('hex');if(actual!==file.sha256)throw new Error('PBR source changed: '+file.path);}
 const route=createMapRoute(field,JSON.parse(fs.readFileSync('assets/maps/alpha/route.json','utf8'))),T=await import('../demo/vendor/three.core.js'),{createTerrainSurround}=await import('../demo/terrain-surround.js'),surround=createTerrainSurround(T,field,new T.MeshBasicMaterial()),positions=surround.geometry.attributes.position;let surroundSeamError=0;for(let i=0;i<surround.geometry.userData.rimVertexCount;i++)surroundSeamError=Math.max(surroundSeamError,Math.abs(positions.getZ(i)-field.heightAt(positions.getX(i),positions.getY(i))-.03));if(surroundSeamError>.0001)throw new Error('Gap at surrounding landscape seam');
 const report={sourceSamples:data.samples.length,extentMetres:field.extent,refinedSize:field.renderSize,nodalErrorMm:nodalError*1000,flatCells,flatErrorMm:flatError*1000,mesaShaping,preservedCoreSamples,surroundSeamErrorMm:surroundSeamError*1000,surroundTriangles:surround.geometry.index.count/3,routeLengthMetres:route.length,roadCorridors:roads.paths.length,roadSource:roads.source,materials:layout.length,roadComponents:1,junctionGapMm:junctionError*1000,roadGrading:grading};
 fs.mkdirSync('demo/reports',{recursive:true});fs.writeFileSync('demo/reports/map-data.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exit(1)});
