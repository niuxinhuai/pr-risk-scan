#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const VERSION = '0.1.0';
const args = process.argv.slice(2);
const severityRank = { low: 1, medium: 2, high: 3 };

function has(flag) { return args.includes(flag); }
function value(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
}
function usage() {
  console.log(`pr-risk-scan v${VERSION}

Usage:
  pr-risk-scan [--base HEAD] [--staged] [--json] [--fail-on medium]

Options:
  --base <ref>       Compare working tree against ref. Default: HEAD.
  --staged           Scan staged changes.
  --fail-on <level>  Exit 2 when risk is at least low, medium, or high.
  --json             Print JSON.
  --version          Print version.
  -h, --help         Show help.`);
}
if (has('--help') || has('-h')) { usage(); process.exit(0); }
if (has('--version')) { console.log(VERSION); process.exit(0); }

const json = has('--json');
const staged = has('--staged');
const base = value('--base', 'HEAD');
const failOn = value('--fail-on', '');
function git(params) {
  return execFileSync('git', params, { encoding: 'utf8' }).trim();
}
let nameStatus = '';
let diff = '';
try {
  const prefix = staged ? ['diff', '--cached'] : ['diff', base];
  nameStatus = git([...prefix, '--name-status']);
  diff = git(prefix);
} catch {
  console.error('pr-risk-scan must be run inside a git repository.');
  process.exit(1);
}
const files = nameStatus.split('\n').filter(Boolean).map((line) => {
  const [status, ...rest] = line.split(/\s+/);
  return { status, path: rest.join(' ') };
});
const rules = [
  { category: 'security', severity: 'high', score: 6, file: /auth|security|secret|token|password|permission|role|policy/i, reason: 'Security or authorization-sensitive path changed.' },
  { category: 'data', severity: 'high', score: 6, file: /migration|schema|prisma|sequelize|database|\.sql$/i, reason: 'Schema or migration path changed.' },
  { category: 'config', severity: 'medium', score: 4, file: /config|\.env|Dockerfile|docker-compose|k8s|helm|terraform|package-lock|pnpm-lock|yarn.lock|\.github\/workflows/i, reason: 'Configuration, dependency, or deployment behavior changed.' },
  { category: 'api', severity: 'medium', score: 4, file: /openapi|swagger|proto|graphql|routes?|controller|api/i, reason: 'Public API surface may have changed.' },
  { category: 'release', severity: 'medium', score: 3, file: /version|changelog|release|deploy|ci|workflow/i, reason: 'Release or CI behavior changed.' }
];
const findings = [];
for (const file of files) {
  if (file.status.startsWith('D')) findings.push({ category: 'deletion', severity: 'medium', score: 4, file: file.path, status: file.status, reason: 'File was deleted.' });
  for (const rule of rules) {
    if (rule.file.test(file.path)) findings.push({ ...rule, file: file.path, status: file.status });
  }
}
const addedSecret = /^\+.*(password|secret|token|api[_-]?key)\s*[:=]/gim.test(diff);
if (addedSecret) findings.push({ category: 'secret-pattern', severity: 'high', score: 8, file: '(diff content)', status: '+', reason: 'Added line looks like a secret assignment.' });
const tests = files.filter((file) => /test|spec|__tests__/i.test(file.path));
const source = files.filter((file) => /\.(js|ts|tsx|jsx|py|go|rs|java|kt|swift|ets)$/.test(file.path) && !/test|spec|__tests__/i.test(file.path));
if (source.length && !tests.length) findings.push({ category: 'test-gap', severity: 'medium', score: 3, file: '(diff)', status: 'M', reason: 'Source changed without test files in the same diff.' });
const score = findings.reduce((sum, item) => sum + item.score, 0);
const level = findings.some((f) => f.severity === 'high') || score >= 15 ? 'high' : score >= 7 ? 'medium' : 'low';
const result = {
  base,
  staged,
  level,
  score,
  filesChanged: files.length,
  findings,
  suggestedChecks: [
    tests.length ? 'Run changed tests plus the relevant full suite.' : 'Add or run targeted tests for changed source files.',
    findings.some((f) => f.category.includes('secret') || f.category === 'security') ? 'Request security-sensitive review and scan for credentials.' : 'Review behavior changes against product expectations.',
    findings.some((f) => f.category === 'data') ? 'Verify migration rollback, seed data, and compatibility.' : 'Check deployment and rollback notes if this ships to production.'
  ]
};
if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`# PR Risk Scan

Risk level: ${level} (score ${score})
Files changed: ${files.length}

## Findings
${findings.length ? findings.map((f) => `- [${f.severity}/${f.category}] ${f.status} ${f.file} - ${f.reason}`).join('\n') : '- No obvious risk signals found.'}

## Suggested checks
${result.suggestedChecks.map((s) => `- ${s}`).join('\n')}
`);
}
if (failOn && severityRank[level] >= severityRank[failOn]) process.exit(2);
