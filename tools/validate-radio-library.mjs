import {validateLibrary} from '../campaign/radio/conditions.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
try{validateLibrary(JSON.parse(input));process.stdout.write('ok');}
catch(error){process.stderr.write(error.message);process.exitCode=1;}
