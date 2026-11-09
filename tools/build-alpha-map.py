"""Decode the supplied 16-bit PNG losslessly and build a driveable Alpha route.

Only Python's standard library is needed. Terrain samples are never smoothed or carved.
"""
from pathlib import Path
import collections
import hashlib
import heapq
import json
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'references/terrain/alpha/heightmap-128-16bit.png'
OUT = ROOT / 'assets/maps/alpha'
CELL = 32.0
HEIGHT_UNIT = 0.30


def decode_heightmap(path):
    data = path.read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Not a PNG')
    offset, compressed = 8, bytearray()
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        if kind == b'IHDR':
            width, height, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', payload)
            if (depth, color, interlace) != (16, 0, 0):
                raise ValueError('Expected noninterlaced 16-bit grayscale')
        if kind == b'IDAT':
            compressed.extend(payload)
        offset += length + 12
    raw = zlib.decompress(compressed)
    stride, previous, values = width * 2, bytearray(width * 2), []
    for row in range(height):
        filter_type = raw[row * (stride + 1)]
        pixels = bytearray(raw[row * (stride + 1) + 1:(row + 1) * (stride + 1)])
        for i in range(stride):
            left = pixels[i - 2] if i >= 2 else 0
            above, corner = previous[i], previous[i - 2] if i >= 2 else 0
            if filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = above
            elif filter_type == 3:
                predictor = (left + above) // 2
            elif filter_type == 4:
                p = left + above - corner
                distances = [abs(p - left), abs(p - above), abs(p - corner)]
                predictor = [left, above, corner][distances.index(min(distances))]
            elif filter_type == 0:
                predictor = 0
            else:
                raise ValueError('Unknown PNG filter')
            pixels[i] = (pixels[i] + predictor) & 255
        values.extend(struct.unpack('>' + str(width) + 'H', pixels))
        previous = pixels
    return width, height, values


def main():
    size, height, raw = decode_heightmap(SOURCE)
    assert size == height == 128
    assert all(v % 257 == 0 for v in raw)
    samples = [v // 257 for v in raw]
    def node_height(x,y):
        return samples[y*size+x]*HEIGHT_UNIT
    def elevation(p):
        x,y=p
        return (node_height(x+1,y)+node_height(x,y+1))/2
    def cell_gradient(p):
        x,y=p
        a,b,c,d=[node_height(px,py) for px,py in ((x,y),(x+1,y),(x,y+1),(x+1,y+1))]
        return max(math.hypot(b-a,c-a),math.hypot(d-c,d-b))/CELL
    gradients={(x,y):cell_gradient((x,y)) for y in range(2,size-3) for x in range(2,size-3)}
    walkable={p for p,g in gradients.items() if g<=.30}
    def neighbors(p, limit=.30):
        x, y = p
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,1),(1,-1),(-1,-1)):
            q = x + dx, y + dy
            if q not in walkable:
                continue
            distance = CELL * math.hypot(dx, dy)
            slope = abs(elevation(q) - elevation(p)) / distance
            if slope > limit:
                continue
            # No diagonals through a cliff corner.
            if dx and dy and any(r not in walkable for r in ((x+dx,y),(x,y+dy))):
                continue
            yield q, distance, slope
    start = (13, 52)
    reached, queue = {start}, collections.deque([start])
    while queue:
        for q, _, _ in neighbors(queue.popleft()):
            if q not in reached:
                reached.add(q)
                queue.append(q)
    def astar(a,b):
        frontier=[(0,a)];cost={a:0};previous={}
        while frontier:
            _,p=heapq.heappop(frontier)
            if p==b:
                path=[b]
                while path[-1]!=a:path.append(previous[path[-1]])
                return list(reversed(path))
            for q,distance,slope in neighbors(p):
                new_cost=cost[p]+distance*(1+6*slope*slope+2*gradients[q]**2)
                if new_cost<cost.get(q,math.inf):
                    cost[q]=new_cost;previous[q]=p
                    heapq.heappush(frontier,(new_cost+CELL*math.dist(q,b),q))
        raise RuntimeError('No route between waypoints')
    desired=[('base-west','Западная база',(13,52),(0,5)),('south-west','Юго-западная низина',(22,96),(0,10)),('south-pass','Южный проход',(64,104),(0,15)),('east-valley','Восточная долина',(113,102),(0,15)),('east-gate','Восточный проход',(112,55),(0,15)),('upper-plateau','Верхнее плато',(102,34),(55,65)),('north-ramp','Северный спуск',(104,29),(28,38)),('central-plateau','Среднее плато',(84,81),(28,38))]
    stops=[]
    for ident,name,p,band in desired:
        candidates=[q for q in reached if band[0]<=elevation(q)<=band[1] and sum(1 for _ in neighbors(q))>=5]
        q=min(candidates,key=lambda q:math.dist(p,q)+gradients[q]*2)
        stops.append({'id':ident,'name':name,'grid':[q[0]+.5,q[1]+.5],'heightMetres':round(elevation(q),3)})
    route=[]
    for i,stop in enumerate(stops):
        a=tuple(int(v) for v in stop['grid']);b=tuple(int(v) for v in stops[(i+1)%len(stops)]['grid'])
        segment=astar(a,b)
        stop['routePointIndex']=len(route)
        route.extend([[p[0]+.5,p[1]+.5] for p in segment[:-1]])
    # Give turnarounds an actual loop through adjacent driveable cells.
    turnarounds=0
    for i in range(len(route)-1,-1,-1):
        a,b,c=route[(i-1)%len(route)],route[i],route[(i+1)%len(route)]
        if a!=c:continue
        dx,dy=b[0]-a[0],b[1]-a[1]
        for px,py in ((-dy,dx),(dy,-dx)):
            extra=[[b[0]+px,b[1]+py],[a[0]+px,a[1]+py]]
            if all(tuple(int(v) for v in p) in walkable for p in extra):
                route[i+1:i+1]=extra;turnarounds+=1;break
        else:raise RuntimeError('No safe turnaround at '+str(b))
    # A larger RTS vehicle needs broad corners. Split 135-degree changes into
    # cardinal steps so circular fillets can keep a radius of at least 15 m.
    def turn(a,b,c):
        u=(b[0]-a[0],b[1]-a[1]);v=(c[0]-b[0],c[1]-b[1])
        return abs(math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]))
    for _ in range(100):
        changed=False
        for i in range(len(route)):
            a,b,c=route[(i-1)%len(route)],route[i],route[(i+1)%len(route)]
            if turn(a,b,c)<=math.pi/2+.01:continue
            options=[]
            dx,dy=c[0]-b[0],c[1]-b[1]
            if dx and dy:options.extend((i+1,[b[0]+px,b[1]+py]) for px,py in ((dx,0),(0,dy)))
            dx,dy=b[0]-a[0],b[1]-a[1]
            if dx and dy:options.extend((i,[a[0]+px,a[1]+py]) for px,py in ((dx,0),(0,dy)))
            for index,q in options:
                if tuple(int(v) for v in q) not in walkable:continue
                local=[a,b,q,c] if index==i+1 else [a,q,b,c]
                if all(turn(*local[j:j+3])<=math.pi/2+.01 for j in range(2)):
                    route.insert(index,q);changed=True;break
            if not changed:raise RuntimeError('No broad corner at '+str(b))
            break
        if not changed:break
    else:raise RuntimeError('Corner repair did not converge')
    for stop in stops:stop['routePointIndex']=route.index(stop['grid'])
    length=sum(math.dist(a,b)*CELL for a,b in zip(route,route[1:]+route[:1]))
    print(json.dumps({'reachable':len(reached),'routeLengthMetres':round(length),'turnarounds':turnarounds,'stops':stops},ensure_ascii=False,indent=2))
    OUT.mkdir(parents=True, exist_ok=True)
    height_path=OUT/'heightfield.json'
    # Level boundaries and crossings are authored gameplay data. Rebuilding
    # the visual heightfield must not erase or regenerate that topology.
    authored=json.loads(height_path.read_text(encoding='utf-8')) if height_path.exists() else {}
    navigation=authored.get('navigation')
    height_data={'id':'alpha','size':size,'cellMetres':CELL,'heightUnitMetres':HEIGHT_UNIT,'extentMetres':(size-1)*CELL,'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'samples':samples}
    if navigation:
        if navigation['size']*navigation['cellMetres']!=height_data['extentMetres']:
            raise ValueError('Authored navigation extent differs from rebuilt map')
        height_data['navigation']=navigation
    if authored.get('terrainProfiles'):
        height_data['terrainProfiles']=authored['terrainProfiles']
    if authored.get('preparedPads'):
        height_data['preparedPads']=authored['preparedPads']
    height_path.write_text(json.dumps(height_data,separators=(',',':'))+'\n',encoding='utf-8')
    (OUT/'route.json').write_text(json.dumps({'closed':True,'planner':'A* on navigable terrain cells; no diagonal cliff cutting','maxCellGradient':.30,'rawLengthMetres':round(length,3),'pointsGrid':route,'stops':stops,'baseFootprint':{'gridCenter':[14,53.5],'widthMetres':400,'depthMetres':256}},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')


if __name__ == '__main__':
    main()
