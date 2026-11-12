// Only explicitly authored replacements belong to an upgrade line. Damage,
// price or slot alone cannot turn a cannon, flamer or sensor into a machinegun.
function upgradeDistance(config,from,to){
 const seen=new Set();let steps=0;
 while(to&&!seen.has(to)){
  if(to===from)return steps;
  seen.add(to);to=config.vehicleComponents?.[to]?.upgrades;steps++;
 }
 return -1;
}
export const unlockedVehicleRecipes=m=>m.vehicleRecipes.filter(({spec})=>!spec.requires||m.state.research[spec.requires]);
export function vehicleUpgrade(m,components,recipes=unlockedVehicleRecipes(m)){
 if(!Array.isArray(components)||components.length!==3)return null;
 let best=null,steps=0;
 for(const recipe of recipes){
  const distances=components.map((id,i)=>upgradeDistance(m.config,id,recipe.components[i]));
  if(distances.some(d=>d<0))continue;
  const total=distances.reduce((sum,d)=>sum+d,0);
  if(total>steps){best=recipe;steps=total;}
 }
 return best;
}
export function currentVehicleRecipes(m){
 const recipes=unlockedVehicleRecipes(m);
 return recipes.filter(recipe=>!vehicleUpgrade(m,recipe.components,recipes));
}
export function hasVehicleUpgrades(m){
 const recipes=unlockedVehicleRecipes(m);
 return m.vehicleRecipes.some(recipe=>vehicleUpgrade(m,recipe.components,recipes));
}
