const { spawn } = require('child_process');
const child = spawn('catalyst', ['deploy', 'slate'], { cwd: process.cwd(), shell: true });
child.stdout.on('data', d => { 
    console.log(d.toString()); 
    child.stdin.write('y\n\r\n'); 
});
child.stderr.on('data', d => console.log(d.toString()));
child.on('close', code => process.exit(code || 0));

setInterval(() => {
    child.stdin.write('y\n\r\n');
}, 3000);

setTimeout(() => {
    child.kill();
    process.exit(1);
}, 60000);
