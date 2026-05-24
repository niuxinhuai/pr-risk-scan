#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`pr-risk-scan

Usage:
  pr-risk-scan [--base HEAD] [--staged] [--json]`);
  process.exit(0);
}
const json = args.includes('--json');
const staged = args.includes('--staged');
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args[baseIndex + 1] : 'HEAD';
function git(params) {
  return execFileSync('git', params, { encoding: 'utf8' }).trim();
}
let nameStatus = '';
try {
  nameStatus = git(staged ? ['diff', '--cached', '--name-status'] : ['diff', base, '--name-status']);
} catch {
  console.error('pr-risk-scan must be run inside a git repository.');
  process.exit(1);
}
const files = nameStatus.split('\n').filter(Boolean).map((line) => {
  const [status, ...rest] = line.split(/\s+/);
  return { status, path: rest.join(' ') };
});
const rules = [
  ['security', /auth|security|secret|token|password|permission|role|policy/i, 5],
  ['data', /migration|schema|prisma|sequelize|database|\.sql$/i, 5],
  ['config', /config|\.env|Dockerfile|docker-compose|k8s|helm|terraform|package-lock|pnpm-lock|yarn.lock/i, 4],
  ['api', /openapi|swagger|proto|graphql|routes?|controller|api/i, 4],
  ['release', /version|changelog|release|deploy|ci|workflow/i, 3],
  ['deletion', /.*/, 4]
];
const findings = [];
for (const file of files) {
  for (const [category, regex, score] of rules) {
    if ((category === 'deletion' && file.status.startsWith('D')) || (category !== 'deletion' && regex.test(file.path))) {
      findings.push({ category, score, file: file.path, status: file.status });
    }
  }
}
const tests = files.filter((file) => /test|spec|__tests__/i.test(file.path));
const source = files.filter((file) => /\.(js|ts|tsx|jsx|py|go|rs|java|kt|swift|ets)$/.test(file.path) && !/test|spec|__tests__/i.test(file.path));
if (source.length && !tests.length) {
  findings.push({ category: 'test-gap', score: 3, file: '(diff)', status: 'M' });
}
const total = findings.reduce((sum, item) => sum + item.score, 0);
const level = total >= 15 ? 'high' : total >= 7 ? 'medium' : 'low';
const result = { base, staged, level, score: total, filesChanged: files.length, findings, suggestedChecks: [
  tests.length ? 'Run changed tests and the full relevant suite.' : 'Add or run targeted tests for changed source files.',
  findings.some((f) => f.category === 'security') ? 'Request security-sensitive review.' : 'Review behavior changes against product expectations.',
  findings.some((f) => f.category === 'data') ? 'Verify migration rollback and compatibility.' : 'Check deployment and rollback notes if this ships to production.'
] };
if (json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
console.log(`# PR Risk Scan

Risk level: ${level} (score ${total})

## Findings
${findings.length ? findings.map((f) => `- [${f.category}] ${f.status} ${f.file}`).join('\n') : '- No obvious risk signals found.'}

## Suggested checks
${result.suggestedChecks.map((s) => `- ${s}`).join('\n')}
`);
