"""Read gameplay JSONL only: no simulation, commands, or generated test cases."""
import argparse
import collections
import json
import math
from pathlib import Path


def summarize(path):
    rows = []
    previous = path.with_name(path.stem + '.previous.jsonl')
    sources = ([previous] if previous.exists() else []) + [path]
    for source in sources:
        for line in source.read_text(encoding='utf-8').splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                pass  # The collector may still be writing its final line.
    events = [row['event'] for row in rows]
    heartbeats = [event for event in events if event['type'] == 'heartbeat']
    units = [event for event in events if event['type'] == 'units']
    jobs = [event for event in events if event['type'] == 'traffic-job']
    inputs = [event for event in events if event['type'] == 'input']
    latest = heartbeats[-1] if heartbeats else {}
    starts = {}
    passages = []
    for event in events:
        if event['type'] != 'game-event':
            continue
        data = event.get('data', {})
        if event['name'] == 'navigation-joint-started':
            starts[data['token']] = event
        elif event['name'] == 'navigation-joint-finished':
            start = starts.get(data['token'])
            before = {u['id']: u for u in start['data']['members']} if start else {}
            passages.append({'token': data['token'], 'sequence': event['sequence'],
                'fromSim': start['sim'] if start else None, 'toSim': event['sim'],
                'complete': data['complete'], 'members': [{
                    'id': u['id'], 'displacement': round(math.hypot(
                        u['pose']['x'] - before[u['id']]['pose']['x'],
                        u['pose']['y'] - before[u['id']]['pose']['y']), 3),
                    'revisionUnchanged': u.get('revision') == before[u['id']].get('revision'),
                    'hpChange': round(u['hp'] - before[u['id']]['hp'], 3)
                } for u in data['members'] if u['id'] in before]})
    worst = {}
    for event in units:
        for unit in event['units']:
            wait = unit.get('navigation', {}).get('wait', 0)
            if wait > worst.get(unit['id'], {}).get('wait', 2):
                worst[unit['id']] = {'id': unit['id'], 'wait': wait,
                    'sim': event['sim'], 'sequence': event['sequence'], 'revision': unit.get('revision'),
                    'reason': unit['navigation']['reason'], 'movementWindow': unit.get('movementWindow')}
    # A successful manoeuvre is separate evidence from eventual arrival.
    # A new order ends comparison with the earlier requested destination.
    latest_units = {u['id']: u for u in units[-1]['units']} if units else {}
    for row in worst.values():
        current = latest_units.get(row['id'], {})
        row['latest'] = {'state': current.get('navigation', {}).get('state'),
            'wait': current.get('navigation', {}).get('wait'), 'revision': current.get('revision'),
            'sameOrder': current.get('revision') == row['revision']}
        row['subsequentInputSequences'] = [e['sequence'] for e in inputs if e['sim'] > row['sim']
            and e.get('args') and isinstance(e['args'][0], list) and row['id'] in e['args'][0]]
    contacts = [e for e in events if e['type'] == 'physical-contact']
    overlaps = [e for e in events if e['type'] == 'near-contact' and e.get('physicalGap', 0) < 0]
    return {
        'source': str(path.resolve()), 'session': rows[-1]['session'] if rows else None,
        'build': next((e.get('build') for e in events if e['type'] == 'session-start'), None),
        'lastReceived': rows[-1]['received'] if rows else None,
        'sequenceRange': [events[0]['sequence'], events[-1]['sequence']] if events else [],
        'simRange': [units[0]['sim'], units[-1]['sim']] if units else [],
        'eventCounts': dict(collections.Counter(e['type'] for e in events)),
        'dropped': latest.get('dropped'), 'latestUi': latest.get('ui'),
        'planner': latest.get('recoveryPlanner'), 'pendingJobs': latest.get('recoveryJobs'),
        'frameMaximaMs': {key: max((h.get(key, 0) or 0 for h in heartbeats), default=0)
            for key in ['maxAdvanceMs', 'maxTickMs', 'maxFrameGapMs']},
        'currentStops': [{key: unit.get(key) for key in ['id', 'x', 'y', 'revision', 'navigation', 'movementWindow']}
            for unit in latest_units.values() if unit.get('navigation', {}).get('wait', 0) > 2],
        'worstWaits': sorted(worst.values(), key=lambda row: row['wait'], reverse=True),
        'jointPassages': passages,
        'stationaryReservationChanges': [e for e in jobs if any(c.get('reservationChanged') and not c.get('poseChanged')
            for c in e.get('changes', []))],
        'changedRequests': [e for e in jobs if e.get('reason') in ['request-changed', 'dependencies-changed']
            and e.get('requestKey') != e.get('previousRequestKey')],
        'jobOutcomes': [e for e in jobs if e['event'] in ['failed', 'cancelled', 'applied', 'route-failed', 'route-cancelled', 'route-applied']],
        'slowNext': [e for e in jobs if e['event'] == 'slow-next'],
        'errors': [e for e in events if e['type'] == 'error'],
        'physicalContactEvents': len(contacts), 'observedNegativePhysicalGaps': len(overlaps),
        'coverageLimits': ['Proximity samples cover selected vehicles, not every vehicle pair.',
            'Movement outside a job requires its recorded dependency region to prove independence.',
            'An absent event is not proof of absence if telemetry was dropped or logs rotated.',
            'No synthetic scenarios or gameplay tests were run.']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', nargs='?', type=Path)
    parser.add_argument('--out', type=Path)
    parser.add_argument('--focus', help='Comma-separated IDs of the stuck vehicles being followed')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / 'campaign/reports/live-navigation'
    source = args.source or max(root.glob('*.jsonl'), key=lambda path: path.stat().st_mtime)
    report = summarize(source)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    compact = {key: report[key] for key in ['source', 'build', 'simRange', 'planner', 'currentStops', 'errors',
        'physicalContactEvents', 'observedNegativePhysicalGaps', 'dropped']}
    if args.focus:
        focus = set(args.focus.split(','))
        compact['currentStops'] = [row for row in report['currentStops'] if row['id'] in focus]
        compact['recentOutcomes'] = [event for event in report['jobOutcomes'] if focus.intersection(event['ids'])][-6:]
        compact.pop('planner', None)
    print(json.dumps(compact, ensure_ascii=False, indent=2))
