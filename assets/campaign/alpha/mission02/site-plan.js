// Surveyed centre lines. Flat yards use straight streets and tangent bends;
// the two mesa ramps retain their terrain-aligned approach corridors.
export const siteRoads=[
 // The m01 westbound road crosses the original cam1b factory and tower.
 // Reroute that whole arm south of the yard, retaining the north/south trunk.
 {id:'east-entry',site:'east_factory',width:26,radius:24,startAt:'existing-road',endAt:'existing-road',endCap:'round',
  replaceGrid:[29.05,75.6,39,81],preserveSource:['junction-1--junction-7-2','junction-3--junction-7-8'],
  sourceStart:{id:'junction-7--west-south-18',gridX:29},grid:[[38.65,80.5],[33,80.5],[30.5,80.5],[29,80.5]]},
 {id:'east-yard',site:'east_factory',width:28,radius:20,endCap:'round',grid:[[33,80.5],[33,77.15]]},
 {id:'west-bypass',site:'hill_factory',width:24,radius:28,grade:.22,maxCut:12,endCap:'round',replaceGrids:[[6.3,76.05,10.95,81.8],[8.1,66.5,14.7,76.05]],
  sourceSpan:'junction-7--west-south-18',grid:[[10.93628,80.76976],[9.2,81.2],[7.5,80.9],[6.9,79.8],[6.95,78.3],[8.5,76.2],[8.5,70.4],[9.5,67],[14.5,67.5]]},
 {id:'west-entry',site:'hill_factory',width:26,endWidth:42,radius:26,endCap:'round',grid:[[8.5,75],[10.5,75],[15,75],[15,72.9]]},
 {id:'west-loading',site:'hill_factory',width:20,endWidth:36,radius:20,startAt:'existing-road',endCap:'round',grid:[[14.5,67.5],[17.5,67.5],[17.5,69.45]]},
 // A direct junction from the eastern trunk passes through both guarded gates
 // and continues to the southern service road; no doubled-back dead-end spur.
 {id:'radar-approach',site:'sensor_outpost',width:26,radius:26,grade:.22,maxCut:12,startAt:'existing-road',grid:[[39.5,90],[26.5,90]]},
 // The original approach now meets the eastern ring road. Remove its old
 // dead end inside the yard instead of overlaying a second, parallel spur.
 {id:'south-ramp',site:'energy_hub',width:26,radius:24,grade:.22,maxCut:12,endCap:'round',grid:[[26.5,90],[25.7,90],[24.05,91],[24.5,97.25],[23.37,97.4],[20.5,101.5],[20.5,107],[21.5,110.6],[24,111.6],[31.1,111.6],[31.1,106.6],[28.5,104.5],[20.5,104.5]]},
 // The public approach stays outside the wall, then turns squarely through
 // the eastern gate and joins the internal loop. Remove its old diagonal tail.
 {id:'energy-entry',site:'energy_hub',width:32,radius:26,grade:.22,maxCut:12,startAt:'existing-road',
  replaceGrid:[27.75,104.0,35.01,109.15],sourceEnd:{id:'junction-3--south-west-7',gridX:35},
  grid:[[35,104.4],[34.25,106],[33.8,107.5],[31.1,107.5]]},
 // The eastern gate also leads straight to the next region, across the open
 // plain, instead of sending outgoing traffic back around the northern fork.
 {id:'energy-east-exit',site:'energy_hub',width:26,radius:40,grade:.22,maxCut:12,endAt:'existing-road',endCap:'round',
  grid:[[32.2,107.5],[37.5,107.5],[40,109],[46,109],[52,106.9]]},
];
export const siteCourts=[
 {id:'east_factory',rect:[30.3,73.6,36.85,79.6],terraces:[[30.6,74.2,37,79.3]],tiles:[[31,77.6,36.8,79.3]],stores:[[32.6,74.8],[36.4,76.8]],gate:[33,79.6],axis:'y',
  gates:[{id:'main',edge:2,grid:[33,79.6],width:48}]},
 {id:'hill_factory',rect:[10,68,19.6,76],terraces:[[12.6,68.5,19.4,74.8],[10.8,73.7,12.6,75.4]],tiles:[[14,72.3,16.5,74.8]],stores:[[16.6,73.5],[14.4,69.3]],gate:[10,75],axis:'x',
  gates:[{id:'main',edge:3,grid:[10,75],width:44},{id:'service',edge:0,grid:[17.5,68],width:40}]},
 {id:'sensor_outpost',rect:[28.5,87,32.8,92],terraces:[[29.35,87.5,32.6,91.7]],tiles:[[29.35,87.5,32.6,90.5]],stores:[],gate:[32.8,90],axis:'x',
  gates:[{id:'main',edge:1,grid:[32.8,90],width:44},{id:'service',edge:3,grid:[28.5,90],width:44}]},
 {id:'energy_hub',rect:[18.5,102.5,33.1,114],terraces:[[22.1,104.2,29.5,111.75],[25.3,111.75,30.7,113.5]],tiles:[[22.7,104.2,25.4,105.5],[23.2,110,27.6,110.88],[27.6,108.8,28.2,110.88],[25.3,111.95,27.8,113]],stores:[[26,112.5],[27.1,112.5]],gate:[33.1,107.5],axis:'x',
  gates:[{id:'main',edge:1,grid:[33.1,107.5],width:56},{id:'service',edge:0,grid:[20.5,102.5],width:44,closed:true}]},
];
