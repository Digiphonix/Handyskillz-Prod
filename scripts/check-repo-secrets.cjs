// Compare files/history with local server secrets without printing their values.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
const secrets = [];
for (const file of ['.env', 'artifacts/api-server/.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || !/(SECRET|SERVICE_ROLE|ACCESS_TOKEN|DATABASE_URL|PASSWORD)/.test(match[1])) continue;
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (value.length > 12 && !/your_|replace_me|example/i.test(value)) secrets.push(Buffer.from(value));
  }
}
const hits = new Set();
let historyBlobs = 0;
for (const line of git('rev-list', '--objects', '--all').toString().trim().split('\n')) {
  const [id, ...parts] = line.split(' ');
  if (!parts.length || git('cat-file', '-t', id).toString().trim() !== 'blob') continue;
  const content = git('cat-file', 'blob', id);
  historyBlobs++;
  if (secrets.some((value) => content.includes(value))) hits.add(`history: ${parts.join(' ')}`);
}
for (const file of git('ls-files', '--cached', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean)) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
  if (secrets.some((value) => fs.readFileSync(file).includes(value))) hits.add(`working tree: ${file}`);
}
console.log(JSON.stringify({ historyBlobsScanned: historyBlobs, filesMatchingLocalServerSecrets: [...hits] }, null, 2));
if (!secrets.length) console.log('No local server secrets available for comparison.');
process.exitCode = hits.size ? 1 : 0;
