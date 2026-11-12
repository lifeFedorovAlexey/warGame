export function m03TerrainSight(field,observer,x,y){
 const length=Math.hypot(x-observer.x,y-observer.y),steps=Math.ceil(length/16),from=field.heightAt(observer.x,observer.y)+12,to=field.heightAt(x,y)+5;
 for(let i=1;i<steps;i++){const t=i/steps;if(field.heightAt(observer.x+(x-observer.x)*t,observer.y+(y-observer.y)*t)>from+(to-from)*t+1)return false;}
 return true;
}
