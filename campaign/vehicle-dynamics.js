// Game handling profiles in world units/second and radians. Top speed and
// health still come from the existing unit specification. All safety probes
// use these same acceleration/braking limits as the actual executor.
const standard=Object.freeze({acceleration:14,braking:22,steeringLimit:.67,turnPenalty:1.9,wheelbase:2.6,maneuverForward:13,maneuverReverse:9});
const light=Object.freeze({...standard,acceleration:22,braking:26,steeringLimit:.72,turnPenalty:.85,maneuverForward:17,maneuverReverse:11});
export function vehicleDynamics(unit){return unit.kind==='bukhanka'?light:standard;}
