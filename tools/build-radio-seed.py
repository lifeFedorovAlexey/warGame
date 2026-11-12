"""Reconstructed editable seed from the brief; never overwrites editor data."""
from pathlib import Path
import json
import re
from radio_dialogue_content import enrich
from radio_dispatch_content import apply_dispatch_content

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/radio'
CATEGORIES = {
 'command': 'select|move|attack|attack_move|stop|defend|patrol|return|retreat|capture|build|repair|cancel|rejected|completed|formation|group_create|group_split|group_merge|rally|auto_retreat|priority|guard|escort|hold_fire|resume',
 'movement': 'column_depart|started|arrived|column_arrived|mass_depart|road_enter|road_exit|mountain_climb|descent|serpentine|bridge_enter|bridge_exit|narrow_passage|parking_occupied|parking_assigned|regroup|separated|rejoined|route_changed|route_unreachable',
 'traffic': 'oncoming_yield|queue_blocked|jam_resolved|deadlock|pair_pass|crossing_wait|crossing_clear|convoy_wait|convoy_pass|reverse_started|reverse_complete|builder_blocking|builder_clear|corridor_yield|corridor_return|priority_pass|junction_conflict|queue_progress|jam_escalated|long_stop|parking_conflict|exit_blocked|exit_clear|network_overload',
 'combat': 'first_contact|attack_started|target_destroyed|flank|contact_lost|friendly_fire|overheat|reload|weapon_jam|flamethrower_test|flamethrower_attack|tower_attack|capture_started|capture_complete|disengage|ambush|under_fire|heavy_fire|enemy_column|enemy_retreat|base_attack|builder_attacked|factory_attacked|lab_attacked|generator_attacked|ammo_low|ammo_empty|victory_local',
 'damage': 'hit|light|heavy|mobility_lost|engine_damaged|weapon_damaged|commander_down|vehicle_destroyed|crew_killed|crew_wounded|crew_evacuated|crew_unknown|casualty_summary|burning|fire_extinguished|multiple_losses|survivors_confirmed|armour_hit',
 'repair': 'start_field|start_factory|complete|queue_enter|queue_priority|queue_wait|auto_depart|return_order|interrupted|mobility_restored',
 'economy': 'generator_stop|shortage|power_restored|generator_start|oil_low|oil_empty|oil_found|oil_connected|oil_exhausted|network_overload|storage_full|supply_requested|supply_arrived|consumer_offline|all_consumers_offline',
 'loot': 'food_found|artifact_found|salvage_found|salvage_collected|supplies_found',
 'construction': 'start|cancelled|complete|destroyed|bunker_start|factory_start|lab_start|repair_point_start|generator_start|under_fire|blocked|refused',
 'factory': 'vehicle_complete|queue_start|queue_complete|exit_blocked|exit_clear|modernization_start|modernization_complete',
 'research': 'start|complete|artifact_delivered|ammo_start|ammo_complete|feed_start|feed_complete|flamethrower_start|flamethrower_complete|tower_start|tower_complete|sensor_complete|power_module_complete|test_start|test_accident',
 'recon': 'enemy_first_seen|enemy_lost|enemy_new_type|camp_seen|camp_cleared|mine_seen|radiation_seen|bridge_seen|signal_unknown|oil_seen|artifact_seen|tower_seen|scout_depart|scout_return|area_clear|route_safe|ambush_seen|objective_seen',
 'mission': 'objective_started|objective_complete|objective_failed|victory|defeat',
 'idle': 'group_no_order|quiet|driver_pair|builder_pair|radio_check|callsign_confusion|repair_memory|traffic_memory|road_memory|thermos|waiting_factory|waiting_research|waiting_supply|crew_history|commander_check',
 'environment': 'dust|fog|rain|night|dawn|storm|visibility_low',
}
EXPECTED = [26,20,24,28,18,10,15,5,12,7,15,18,5,15,7]
assert [len(v.split('|')) for v in CATEGORIES.values()] == EXPECTED
RUSSIAN = {
 'command':'Выбор машины|Приказ двигаться|Приказ атаковать|Движение с боем|Остановка|Оборона|Патруль|Возврат|Отступление|Захват|Строительство|Ремонт|Отмена приказа|Приказ отклонён|Приказ выполнен|Перестроение|Создание группы|Разделение группы|Объединение групп|Точка сбора|Авторемонт и отход|Приоритет приказа|Охрана|Сопровождение|Прекратить огонь|Возобновить приказ',
 'movement':'Колонна выдвигается|Начало движения|Прибытие|Колонна прибыла|Массовое выдвижение|Выход на дорогу|Съезд с дороги|Подъём|Спуск|Серпантин|Въезд на мост|Выезд с моста|Теснина|Стоянка занята|Место назначено|Сбор группы|Отрыв от группы|Возвращение в группу|Изменение маршрута|Маршрут недоступен',
 'traffic':'Встречный разъезд|Длительный затор|Проезд освобождён|Взаимное ожидание|Парный разъезд|Ожидание перекрёстка|Перекрёсток свободен|Колонна ждёт|Колонна прошла|Начало манёвра|Манёвр завершён|Строитель закрыл проезд|Строитель освободил проезд|Уступание коридора|Возврат после уступания|Приоритетный проезд|Конфликт на перекрёстке|Очередь движется|Затор увеличился|Долгая остановка|Конфликт стоянки|Выезд заблокирован|Выезд свободен|Перегрузка эфира',
 'combat':'Первый контакт|Начало атаки|Цель уничтожена|Обход|Контакт потерян|Огонь своих|Перегрев|Перезарядка|Оружие заклинило|Испытание огнемёта|Огнемётный огонь|Огонь башни|Начало захвата|Захват завершён|Выход из боя|Засада|Под огнём|Плотный огонь|Колонна противника|Противник отступает|Атака базы|Строитель под огнём|Завод под огнём|НИИ под огнём|Генератор под огнём|Мало боеприпасов|Боеприпасы кончились|Победа в бою',
 'damage':'Попадания|Лёгкие повреждения|Тяжёлые повреждения|Потеря управления|Повреждение двигателя|Повреждение оружия|Командирская машина подбита|Потери техники|Погибшие|Раненые|Эвакуация экипажа|Состояние экипажа неизвестно|Сводка потерь|Пожар|Пожар потушен|Несколько потерь|Выжившие подтверждены|Попадание в броню',
 'repair':'Полевой ремонт|Ремонт на заводе|Ремонт завершён|Очередь ремонта|Приоритет ремонта|Ожидание ремонта|Автоматический отход|Возврат к приказу|Ремонт прерван|Управление восстановлено',
 'economy':'Генератор остановлен|Недостаточно энергии|Питание восстановлено|Генератор запущен|Мало нефти|Нефть закончилась|Нефть обнаружена|Нефть подключена|Скважина истощена|Перегрузка сети|Склад полон|Запрос снабжения|Снабжение прибыло|Потребитель отключён|Все потребители отключены',
 'loot':'Трофейное продовольствие|Артефакт получен|Запчасти обнаружены|Запчасти собраны|Припасы обнаружены',
 'construction':'Начало стройки|Стройка отменена|Стройка завершена|Стройка уничтожена|Начало стройки ДОТа|Начало стройки завода|Начало стройки НИИ|Начало стройки ремонтного пункта|Начало стройки генератора|Стройка под огнём|Стройка заблокирована|Стройка отклонена',
 'factory':'Новая машина|Начало производства|Очередь выполнена|Выезд заблокирован|Выезд свободен|Начало модернизации|Модернизация завершена',
 'research':'Исследование начато|Исследование завершено|Артефакт доставлен|Исследование патронов|Патроны исследованы|Исследование подачи|Подача исследована|Исследование огнемёта|Огнемёт исследован|Исследование башни|Башня исследована|Датчик исследован|Энергомодуль исследован|Начало испытаний|Авария на испытаниях',
 'recon':'Противник обнаружен|Противник потерян|Новый тип противника|Лагерь обнаружен|Лагерь зачищен|Мины обнаружены|Радиация обнаружена|Мост обнаружен|Неизвестный сигнал|Нефть обнаружена|Артефакт обнаружен|Башня обнаружена|Разведчик вышел|Разведчик вернулся|Район чист|Маршрут безопасен|Засада обнаружена|Цель задачи обнаружена',
 'mission':'Новая задача|Задача выполнена|Задача провалена|Победа|Поражение',
 'idle':'Ожидание приказа|Тишина в эфире|Разговор водителей|Разговор строителей|Проверка связи|Похожие позывные|Память о ремонте|Память о заторе|Память о дороге|Термос|Ожидание завода|Ожидание исследования|Ожидание снабжения|История экипажа|Проверка командира',
 'environment':'Пыль|Туман|Дождь|Ночь|Рассвет|Буря|Плохая видимость',
}
assert all(len(RUSSIAN[c].split('|'))==len(names.split('|')) for c,names in CATEGORIES.items())
TITLES = {
 'idle.quiet':'Подколы в передышке',
 'idle.crew_history':'Память о погибших','idle.driver_pair':'Новичок и старший',
 'command.move':'Приказ двигаться','command.attack':'Приказ атаковать','command.stop':'Приказ остановиться',
 'command.build':'Приказ строить','command.select':'Выбор машины','command.rejected':'Приказ отклонён',
 'movement.column_depart':'Колонна выдвигается','movement.arrived':'Прибытие',
 'traffic.queue_blocked':'Длительный затор','traffic.jam_resolved':'Проезд освобождён',
 'traffic.deadlock':'Подтверждённый цикл ожидания','traffic.oncoming_yield':'Встречный разъезд',
 'damage.hit':'Попадания','damage.vehicle_destroyed':'Потери техники','damage.commander_down':'Командирская машина подбита',
 'repair.start_factory':'Ремонт на заводе','repair.complete':'Ремонт завершён',
 'research.start':'Исследование начато','research.complete':'Исследование завершено',
 'construction.start':'Стройка начата','construction.complete':'Стройка завершена','construction.cancelled':'Стройка отменена',
 'factory.vehicle_complete':'Новая техника','recon.camp_cleared':'Лагерь зачищен',
 'loot.food_found':'Трофейное продовольствие','energy.generator_stop':'Генератор остановлен','energy.shortage':'Недостаточно энергии',
 'idle.group_no_order':'Группа ожидает приказа','mission.victory':'Задача выполнена','mission.defeat':'Задача провалена',
}
# Only these names are emitted by the adapter. Other catalog entries are NOT mechanics.
SOURCES = {
 'idle.quiet':'CrewBanter: two living crews in a quiet channel, 90s after mission start, 150s between played bawdy exchanges',
 'recon.enemy_first_seen':'TacticalIntel: currently visible hostile armed vehicles and emplacements, deduplicated by entity ID',
 'idle.crew_history':'CrewStories: confirmed personnel deaths, at least 3 losses or rank above surviving average, after combat quiets',
 'idle.driver_pair':'CrewStories: actual idle private and higher-ranked living colleague',
 'command.move':'Mission.order / CommandPlanner accepted assignments',
 'command.attack':'Mission.order / CommandPlanner accepted assignments',
 'command.attack_move':'Mission.order / CommandPlanner accepted assignments',
 'command.retreat':'forceCombatRetreat accepted order -> combatRetreat status moving',
 'command.auto_retreat':'startAutomaticRetreat -> combatRetreat status moving',
 'combat.target_destroyed':'Mission.damage confirmed enemy destruction, own attacker and visible target',
 'combat.base_attack':'under-attack confirmed damage to a friendly building by a hostile source',
 'command.build':'Mission.order accepted assignments', 'command.stop':'Mission.applyPendingStops',
 'command.rejected':'navigation-command-rejected', 'movement.arrived':'completed move task transition',
 'traffic.queue_blocked':'TrafficCoordinator queues + connected wait participants + stationary duration',
 'traffic.jam_resolved':'same incident participants resume movement',
 'damage.hit':'Mission.damage accepted damage', 'damage.vehicle_destroyed':'destroyed + personnel archive',
 'damage.commander_down':'destroyed(kind=command)', 'repair.start_factory':'factory-repair-start',
 'repair.complete':'factory-repair-complete', 'construction.start':'construction-start',
 'construction.complete':'construction-complete', 'construction.cancelled':'construction-cancelled',
 'construction.refused':'construction-refused','research.start':'research-start','research.complete':'research-complete',
 'factory.vehicle_complete':'unit-produced','recon.camp_cleared':'camp-cleared',
 'loot.artifact_found':'artifact-collected','mission.victory':'victory','mission.defeat':'defeat',
 'traffic.deadlock':'navigation-wait-cycle','traffic.reverse_started':'navigation-stuck-turn-started',
 'traffic.reverse_complete':'navigation-stuck-turn-finished','repair.mobility_restored':'vehicle-steering-repaired',
 'factory.modernization_complete':'vehicle-modernized','command.capture':'building-captured',
 'damage.mobility_lost':'vehicle-steering-damage-roll(failed=true)',
 'movement.route_changed':'navigation-route-shortened','movement.column_depart':'first moving controller sample for accepted order',
 'idle.group_no_order':'controller transitions to idle, then remains without task for 45 sim seconds',
 'traffic.network_overload':'RadioEngine distinct accepted orders in 3 sim seconds',
}
LEGACY = dict(zip(
 ['a01','a02','a03','a04','u01','u02','u04',*[f'event:m01-b{i:03}' for i in range(12,21)],
  'event:warrant:stop','event:factory-repair-start','event:factory-repair-start-alt','event:factory-repair-complete',
  'unit:select','unit:move','unit:attack','unit:build','unit:stop'],
 ['movement.column_depart','traffic.oncoming_yield','traffic.queue_blocked','traffic.jam_resolved',
  'combat.flamethrower_test','loot.food_found','energy.generator_stop','repair.start_field','energy.shortage',
  'research.start','research.complete','damage.hit','idle.group_no_order','damage.commander_down','factory.vehicle_complete',
  'recon.enemy_first_seen','command.stop','repair.start_factory','repair.start_factory','repair.complete',
  'command.select','command.move','command.attack','command.build','command.stop']))
DERIVABLE={
 'command.select':'FieldSound.acknowledge(select): выбор не является приказом',
 'command.auto_retreat':'combat-policy.js: startAutomaticRetreat',
 'repair.auto_depart':'combatRetreat: переход planning → moving',
 'repair.return_order':'factory-repair.js: retreatReturnOrder',
 'factory.exit_blocked':'Mission.updateEconomySteps: exitBlocked',
 'factory.exit_clear':'Mission.updateEconomySteps: exitBlocked true → false',
 'factory.queue_complete':'spawnProducedVehicleSteps: очередь стала пустой',
 'damage.burning':'burning.js: ignite / updateBurning',
 'damage.fire_extinguished':'updateBurning: завершение горения',
 'damage.crew_killed':'recordPersonnelDeath: подтверждённая death',
 'economy.oil_empty':'finishOilFlow: запас нефти достиг нуля',
 'economy.oil_connected':'linkOilWells: oilLinked',
 'economy.power_restored':'linkOilWells: powered у нефтевышек',
 'research.power_module_complete':'power-module-installed',
 'command.formation':'commandGroups: изменение formation',
 'command.group_create':'создание commandGroups',
 'command.group_split':'изменение членства commandGroups',
 'traffic.oncoming_yield':'storyFacts: yielding + проверка фактического проезда встречной машины',
 'recon.enemy_first_seen':'Mission.updateFog: переход контакта в видимость',
 'recon.enemy_lost':'Mission.updateFog: выход контакта из видимости',
}

def build():
 rules=[]; phrases={}
 def phrase(key,text,role='driver',kind='report',**extra):
  phrases[key]={'id':key,'text':text,'role':role,'kind':kind,'source':'tts','audio':None,'portrait':None,'voiceId':None,
                'pauseAfter':0.12,'archived':False,**extra}
  return key
 blocks={
 'command.move':[['Приказ принят. Выдвигаюсь.'],['Колонна, начинаем движение.','Дистанцию держим.'],['Начинаем массовое выдвижение.','Колонна, без обгонов.','Замыкающие, держите связь.']],
 'command.attack':[['Цель принята.'],['Группа, цель принята.','Действуем согласованно.'],['Всем машинам: цель принята.','Сохраняем порядок.','Приказ подтверждаю.']],
 'command.attack_move':[['Начинаю движение с боем.'],['Группа, двигаемся с боем.','Следим за флангами.'],['Всем машинам: движение с боем.','Держим строй.','Приказ принят.']],
 'command.stop':[['Останавливаюсь.'],['Группа, остановка.','Приказ принят.'],['Вся назначенная группа, остановка.','Подтверждаю.','Ждём дальнейшего приказа.']],
 'command.build':[['Задание на строительство принято.'],['Строители, задание принято.','Приступаем по готовности.'],['Большая строительная группа, задание принято.','Работаем по назначенным местам.','Подтверждаю.']],
 'traffic.queue_blocked':[['Стою в дорожной очереди.'],['Колонна стоит.','Причину уточняем.'],['Большая колонна остановилась в одном заторе.','Не уплотняйте очередь.','Ожидаем освобождения проезда.']],
 'traffic.jam_resolved':[['Снова движемся.'],['Участники затора снова движутся.','Дистанцию держим.'],['Большой затор разрешён, машины снова идут.','Не останавливайтесь в проходе.','Подтверждаю движение.']],
 'damage.hit':[['Зафиксировано попадание.'],['Несколько машин получили повреждения.','Уточняем состояние.'],['Много машин под огнём.','Повреждения уточняем.','Докладывайте изменения.']],
 'damage.vehicle_destroyed':[['Потеряна {destroyedVehicleCount:machine}. Состояние экипажа уточняем.'],['Потери техники: {destroyedVehicleCount:machine}. Состояние экипажей уточняем.','Принято.'],['Крупные потери техники: {destroyedVehicleCount:machine}. Состояние экипажей уточняем.','Сводку принял.','Связь держим.']],
 }
 neutral={'movement.arrived':'Достигли назначенного места.','command.rejected':'Новый маршрут не принят.',
 'repair.start_factory':'Начат ремонт на заводе.','repair.complete':'Заводской ремонт завершён.',
 'construction.start':'Стройка начата.','construction.complete':'Стройка завершена.',
 'construction.cancelled':'Строительство отменено.','construction.refused':'Стройка не принята.',
 'research.start':'Исследование начато.','research.complete':'Исследование завершено.',
 'factory.vehicle_complete':'Новая машина готова.','loot.food_found':'Получено трофейное продовольствие.',
 'energy.generator_stop':'Зафиксирована остановка генератора.','damage.commander_down':'Командирская машина потеряна.',
 'recon.camp_cleared':'Лагерь зачищен.','loot.artifact_found':'Артефакт получен.',
 'mission.victory':'Боевая задача выполнена.','mission.defeat':'Задача провалена.',
 'traffic.deadlock':'Подтверждено взаимное ожидание машин.','traffic.reverse_started':'Начинаю манёвр для выхода из затора.',
 'traffic.reverse_complete':'Манёвр завершён.','repair.mobility_restored':'Управление машиной восстановлено.',
 'factory.modernization_complete':'Модернизация машины завершена.','command.capture':'Объект занят нашими силами.',
 'damage.mobility_lost':'Машина потеряла управление.','movement.route_changed':'Маршрут сокращён.',
 'movement.column_depart':'Машины начали движение.','idle.group_no_order':'Ожидаем нового задания.',
 'traffic.network_overload':'Эфир перегружен подтверждениями. Докладываем по очереди.'}
 for category, names in CATEGORIES.items():
  for name,title in zip(names.split('|'),RUSSIAN[category].split('|')):
   event=f'{category}.{name}'
   if category=='economy' and name in ('generator_stop','shortage'): event='energy.'+name
   supported=event in SOURCES
   metric='destroyedVehicleCount' if event=='damage.vehicle_destroyed' else 'uniqueObjectCount' if category in ('construction','economy','research','loot','mission') or event in ('command.capture','recon.camp_cleared') else 'affectedUnitCount'
   if event=='traffic.network_overload': metric='distinctOrderCount'
   tiers=[]
   report=neutral.get(event,'Доклад: '+title.lower()+'.')
   texts=blocks.get(event,[[report],[report,'Доклад принят.'],['Сводный доклад. '+report,'Принял сводку.','Остаёмся на связи.']])
   mins=[1,2,5] if category=='damage' else [1,3,10] if category=='traffic' else [1,5,20]
   if event=='traffic.network_overload': mins=[20,40,80]
   for level,minimum,lines in zip(['single','group','mass'],mins,texts):
    role='builder' if category=='construction' or event=='command.build' else 'driver'
    refs=[phrase(f'{event}.{level}.{i+1}',line,role=role,kind='ack' if category=='command' else 'report') for i,line in enumerate(lines)]
    tiers.append({'id':level,'min':minimum,'graphs':[{'id':event+'.'+level,'weight':1,'nodes':[{'phraseId':r,'differentSpeaker':i>0} for i,r in enumerate(refs)]}] if refs else []})
   rules.append({'id':event,'eventType':event,'title':TITLES.get(event,title),'category':category,
    'support':'wired' if supported else 'derivable' if event in DERIVABLE else 'unavailable','source':SOURCES.get(event,DERIVABLE.get(event,'')),
    'reason':'' if supported else 'Переход можно точно получить из движка, адаптер ещё не подключён.' if event in DERIVABLE else 'Нужен игровой источник: переход не подключён; механика не подтверждена.',
    'enabled':supported and event!='movement.column_depart','countMetric':metric,'windowSimSeconds':2 if category=='command' else 3,
    'scope':'order' if category=='command' else 'incident','priority':90 if category=='damage' else 60 if event=='traffic.network_overload' else 50 if category=='combat' else 30,
    'cooldown':90 if category=='idle' else 16 if category=='traffic' else 4,'expiresAfter':15 if category=='command' else 35,
    'legacyOverride':False,'interruptible':True,'preconditions':{'all':[]},'roles':['driver','builder','commander','radio'],
    'tiers':tiers})
 # Loss variants are selected only with explicit personnel facts, never inferred from damage.
 loss=next(r for r in rules if r['id']=='damage.vehicle_destroyed')
 for tier in loss['tiers']:
  alive=phrase('loss.'+tier['id']+'.alive','Потеряна техника: {destroyedVehicleCount:machine}. Личный состав цел.',requires={'all':[{'field':'facts.crewKnown','op':'eq','value':True},{'field':'killedCrewCount','op':'eq','value':0}]})
  dead=phrase('loss.'+tier['id']+'.dead','Потери техники: {destroyedVehicleCount:machine}. Погибло {killedCrewCount:person}.',requires={'all':[{'field':'facts.crewKnown','op':'eq','value':True},{'field':'killedCrewCount','op':'gte','value':1}]})
  for ref in (alive,dead): tier['graphs'].append({'id':ref,'weight':1,'specificity':10,'nodes':[{'phraseId':ref}]})
 mass=next(r for r in rules if r['id']=='command.move')['tiers'][-1]
 refs=[phrase('move.mass.joke.1','У нас тут целый полк собрался.',kind='dry_joke'),phrase('move.mass.joke.2','Не полк. Полк бы уже дорогу перекрыл.',kind='dry_joke')]
 mass['graphs'].append({'id':'move.mass.humor','weight':.2,'humor':True,'nodes':[{'phraseId':r,'differentSpeaker':i>0} for i,r in enumerate(refs)]})
 hit=next(r for r in rules if r['id']=='damage.hit')['tiers'][0]
 refs=[phrase('hit.concentrated.report','По одной машине плотно работают. Попаданий много.'),phrase('hit.concentrated.close','Принято. Состояние машины уточнить.',kind='order')]
 hit['graphs'].append({'id':'hit.concentrated','weight':1,'specificity':20,
  'requires':{'all':[{'field':'rawEventCount','op':'gte','value':20},{'field':'uniqueAffectedUnitCount','op':'eq','value':1}]},'nodes':[{'phraseId':r} for r in refs]})
 question=phrase('memory.traffic.question','Помнишь, как стояли в заторе?',kind='question',fact='sharedTraffic')
 answer=phrase('memory.traffic.answer','Помню. Теперь держим дистанцию.',kind='answer',fact='sharedTraffic')
 for tier in next(r for r in rules if r['id']=='idle.group_no_order')['tiers']:
  tier['graphs'].append({'id':'memory.traffic','weight':.2,'humor':True,'speakersFromMemory':True,
    'requires':{'field':'facts.sharedTraffic','op':'eq','value':True},
    'nodes':[{'phraseId':question},{'phraseId':answer,'differentSpeaker':True}]})
 library={'schemaVersion':1,'seedOrigin':'reconstructed-from-user-brief; original JSON was not supplied',
 'settings':{'enabled':True,'channelCooldown':2,'unitCooldown':4,'squadCooldown':4,'maxQueuedDuration':45,'maxQueue':12,'maxPending':256,'maxHistory':512,
             'humorLevel':.2,'banterRate':0,'quietInCombat':True,'volume':.85,'ttsProvider':'local-piper'},
 'rules':rules,'phrases':phrases,
 'characters':[{'id':f'voice-{i+1}','name':name,'role':role,'voiceId':f'voice-{i+1}','portrait':None,'channel':'rai','enabled':True} for i,(name,role) in enumerate([
  ('Водитель · спокойный','driver'),('Водитель · сухой юмор','driver'),('Женский · прямой','driver'),('Строитель','builder'),('Женский · спокойный','driver'),('Радист','radio')])],
 'dictionaries':{'callsigns':list(dict.fromkeys(re.search(r'const words=`([^`]*)`',(ROOT/'campaign/personnel-callsigns.js').read_text(encoding='utf-8')).group(1).split())),'addresses':['Командир','Колонна','Группа'],
  'acknowledgements':['Принято.','Подтверждаю.'],'morphology':{'machine':['машина','машины','машин'],'person':['человек','человека','человек']}}}
 enrich(rules,phrases,library['dictionaries'],library['settings'])
 for voice in library['characters']:voice['gender']='f' if voice['voiceId'] in ('voice-3','voice-5') else 'm'
 library['characters']=[c for c in library['characters'] if c['voiceId']!='voice-5']
 return apply_dispatch_content(library)

if __name__=='__main__':
 OUT.mkdir(parents=True,exist_ok=True)
 seed=build()
 for filename,data in [('situations_catalog.json',seed),('radio_dictionaries.json',seed['dictionaries']),('legacy_25_mapping.json',LEGACY)]:
  path=OUT/filename
  if path.exists(): raise SystemExit(f'Refusing to overwrite {path}')
  path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f'{len(seed["rules"])} situations; {len(SOURCES)} wired types; {len(LEGACY)} preserved IDs')
