"""Build dimension sheets, model guides and metric GLB envelopes from module.json."""
from pathlib import Path
import argparse
import html
import json
import math
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / 'references'
CLASSES = {
    'S': {'deck_length':4400,'deck_width':2000,'pad_x':650,'pad_y':1450,'pad_size':180,'ring_diameter':900,'flange_height':80},
    'M': {'deck_length':6200,'deck_width':2700,'pad_x':950,'pad_y':2250,'pad_size':240,'ring_diameter':1500,'flange_height':100},
    'L': {'deck_length':8600,'deck_width':3400,'pad_x':1200,'pad_y':3200,'pad_size':300,'ring_diameter':2100,'flange_height':120},
}

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def fmt(v):
    return f'{v:g}' if isinstance(v,(int,float)) else str(v)

def vec(v):
    return '('+', '.join(map(fmt,v))+')'

def dimensions(m):
    return [b-a for a,b in zip(m['bounds_mm']['min'],m['bounds_mm']['max'])]

def esc(v):
    return html.escape(str(v))

def svg_sheet(m, path):
    low, high = m['bounds_mm']['min'], m['bounds_mm']['max']
    w,l,h = dimensions(m)
    scale = min(640/max(w,l,1),285/max(w,l,h,1))
    out = ['<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200" viewBox="0 0 1800 1200">',
        '<defs><marker id="arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M7 0 L0 3.5 L7 7" fill="none" stroke="#263c48"/></marker></defs>',
        '<rect width="1800" height="1200" fill="#f2f0e9"/>',
        '<style>text{font-family:Segoe UI,Arial,sans-serif;fill:#263c48} .title{font-size:38px;font-weight:700}.small{font-size:20px}.label{font-size:24px}.dim{stroke:#263c48;stroke-width:1.5;fill:none;marker-start:url(#arrow);marker-end:url(#arrow)}.guide{stroke:#8f9ba0;stroke-dasharray:6 6;fill:none}</style>',
        f'<text x="60" y="65" class="title">{esc(m["id"])} {esc(m["name"])} · {esc(m["size"])}</text>',
        '<text x="60" y="105" class="small">Проектные размеры в мм · габаритные схемы, не ортографические виды готовой модели</text>']
    # Three views use exactly the same scale; +Y forward, +X right, +Z up.
    views = [('Вид сверху · X Y',0,1,80,160),('Вид сбоку · Y Z',1,2,940,160),('Вид спереди · X Z',0,2,80,660)]
    for title,ax,ay,bx,by in views:
        out.append(f'<text x="{bx}" y="{by}" class="label">{title}</text>')
        cx,cy=bx+330,by+190
        midx,midy=(low[ax]+high[ax])/2,(low[ay]+high[ay])/2
        def project(p):
            return cx+(p[ax]-midx)*scale,cy-(p[ay]-midy)*scale
        x,y=project([low[i] if i==ax else high[i] if i==ay else 0 for i in range(3)])
        rw,rh=(high[ax]-low[ax])*scale,(high[ay]-low[ay])*scale
        out.append(f'<rect x="{x:.2f}" y="{y:.2f}" width="{rw:.2f}" height="{rh:.2f}" fill="#b0b99b" fill-opacity=".55" stroke="#4f6143" stroke-width="2"/>')
        ox,oy=project([0,0,0])
        out.append(f'<path d="M{ox-12:.2f} {oy:.2f}h24 M{ox:.2f} {oy-12:.2f}v24" stroke="#bc4038" stroke-width="2"/>')
        out.append(f'<text x="{ox+14:.2f}" y="{oy+18:.2f}" class="small">O</text>')
        out.append(f'<path d="M{x:.2f} {y+rh+38:.2f}H{x+rw:.2f}" class="dim"/>')
        out.append(f'<text x="{x+rw/2:.2f}" y="{y+rh+67:.2f}" text-anchor="middle" class="small">{fmt(high[ax]-low[ax])} мм</text>')
        out.append(f'<path d="M{x-38:.2f} {y:.2f}V{y+rh:.2f}" class="dim"/>')
        out.append(f'<text x="{x-52:.2f}" y="{y+rh/2:.2f}" text-anchor="middle" transform="rotate(-90 {x-52:.2f} {y+rh/2:.2f})" class="small">{fmt(high[ay]-low[ay])} мм</text>')
        for a in m['anchors']:
            if a['name'].startswith('pad_'):
                px,py=project(a['position_mm'])
                out.append(f'<rect x="{px-4:.2f}" y="{py-4:.2f}" width="8" height="8" fill="#d38922"/>')
            elif a['name'] in ('body_mount','upper_mount','mount'):
                px,py=project(a['position_mm'])
                out.append(f'<circle cx="{px:.2f}" cy="{py:.2f}" r="6" fill="#d38922" stroke="#6d470f"/>')
                out.append(f'<text x="{px+12:.2f}" y="{py-12:.2f}" class="small">{esc(a["name"])}</text>')
        if m['category'] in ('bodies','upper-modules') and (ax,ay)==(0,1):
            a=next(a for a in m['anchors'] if a['name']==('upper_mount' if m['category']=='bodies' else 'mount'))
            px,py=project(a['position_mm'])
            rad=CLASSES[m['size']]['ring_diameter']*scale/2
            out.append(f'<circle cx="{px:.2f}" cy="{py:.2f}" r="{rad:.2f}" fill="none" stroke="#d38922" stroke-width="3"/>')
        if m['category']=='running-gear':
            deck=next(a for a in m['anchors'] if a['name']=='body_mount')['position_mm']
            c=CLASSES[m['size']]
            px,py=project([-c['deck_width']/2,c['deck_length']/2,deck[2]])
            if (ax,ay)==(0,1):
                out.append(f'<rect x="{px:.2f}" y="{py:.2f}" width="{c["deck_width"]*scale:.2f}" height="{c["deck_length"]*scale:.2f}" class="guide"/>')
            elif ay==2:
                p1=project([0,0,deck[2]])
                out.append(f'<path d="M{bx+40} {p1[1]:.2f}H{bx+650}" class="guide"/>')
    lines=[
        f'Длина Y: {fmt(l)} мм',f'Ширина X: {fmt(w)} мм',f'Высота Z: {fmt(h)} мм',
        f'Min: {vec(low)}',f'Max: {vec(high)}','Начало координат: красный крест O',
        'Оранжевый: точки крепления','+Y — вперёд, +X — вправо, +Z — вверх',
        'Габарит показан в исходном положении.',
    ]
    for a in m['anchors']:
        if not a['name'].startswith('pad_'):
            lines.append(a['name']+': '+vec(a['position_mm']))
    for i,line in enumerate(lines):
        out.append(f'<text x="940" y="{690+i*31}" class="small">{esc(line)}</text>')
    out.extend(['<text x="60" y="1160" class="small">Размеры, оси и ограничения движений: module.json. Импортируемый размерный шаблон: blockout.glb.</text>','</svg>'])
    path.write_text('\n'.join(out)+'\n',encoding='utf-8')

def to_gltf(p):
    return [p[0]/1000,p[2]/1000,-p[1]/1000]

def glb(m, path):
    lo,hi=m['bounds_mm']['min'],m['bounds_mm']['max']
    vertices=[to_gltf([x,y,z]) for z in (lo[2],hi[2]) for y in (lo[1],hi[1]) for x in (lo[0],hi[0])]
    # Double-sided envelope, not a production surface mesh.
    indices=[0,2,1,1,2,3,4,5,6,5,7,6,0,1,4,1,5,4,2,6,3,3,6,7,0,4,2,2,4,6,1,3,5,3,7,5]
    vb=struct.pack('<24f',*(c for v in vertices for c in v))
    ib=struct.pack('<36H',*indices)
    colors={'upper-modules':[0.38,0.48,0.28,.45],'bodies':[.33,.48,.62,.45],'running-gear':[.61,.43,.22,.45],'payloads':[.48,.34,.62,.45]}
    nodes=[{'name':m['id'],'children':[1],'extras':{'source':'module.json','source_axes':'X right Y forward Z up','source_units':'mm'}},
        {'name':m['id']+'_ENVELOPE_NOT_FINAL_MESH','mesh':0}]
    attached=[]
    for a in m['anchors']:
        nodes[0]['children'].append(len(nodes))
        nodes.append({'name':a['name'],'translation':to_gltf(a['position_mm']),'extras':{'role':a.get('role','attachment')}})
        if a.get('parent'): attached.append((len(nodes)-1,a['parent'],a['position_mm']))
    part_indices={}
    for part in m['moving_parts']:
        part_indices[part['name']]=len(nodes)
        nodes.append({'name':part['name'],'translation':to_gltf(part['pivot_mm']),'extras':{'motion':part}})
    for part in m['moving_parts']:
        idx=part_indices[part['name']]
        par=part.get('parent')
        if par:
            parent=next(p for p in m['moving_parts'] if p['name']==par)
            nodes[idx]['translation']=to_gltf([a-b for a,b in zip(part['pivot_mm'],parent['pivot_mm'])])
            nodes[part_indices[par]].setdefault('children',[]).append(idx)
        else:
            nodes[0]['children'].append(idx)
    for light in m['lights']:
        nodes[0]['children'].append(len(nodes))
        nodes.append({'name':light['name'],'translation':to_gltf(light['position_mm']),'extras':{'emission':light}})
        if light.get('parent'): attached.append((len(nodes)-1,light['parent'],light['position_mm']))
    for idx,par,pos in attached:
        parent=next(p for p in m['moving_parts'] if p['name']==par)
        nodes[0]['children'].remove(idx)
        nodes[part_indices[par]].setdefault('children',[]).append(idx)
        nodes[idx]['translation']=to_gltf([a-b for a,b in zip(pos,parent['pivot_mm'])])
    doc={'asset':{'version':'2.0','generator':'warGame reference_pack; metric envelope only'},
        'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,
        'buffers':[{'byteLength':len(vb)+len(ib)}],
        'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(vb),'target':34962},{'buffer':0,'byteOffset':len(vb),'byteLength':len(ib),'target':34963}],
        'accessors':[{'bufferView':0,'componentType':5126,'count':8,'type':'VEC3','min':[min(v[i] for v in vertices) for i in range(3)],'max':[max(v[i] for v in vertices) for i in range(3)]},
            {'bufferView':1,'componentType':5123,'count':36,'type':'SCALAR'}],
        'materials':[{'name':'ENVELOPE_GUIDE','pbrMetallicRoughness':{'baseColorFactor':colors[m['category']],'metallicFactor':0,'roughnessFactor':.8},'alphaMode':'BLEND','doubleSided':True}],
        'meshes':[{'primitives':[{'attributes':{'POSITION':0},'indices':1,'material':0}]}],
        'extras':{'classification':'dimensional blockout, not finished model','dimensions_mm':{'width':dimensions(m)[0],'length':dimensions(m)[1],'height':dimensions(m)[2]}}}
    jb=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8');jb+=b' '*((-len(jb))%4)
    bb=vb+ib;bb+=b'\0'*((-len(bb))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(jb)+8+len(bb))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(bb),0x004e4942)+bb)

def readme(m,path):
    w,l,h=dimensions(m)
    a=['# '+m['id']+' '+m['name'],'',m['purpose'],'',
       '![Отдельный концепт](reference.png)','',
       '## Размеры и крепления','',
       '**Размеры назначены для игры и обязательны для модели.** Концепт показывает внешний характер; численные размеры задаются здесь и в module.json, а не измеряются по пикселям.','',
       '| Параметр | Значение |','| --- | --- |',
       f'| Класс | {m["size"]} |',f'| Длина Y | {fmt(l)} мм |',f'| Ширина X | {fmt(w)} мм |',f'| Высота Z | {fmt(h)} мм |',
       f'| Min X Y Z | {vec(m["bounds_mm"]["min"])} мм |',f'| Max X Y Z | {vec(m["bounds_mm"]["max"])} мм |',
       '| Оси | +X вправо, +Y вперёд, +Z вверх |','| Масштаб | 1000 мм = 1 м; GLB хранит метры |',
       f'| Начало координат | {m["origin_description"]} |']
    for anchor in m['anchors']:
        a.append(f'| {anchor["name"]} | {vec(anchor["position_mm"])} мм; {anchor.get("role","крепление")} |')
    if m.get('folded_bounds_mm'):
        fb=m['folded_bounds_mm'];fd=[b-a for a,b in zip(fb['min'],fb['max'])]
        a.append(f'| Транспортный габарит Д × Ш × В | {fmt(fd[1])} × {fmt(fd[0])} × {fmt(fd[2])} мм |')
    if m.get('working_bounds_mm'):
        a.append(f'| Рабочая область Min X Y Z | {vec(m["working_bounds_mm"]["min"])} мм |')
        a.append(f'| Рабочая область Max X Y Z | {vec(m["working_bounds_mm"]["max"])} мм |')
        a.append('| Рабочая область | Консервативный объём для движений, не сплошной меш и не коллайдер |')
    if m['size'] in CLASSES:
        c=CLASSES[m['size']]
        if m['category'] in ('bodies','upper-modules'):
            a.extend([f'| Диаметр верхнего интерфейса | {c["ring_diameter"]} мм |',f'| Высота фланца верхнего модуля | {c["flange_height"]} мм над его нулевой плоскостью |'])
    a+=['','![Размерная схема](dimensions.svg)','',
        '[Открыть размерную заготовку GLB](blockout.glb). Это габаритный объём и пустые узлы креплений/движений; художественной геометрии и готовых анимаций в нём нет.','',
        '## Внешний вид','',m['visual'],'','## Подвижные части','',
        'Все центры ниже заданы в координатах всего модуля при исходной позе, в мм. Оси вращения заданы в локальной системе родителя. Положительное вращение — по правилу правой руки.']
    if not m['moving_parts']:
        a+=['','Корпус неподвижен. Панели, окна, экраны и посадочные кольца не анимируются. Вращение установленного верхнего модуля относится к его собственной модели.']
    else:
        a+=['','| Узел | Родитель | Центр X Y Z мм | Движение | Пределы или скорость |','| --- | --- | --- | --- | --- |']
        for p in m['moving_parts']:
            a.append(f'| {p["name"]} | {p.get("parent") or "корень модуля"} | {vec(p["pivot_mm"])} | {p["motion"]} | {p["limits"]} |')
    a+=['','## Состояния и последовательность анимаций','']
    a += [f'- **{s["name"]}:** {s["description"]}' for s in m['states']]
    a+=['','## Светящиеся элементы','',
        'Цвета указаны в sRGB HEX. Strength — условная безразмерная сила Emission для художественного материала. Это не освещённость в люменах. Отдельные источники света не добавлять, если они не перечислены.']
    if m['lights']:
        a+=['','| Материал или узел | Центр X Y Z мм | Цвет | Strength | Когда работает |','| --- | --- | --- | --- | --- |']
        for e in m['lights']:
            a.append(f'| {e["name"]} | {vec(e["position_mm"])} | {e["color"]} | {e["strength"]} | {e["behavior"]} |')
    else:
        a+=['','Собственных светящихся элементов нет. Оранжевые метки крепления — краска, не подсветка.']
    a+=['','## Зазоры и ограничения','']+[f'- {n}' for n in m['constraints']]
    if m.get('payloads'):
        a+=['','## Отдельные объекты','']
        for p in m['payloads']:
            a.append(f'- [{p["id"]}](../../payloads/{p["folder"]}/README.md): {p["count"]} экземпляров; '+p['description'])
            for socket in p['sockets']:
                a.append(f'  - {socket["name"]}: {vec(socket["position_mm"])} мм.')
    if m.get('game_assets'):
        a+=['','## Игровые модели','']
        for label,target in m['game_assets'].items():
            a.append(f'- [{label}](../../../{target})')
    if m.get('photos'):
        a+=['','## Фотографии для формы и материала','']
        a += [f'- [{p["caption"]}]({p["path"]})' for p in m['photos']]
    a+=['','## Файлы','',
        '- `reference.png` — отдельный фрагмент исходного концепта без перерисовки.',
        '- `dimensions.svg` — три вида габаритного объёма в одном масштабе, с размерами и центрами креплений.',
        '- `module.json` — источник размеров, узлов, состояний и подсветки.',
        '- `blockout.glb` — размерный шаблон для импорта в 3D-редактор.','',
        '[Единый стандарт размеров](../../standards.md) · [Каталог](../../../README.md)','']
    path.write_text('\n'.join(a),encoding='utf-8')

def check(modules):
    ids={m['id']:m for m in modules}
    assert len(ids)==46
    assert {k[0]:sum(m['id'].startswith(k[0]) for m in modules) for k in ('U','B','C','D')}=={'U':24,'B':10,'C':10,'D':2}
    for m in modules:
        lo,hi=m['bounds_mm']['min'],m['bounds_mm']['max']
        assert all(a<b for a,b in zip(lo,hi)),m['id']
        assert lo[2]==0,m['id']
        names=[p['name'] for p in m['moving_parts']]
        assert len(set(names))==len(names),m['id']
        for p in m['moving_parts']:
            if p.get('parent'):
                assert p['parent'] in names,(m['id'],p)
                seen={p['name']};par=p['parent']
                while par:
                    assert par not in seen,(m['id'],'cycle')
                    seen.add(par);par=next(i for i in m['moving_parts'] if i['name']==par).get('parent')
        c=CLASSES.get(m['size'])
        if m['category']=='bodies':
            w,l,h=dimensions(m)
            footprint=m.get('mount_footprint_mm',{'width':w,'length':l})
            assert footprint['width']<=c['deck_width'] and footprint['length']<=c['deck_length'],m['id']
            assert next(a for a in m['anchors'] if a['name']=='upper_mount')['position_mm'][2]==hi[2]
            for a in m['anchors']:
                assert all(lo[i]<=a['position_mm'][i]<=hi[i] for i in range(3)),(m['id'],a)
        if m['category']=='upper-modules':
            assert next(a for a in m['anchors'] if a['name']=='mount')['position_mm']==[0,0,0]
            assert dimensions(m)[0]>=c['ring_diameter'],m['id']
        for p in m.get('payloads',[]):
            child=ids[p['id']]
            box=child.get('folded_bounds_mm',child['bounds_mm'])
            assert len(p['sockets'])==p['count']
            for s in p['sockets']:
                for axis in range(3):
                    assert lo[axis]<=s['position_mm'][axis]+box['min'][axis]
                    assert s['position_mm'][axis]+box['max'][axis]<=hi[axis],(m['id'],p['id'],axis)
    pairs=0;triples=0
    for c in [m for m in modules if m['category']=='running-gear']:
        for b in [m for m in modules if m['category']=='bodies' and m['size']==c['size']]:
            bc={a['name']:a['position_mm'] for a in b['anchors']}
            cc={a['name']:a['position_mm'] for a in c['anchors']}
            for n in ('pad_FL','pad_FR','pad_RL','pad_RR'):
                assert [bc[n][i]+cc['body_mount'][i] for i in range(3)]==cc[n],(c['id'],b['id'],n)
            pairs+=1
            for u in [m for m in modules if m['category']=='upper-modules' and m['size']==b['size']]:
                assert b['bounds_mm']['max'][2]+u['bounds_mm']['min'][2]==bc['upper_mount'][2]
                triples+=1
    for m in modules:
        d=REF/m['category']/m['folder']
        for filename in ('README.md','reference.png','dimensions.svg','module.json','blockout.glb'):
            assert (d/filename).is_file(),(m['id'],filename)
        raw=(d/'blockout.glb').read_bytes()
        magic,version,length=struct.unpack_from('<III',raw)
        assert magic==0x46546c67 and version==2 and length==len(raw)
        jl,jt=struct.unpack_from('<II',raw,12)
        assert jt==0x4e4f534a
        obj=json.loads(raw[20:20+jl])
        assert obj['accessors'][0]['count']==8
        bl,bt=struct.unpack_from('<II',raw,20+jl)
        assert bt==0x004e4942 and bl==obj['buffers'][0]['byteLength']
        vertices=struct.unpack_from('<24f',raw,28+jl)
        assert all(math.isfinite(v) for v in vertices)
        bb=[[min(vertices[a::3]),max(vertices[a::3])] for a in range(3)]
        expected=[to_gltf(m['bounds_mm']['min']),to_gltf(m['bounds_mm']['max'])]
        for a in range(3):
            assert abs(bb[a][0]-min(v[a] for v in expected))<1e-5
            assert abs(bb[a][1]-max(v[a] for v in expected))<1e-5
    print(f'Checked {len(modules)} modules, {pairs} chassis/body interfaces, {triples} class-compatible assemblies; GLB dimensions valid.')
    return {'modules':len(modules),'chassis_body_pairs':pairs,'class_compatible_assemblies':triples,'scope':'socket coordinates, bounds, payload storage, hierarchy, GLB binary and units; not production mesh collision or animation clearance'}

def main():
    args=argparse.ArgumentParser();args.add_argument('--check',action='store_true');opts=args.parse_args()
    modules=[json.loads(p.read_text(encoding='utf-8')) for p in sorted(REF.glob('*/*/module.json'))]
    if not opts.check:
        for m in modules:
            d=REF/m['category']/m['folder']
            svg_sheet(m,d/'dimensions.svg');glb(m,d/'blockout.glb');readme(m,d/'README.md')
    result=check(modules)
    dump(REF/'validation.json',result)

if __name__=='__main__':
    main()
