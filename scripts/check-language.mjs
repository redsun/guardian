import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const prohibited = /\p{Script=Han}|[\u3000-\u303f\uff01-\uff60]/u;
const matches = files.filter(file => prohibited.test(file) || prohibited.test(readFileSync(file, 'utf8')));
if (matches.length) {
  console.error(`Repository language check failed:\n${matches.join('\n')}`);
  process.exitCode = 1;
} else console.log(`Repository language check passed (${files.length} files).`);
