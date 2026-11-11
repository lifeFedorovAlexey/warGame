// Locations from cam1a labels.json and struct.bjo; IDs remain stable for story
// and save compatibility. Only new campaigns use the original northern sites.
const camps=[
 {grid:[29.5,35.5],gateGrid:[28.5,39],towerGrids:[[30.5,37.5]],coreRotationDegrees:0,
  sourceLabel:'scavBase1Cleanup',sourceIds:[3418],
  siteLayout:{box:[-96,-112,156,48],gate:'south',gateAt:-32,gateSpan:80,barracks:[108,8],store:[-64,-10],towers:[],garageTurn:0}},
 {grid:[40,16.5],gateGrid:[39.5,20.5],towerGrids:[[41.5,18.5],[36.5,18.5]],coreRotationDegrees:0,
  sourceLabel:'base2Factory',sourceIds:[8,800,802],
  siteLayout:{box:[-152,-128,80,48],gate:'south',gateAt:-16,gateSpan:96,barracks:[-96,-100],store:[56,0],towers:[],garageTurn:0}},
 {grid:[14,12.5],gateGrid:[12.5,16.25],towerGrids:[[11.5,13.5],[14.5,14.5],[9.5,15.5],[9.5,11.5],[15.5,11.5]],coreRotationDegrees:0,
  sourceLabel:'base3Factory',sourceIds:[20,923,31,39,840,845],
  siteLayout:{box:[-168,-120,64,56],gate:'south',gateAt:-48,gateSpan:80,barracks:[-112,8],store:[32,-96],towers:[],garageTurn:0}},
 {grid:[19,31.5],gateGrid:[16.5,28.5],towerGrids:[],coreRotationDegrees:180,
  approachGrid:[18.79,14.57],approachRoad:['nw-headquarters'],
  sourceLabel:'base4Factory',sourceIds:[1256,1249,3448],
  siteLayout:{design:'square-workshop',box:[-190,-144,56,96],navigationBox:[-240,-144,56,96],gate:'north',gateAt:-80,gateSpan:76,departure:'main',
   barracks:[-135,18],barracksTurn:180,store:[-138,-82],garageTurn:180,
   towers:[[-164,70],[30,70],[-164,-118],[30,-118]],towerHp:600,
   emplacements:[[-155,140],[-5,140]],guardStart:90,
   serviceGate:{side:'south',at:-80,span:44}}},
];
const fields=['camps','oilFields','campOilFields','oilFieldRelocations','initialMapBounds','finalMapBounds'];
export function installM01Layout(config){
 if(config.id!=='alpha-m01')return;
 if(!config.m01LegacyLayout)config.m01LegacyLayout=Object.fromEntries(fields.map(key=>[key,structuredClone(config[key])]));
 selectM01Layout(config,true);
}
export function selectM01Layout(config,original){
 if(!config.m01LegacyLayout||config.m01LayoutVersion===(original?3:0))return;
 for(const key of fields)config[key]=structuredClone(config.m01LegacyLayout[key]);
 config.m01LayoutVersion=original?3:0;
 if(!original)return;
 config.camps=config.camps.map((camp,i)=>({...camp,...camps[i],layoutVersion:3}));
 config.initialMapBounds=[0,0,53,63];config.finalMapBounds=[0,0,53,63];
 // Keep the established player economy. Enemy oil points follow original cam1a.
 const playerOil=config.oilFields.slice(0,2);
 config.oilFields=[...playerOil,[31.5,35.5],[37.5,16.5]];
 config.campOilFields={'nw-pocket':2,'nw-west':3};
 config.oilFieldRelocations=config.oilFieldRelocations.filter(r=>playerOil.some(([x,y])=>r.to[0]===x&&r.to[1]===y));
}
export function restoreM01Layout(mission){
 selectM01Layout(mission.config,mission.state.m01LayoutVersion===3);
 // Keep a twelve-vehicle staging column outside the fortified HQ firing range.
 if(mission.state.m01LayoutVersion===3){
  const config=mission.config.camps[3],camp=mission.state.camps.find(c=>c.id===config.id);
  if(camp)camp.approachGrid=config.approachGrid.slice();
 }
}
