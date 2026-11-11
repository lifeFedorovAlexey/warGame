// Approved squared compounds. Reuse the existing power-station mesh at a
// uniform scale; these dimensions also govern navigation and damage bounds.
export const M02_STATION_SCALE=2;
const positions={
 'm02.original.42':{grid:[35.5,76]},
 'm02.east_factory.scav-factory0':{grid:[33,75.8]},
 'm02.original.53':{grid:[36.2,74.3]},
 'm02.original.54':{grid:[36.2,78.5]},
 'm02.original.56':{grid:[31,74.3]},
 'm02.original.3475':{grid:[18.8,70.6]},
 'm02.energy_hub.generator1':{grid:[24.5,108.8],scale:M02_STATION_SCALE},
 'm02.energy_hub.scav-factory0':{grid:[23.7,105.8]},
 'm02.original.61':{kind:'scav-store',grid:[25,103.3]},
 'm02.original.961':{grid:[22.3,103.5]},
 'm02.original.1018':{grid:[35.5,106.2]},
 'm02.original.933':{grid:[28.3,110]},
};
export function m02StructurePlan(item,config){
 const change=positions[item.id];if(!change)return item;
 const kind=change.kind??item.kind,spec=config.buildings[kind],scale=(change.scale??1)*config.worldScale;
 return {...item,...change,kind,halfWidth:spec.footprintMetres[0]*scale/2,halfDepth:spec.footprintMetres[1]*scale/2};
}
