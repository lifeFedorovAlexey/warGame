// Refresh measured tables only; methodology and qualifications remain reviewed prose.
import fs from 'node:fs';
const main=JSON.parse(fs.readFileSync('campaign/reports/damage-benchmark.json'));
const near=JSON.parse(fs.readFileSync('campaign/reports/damage-benchmark-all-near.json'));
const counts=[1,10,50,100,200],get=(n,on,phase)=>main.results.find(r=>r.count===n&&r.enabled===on&&r.phase===phase);
for(const n of counts)for(const on of [false,true])for(const phase of ['settled','impacts'])if(!get(n,on,phase))throw new Error('Incomplete benchmark');
if(main.errors.length||near.errors.length)throw new Error('Benchmark contains browser errors');
const path='docs/damage/performance.md';let doc=fs.readFileSync(path,'utf8');
const f=(n,d=2)=>Number.isFinite(n)?n.toFixed(d).replace('.',','):'н/д',mi=n=>f(n/1048576),pair=(a,b,d=2)=>f(a,d)+' / '+f(b,d),row=cells=>'| '+cells.join(' | ')+' |';
function table(header,rows){const start=doc.indexOf(header),end=doc.indexOf('\n\n',start);if(start<0||end<0)throw new Error('Missing report table '+header);const columns=header.split('|').length-2;doc=doc.slice(0,start)+header+'\n'+row(Array(columns).fill('---:'))+'\n'+rows.map(row).join('\n')+doc.slice(end);}
doc=doc.replace(/Основной прогон: `[^`]+`/, 'Основной прогон: `'+main.environment.date+'`');
table('| Машин | FPS off / on | CPU, мс off / on | GPU, мс off / on | Draw calls off / on | Геометрия: обновлений on |',counts.map(n=>{const a=get(n,false,'impacts'),b=get(n,true,'impacts');return [n,pair(a.fps,b.fps),pair(a.cpuFrameMs.mean,b.cpuFrameMs.mean),pair(a.gpuFrameMs?.mean,b.gpuFrameMs?.mean),pair(a.drawCalls.mean,b.drawCalls.mean,0),b.damage.geometryUpdates];}));
table('| Машин | CPU p95 / max on, мс | GPU p95 / max on, мс | Контактов за 6 с | Поиск контакта, мс/попадание | Всё состояние / решётка, мс за фазу |',counts.map(n=>{const r=get(n,true,'impacts');return [n,pair(r.cpuFrameMs.p95,r.cpuFrameMs.max),pair(r.gpuFrameMs?.p95,r.gpuFrameMs?.max),r.damage.hitCount,f(r.damage.hitCpuMs/r.damage.hitCount,4),pair(r.damage.hitStateCpuMs,r.damage.deformationCpuMs)];}));
table('| Машин | CPU, мс off / on | GPU, мс off / on | FPS on | Треугольников сцены on |',counts.map(n=>{const a=get(n,false,'settled'),b=get(n,true,'settled');return [n,pair(a.cpuFrameMs.mean,b.cpuFrameMs.mean),pair(a.gpuFrameMs?.mean,b.gpuFrameMs?.mean),f(b.fps),Math.round(b.triangles.mean)];}));
table('| Машин | JS heap off / on | Private RAM off / on | Dedicated GPU off / on |',counts.map(n=>{const a=get(n,false,'impacts'),b=get(n,true,'impacts');return [n,mi(a.jsHeap?.used)+' / '+mi(b.jsHeap?.used),mi(a.processMemory.privateBytes)+' / '+mi(b.processMemory.privateBytes),mi(a.processMemory.dedicatedGpuBytes)+' / '+mi(b.processMemory.dedicatedGpuBytes)];}));
const r200=get(200,true,'impacts');
doc=doc.replace(/На 200 машинах остаётся пик CPU [\d,.]+ мс/, 'На 200 машинах остаётся пик CPU '+f(r200.cpuFrameMs.max,1)+' мс');
doc=doc.replace(/В финальном прогоне \d+ контактов заняли [\d,.]+ мс\./,'В финальном прогоне '+r200.damage.hitCount+' контактов заняли '+f(r200.damage.hitCpuMs,1)+' мс.');
const nearSection=[
  '## Дополнительный стресс: 200 машин в LOD0',
  '',
  'Прогон '+near.environment.date+'. Тот же охват камеры, но всем 200 машинам принудительно назначен самый подробный меш и все 24 слота отметин. Это искусственный стресс качества представления, не физически возможное размещение 200 машин вплотную к камере. Все объекты действительно рисуются; сырой результат: [all-near.json](measurements/all-near.json).',
  '',
  row(['Режим','Фаза','FPS','CPU mean / max, мс','GPU mean, мс','Draw calls','VRAM, MiB']),
  row(Array(7).fill('---:')),
  ...near.results.map(r=>row([r.enabled?'on':'off',r.phase,f(r.fps),pair(r.cpuFrameMs.mean,r.cpuFrameMs.max),f(r.gpuFrameMs?.mean),f(r.drawCalls.mean,0),mi(r.processMemory.dedicatedGpuBytes)])),
  '',
  'Этот стресс обнаружил ещё один дефект: единый диапазон деформации слишком сильно расширял BVH после ударов с разных сторон. До исправления было 34,00 FPS и 17,34 мс среднего CPU ([исходный результат](measurements/all-near-before-bvh.json)). Теперь каждый узел BVH использует только контрольные точки, влияющие на его собственный объём. Консервативность проверена сравнением с полным перебором деформированного меша после серии разнонаправленных ударов.',
  '',
  'Одновременно исправлена ошибка сценария: сторона удара раньше зависела от чётности номера кадра и при 60 FPS могла повторяться. Теперь она зависит от номера пачки. Ранние JSON сохраняются как история поиска дефектов; их не следует считать строгим A/B одной и той же последовательности воздействий. Основная таблица выше уже использует исправленное чередование.',
  '',
].join('\n');
const old=doc.indexOf('## Дополнительный стресс:');if(old>=0){const end=doc.indexOf('## Физические объекты',old);doc=doc.slice(0,old)+nearSection+'\n'+doc.slice(end);}else doc=doc.replace('## Физические объекты',nearSection+'\n## Физические объекты');
fs.writeFileSync(path,doc);
fs.mkdirSync('docs/damage/measurements',{recursive:true});
for(const [input,output] of [['damage-benchmark.json','damage-benchmark.json'],['damage-benchmark-all-near.json','all-near.json'],['damage-benchmark-all-near-before-bvh.json','all-near-before-bvh.json']])fs.copyFileSync('campaign/reports/'+input,'docs/damage/measurements/'+output);
console.log(JSON.stringify({report:path,mainDate:main.environment.date,nearDate:near.environment.date}));
