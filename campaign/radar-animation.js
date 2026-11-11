// Simulation time makes scanning pause with the game and survive save/load.
export function radarAngle(entity,time){
 const at=entity.hp>0?time:(entity.destroyedAt??time);
 return (at*Math.PI/6)% (Math.PI*2); // one full scan in twelve seconds
}
