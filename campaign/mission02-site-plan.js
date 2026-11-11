export function m02SiteObstacles(){
 // These furnishings were neither entities nor damageable: hp:1 only made
 // their invisible navigation boxes permanent. Do not draw or register them.
 // Camp equipment must belong to a destructible entity; decoration never
 // creates an independent solid. Existing saves therefore lose these blocks.
 return [];
}
