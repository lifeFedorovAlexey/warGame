// Minimum-cost matching, rows <= columns. Stable tie order keeps repeated
// formation requests from shuffling equivalent slots. No renderer state.
export function assignFormation(costs){
  const steps=assignFormationSteps(costs);let result;do{result=steps.next();}while(!result.done);return result.value;
}
// Same stable matching, resumable for combat-position batches. Callers that
// need an atomic synchronous result retain assignFormation above.
export function* assignFormationSteps(costs){
  const n=costs.length,m=costs[0]?.length??0;
  if(!n)return [];
  if(n>m)throw new Error('Formation needs a slot or reserve column for each unit');
  const u=new Float64Array(n+1),v=new Float64Array(m+1),p=new Int32Array(m+1),way=new Int32Array(m+1);
  let work=0;
  for(let i=1;i<=n;i++){
    p[0]=i;let column=0;
    const minimum=new Float64Array(m+1).fill(Infinity),used=new Uint8Array(m+1);
    do{
      used[column]=1;const row=p[column];let delta=Infinity,next=0;
      for(let j=1;j<=m;j++)if(!used[j]){
        if(++work%512===0)yield;
        const value=costs[row-1][j-1]-u[row]-v[j];
        if(value<minimum[j]){minimum[j]=value;way[j]=column;}
        if(minimum[j]<delta){delta=minimum[j];next=j;}
      }
      for(let j=0;j<=m;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else minimum[j]-=delta;
      column=next;
    }while(p[column]);
    do{const previous=way[column];p[column]=p[previous];column=previous;}while(column);
  }
  const assigned=Array(n).fill(-1);for(let j=1;j<=m;j++)if(p[j])assigned[p[j]-1]=j-1;
  return assigned;
}
