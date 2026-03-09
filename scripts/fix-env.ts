import * as fs from 'fs';

let content = fs.readFileSync('.env', 'utf-8');

// The UTF-16 string has null bytes and spaces. 
// Let's just find "BRAIN_DATABASE_URL" in whatever weird form it is and remove it.
content = content.replace(/[\x00-\x7F]*B[\x00]*R[\x00]*A[\x00]*I[\x00]*N[\x00]*_[\x00]*D[\x00]*A[\x00]*T[\x00]*A[\x00]*B[\x00]*A[\x00]*S[\x00]*E[\x00]*_[\x00]*U[\x00]*R[\x00]*L[\x00]*[^'\n]*/g, '');
content = content.replace(/B R A I N _ D A T A B A S E _ U R L = ' p o s t g r e s q l : \/ \/ n e o n d b _ o w n e r : n p g _ d v B F A 0 z C V 9 r S @ e p - m i s t y - w a t e r - a 1 w x v p 1 9 . a p - s o u t h e a s t - 1 . a w s . n e o n . t e c h \/ n e o n d b \? s s l m o d e = r e q u i r e & c h a n n e l _ b i n d i n g = r e q u i r e '/g, '');

const fixed = content + '\nBRAIN_DATABASE_URL="postgresql://neondb_owner:npg_dvBFA0zCV9rS@ep-misty-water-a1wxvp19.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"\n';

fs.writeFileSync('.env', fixed);
console.log("Fixed .env");
