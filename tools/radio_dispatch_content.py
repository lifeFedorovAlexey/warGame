"""Approved WG-063 kill reports and timely state notifications, revision 1."""
from copy import deepcopy

NOTIFICATIONS = {
    'construction.complete': 84, 'research.complete': 84,
    'factory.vehicle_complete': 82, 'factory.modernization_complete': 83,
    'repair.complete': 81, 'repair.mobility_restored': 81,
    'construction.refused': 80, 'construction.cancelled': 80,
}
ACK_RULES = {'command.move', 'command.attack', 'command.attack_move', 'command.build', 'command.stop'}
DISPATCH_RULES = {*NOTIFICATIONS, 'combat.target_destroyed',
                  'combat.kill_confirmed', 'combat.kill_banter', *ACK_RULES}


def apply_dispatch_content(library):
    if library['settings'].get('dispatchRevision', 0) >= 1:
        return library
    rules = {r['id']: r for r in library['rules']}
    phrases = library['phrases']
    for key, priority in NOTIFICATIONS.items():
        rules[key].update(delivery='notification', priority=priority,
                          windowSimSeconds=.5, cooldown=0)

    def graph(key, text, requires=None, emotion='relieved', affected=False, humor=False):
        phrases[key] = dict(id=key, text=text, role='driver', kind='dry_joke' if humor else 'report',
                            source='tts', audio=None, portrait=None, voiceId=None,
                            pauseAfter=.18, archived=False, emotion=emotion, identify=False)
        g = dict(id=key, weight=1, nodes=[dict(phraseId=key, affectedSpeaker=affected)])
        if requires: g['requires'] = requires
        if humor: g['humor'] = True
        return g

    base = deepcopy(rules['combat.target_destroyed'])
    reaction = deepcopy(base)
    reaction.update(id='combat.kill_confirmed', eventType='combat.kill_confirmed',
                    title='Подбитая цель: короткое подтверждение', delivery='reaction',
                    priority=86, windowSimSeconds=0, cooldown=0, expiresAfter=8,
                    preconditions={'all': []},
                    tiers=[dict(id='single', min=1, graphs=[]), dict(id='group', min=2, graphs=[])])
    first = {'field': 'facts.followup', 'op': 'eq', 'value': False}
    later = {'field': 'facts.followup', 'op': 'eq', 'value': True}
    for i, (text, condition) in enumerate([
        ('Есть! Готов!', first), ('У меня минус один!', first),
        ('Ещё один!', later), ('И этот готов!', later),
    ]):
        reaction['tiers'][0]['graphs'].append(graph('combat.kill_confirmed.single.v'+str(i+1), text, condition, affected=True))
    reaction['tiers'][1]['graphs'] = [graph('combat.kill_confirmed.group.count',
        'У меня минус {facts.killCountWord}!', affected=True)]
    summary = rules['combat.target_destroyed']
    for tier in summary['tiers']:
        for g in tier['graphs']:
            for n in g['nodes']: phrases[n['phraseId']]['archived'] = True
    summary.update(title='Итог боя: состав подбитых целей', delivery='summary', cooldown=0,
                   preconditions={'all': [
                       {'field': 'uniqueTargetCount', 'op': 'gte', 'value': 2},
                       {'field': 'facts.destroyedComposition', 'op': 'known'},
                   ]}, tiers=[dict(id='group', min=2, graphs=[graph(
                       'combat.target_destroyed.summary.v1', 'Всего: {facts.destroyedComposition}.', emotion='calm')])])
    banter = deepcopy(base)
    banter.update(id='combat.kill_banter', eventType='combat.kill_banter',
                  title='После боя: шутка про медаль', delivery='idle', priority=2,
                  windowSimSeconds=0, cooldown=180, expiresAfter=20,
                  preconditions={'field': 'uniqueTargetCount', 'op': 'gte', 'value': 3},
                  tiers=[dict(id='group', min=3, graphs=[graph('combat.kill_banter.medal',
                      'За такое, наверное, медаль дадут.', emotion='dry', humor=True)])])
    for r in (reaction, banter):
        previous = rules.get(r['id'])
        if previous: library['rules'][library['rules'].index(previous)] = r
        else: library['rules'].append(r)
    for key in ACK_RULES:
        for tier in rules[key]['tiers']:
            for i, text in enumerate(('Плюс.', 'Плюс-плюс.')):
                gid = key+'.'+tier['id']+'.ack-plus-'+str(i+1)
                g = graph(gid, text, emotion='calm')
                phrases[gid]['kind'] = 'ack'
                phrases[gid].pop('identify', None)
                if not any(old['id'] == gid for old in tier['graphs']): tier['graphs'].append(g)
    library['settings']['dispatchRevision'] = 1
    return library


def upgrade_dispatch(library, seed):
    """Upgrade saved editor documents once; preserve enabled switches and other edits."""
    if library['settings'].get('dispatchRevision', 0) >= 1:
        return library
    existing = {r['id']: r for r in library['rules']}
    for rule in seed['rules']:
        if rule['id'] not in DISPATCH_RULES: continue
        current = existing.get(rule['id'])
        if rule['id'] in ACK_RULES and current:
            for tier in current['tiers']:
                source = next((t for t in rule['tiers'] if t['id'] == tier['id']), None)
                if not source: continue
                for g in source['graphs']:
                    if '.ack-plus-' not in g['id'] or any(old['id'] == g['id'] for old in tier['graphs']): continue
                    tier['graphs'].append(deepcopy(g))
                    for n in g['nodes']: library['phrases'][n['phraseId']] = deepcopy(seed['phrases'][n['phraseId']])
            continue
        if rule['id'] in NOTIFICATIONS and current:
            for field in ('delivery', 'priority', 'windowSimSeconds', 'cooldown'):
                current[field] = rule[field]
            continue
        replacement = deepcopy(rule)
        if current:
            replacement['enabled'] = current['enabled']
            library['rules'][library['rules'].index(current)] = replacement
        else: library['rules'].append(replacement)
        for tier in rule['tiers']:
            for g in tier['graphs']:
                for n in g['nodes']:
                    library['phrases'][n['phraseId']] = deepcopy(seed['phrases'][n['phraseId']])
    library['settings']['dispatchRevision'] = 1
    return library
