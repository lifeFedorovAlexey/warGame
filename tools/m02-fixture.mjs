import fs from 'node:fs';
import {Mission} from '../campaign/mission.js';
import {createHeightfield} from '../demo/map-route.js';
import {shapeMesaRims} from '../demo/mesa-shaping.js';
import {refineRoadHeightfield} from '../demo/road-heightfield.js';
import {applyRoadGrades} from '../demo/road-grading.js';
export const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export function makeField(){const original=createHeightfield(readJson('assets/maps/alpha/heightfield.json'));shapeMesaRims(original);const field=refineRoadHeightfield(original);applyRoadGrades(field,readJson('assets/maps/alpha/roads.json'));return field;}
export function makeMission(field=makeField()){return new Mission(readJson('assets/campaign/alpha/mission01/gameplay.json'),field);}
