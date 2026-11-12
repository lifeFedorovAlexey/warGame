// Campaign Alpha's authored surface colours, shared with the texture baker.
export const alphaTerrainPalette=[
 [166,124,76],[186,153,109],[142,95,64],[132,112,84],
 [80,77,66],[103,91,73],[57,58,54],[139,134,119],
 [177,141,94],[132,101,67],[149,119,80],[173,150,110],
];

// Match the Alpha macro bake: blend in linear light; asphalt is a separate
// shader layer, and concrete retains its own authored brightness.
export function alphaMacroColor(weights){
 const color=[0,0,0];let total=0;
 for(let i=0;i<12;i++){
  if(i===6||i===7)continue;
  total+=weights[i];
  for(let k=0;k<3;k++)color[k]+=Math.pow(alphaTerrainPalette[i][k]/255,2.2)*weights[i];
 }
 return color.map((value,k)=>Math.round(Math.pow(Math.max(0,value/Math.max(.001,total)*(1-weights[7])+Math.pow(alphaTerrainPalette[7][k]/255,2.2)*.87*weights[7]),1/2.2)*255));
}
