// Authored in metres, shared by rendering, grounding and collision.
export const SCAV_PROFILES = {
  'scav-zaporozhets': {track:.72,front:1.12,rear:-1.18,wheel:.29,height:1.9,boxes:[[.87,0,1.94,.42,.36],[.78,-.12,1.12,1.02,.50]],bounds:{min:[-1,-2.1,0],max:[1,2.1,2.2]}},
  'scav-firetruck': {track:1.10,front:2.12,rear:-2.04,wheel:.52,height:3.35,boxes:[[1.30,0,3.75,.67,.55],[1.19,-.12,3.53,1.94,1.13]],bounds:{min:[-1.4,-4,0],max:[1.4,4,3.6]}},
  'scav-bus': {track:1.08,front:2.10,rear:-2.10,wheel:.49,height:3.3,boxes:[[1.40,-.05,3.80,.61,.51],[1.18,-.36,3.30,1.92,1.10]],bounds:{min:[-1.5,-4,0],max:[1.5,4,3.4]}},
  'scav-rifleman': {infantry:true,track:.18,front:.16,rear:-.16,height:1.9,boxes:[[.32,0,.26,.87,.87]],bounds:{min:[-.6,-.45,0],max:[.6,1.1,2]}},
  'scav-grenadier': {infantry:true,track:.18,front:.16,rear:-.16,height:1.9,boxes:[[.34,0,.29,.87,.87]],bounds:{min:[-.7,-.5,0],max:[.7,1.1,2]}},
};
export const isInfantry = unit => !!SCAV_PROFILES[typeof unit==='string'?unit:unit.kind]?.infantry;
export const SCAV_ROSTERS={
  'nw-pocket':['scav-zaporozhets','scav-rifleman','scav-grenadier'],
  'nw-west':['scav-bus','raider','scav-rifleman','scav-grenadier'],
  'nw-east':['scav-firetruck','scav-zaporozhets','scav-rifleman','scav-grenadier'],
  'west-south':['scav-bus','scav-firetruck','scav-zaporozhets','raider','scav-rifleman','scav-grenadier'],
};
