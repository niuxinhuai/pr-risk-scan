#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VERSION = '0.1.0';
const args = process.argv.slice(2);
const severityRank = { low: 1, medium: 2, high: 3 };

function has(flag) {
  return args.includes(flag);
}

function value(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
}

function usage() {
  console.log(`pr-risk-scan v${VERSION}

Usage:
  pr-risk-scan [--base HEAD] [--staged] [--json|--sarif] [--markdown report.md] [--fail-on medium]

Options:
  --config <file>    Read JSON config. Default: .pr-risk-scanrc.json when present.
  --base <ref>       Compare working tree against ref. Default: HEAD.
  --staged           Scan staged changes.
  --fail-on <level>  Exit 2 when risk is at least low, medium, or high.
  --markdown <file>  Write a Markdown report to a file.
  --sarif            Print SARIF for GitHub code scanning.
  --json             Print JSON.
  --version          Print version.
  -h, --help         Show help.`);
}

if (has('--help') || has('-h')) {
  usage();
  process.exit(0);
}
if (has('--version')) {
  console.log(VERSION);
  process.exit(0);
}

function readConfig() {
  const configFile = value('--config', fs.existsSync('.pr-risk-scanrc.json') ? '.pr-risk-scanrc.json' : '');
  if (!configFile) return {};
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch (error) {
    console.error(`Unable to read config ${configFile}: ${error.message}`);
    process.exit(1);
  }
}

function git(params) {
  return execFileSync('git', params, { encoding: 'utf8' }).trim();
}

function globish(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function isIgnored(file, patterns = []) {
  return patterns.some((pattern) => globish(pattern).test(file));
}

function packageNameFor(file) {
  const parts = file.split('/');
  const candidates = [];
  for (let i = parts.length - 1; i > 0; i -= 1) {
    candidates.push(parts.slice(0, i).join('/'));
  }
  for (const dir of candidates) {
    const pkgFile = path.join(dir, 'package.json');
    if (fs.existsSync(pkgFile)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
        return pkg.name || dir;
      } catch {
        return dir;
      }
    }
  }
  return '(root)';
}

const config = readConfig();
const json = has('--json');
const sarif = has('--sarif');
const markdownFile = value('--markdown', '');
const staged = has('--staged');
const base = value('--base', config.base || 'HEAD');
const failOn = value('--fail-on', config.failOn || '');

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
}).filter((file) => !isIgnored(file.path, config.ignore || []));

const builtInRules = [
  { category: 'security', severity: 'high', score: 6, pattern: 'auth|security|secret|token|password|permission|role|policy', reason: 'Security or authorization-sensitive path changed.' },
  { category: 'data', severity: 'high', score: 6, pattern: 'migration|schema|prisma|sequelize|database|\\.sql$', reason: 'Schema or migration path changed.' },
  { category: 'config', severity: 'medium', score: 4, pattern: 'config|\\.env|Dockerfile|docker-compose|k8s|helm|terraform|package-lock|pnpm-lock|yarn.lock|\\.github/workflows', reason: 'Configuration, dependency, or deployment behavior changed.' },
  { category: 'api', severity: 'medium', score: 4, pattern: 'openapi|swagger|proto|graphql|routes?|controller|api', reason: 'Public API surface may have changed.' },
  { category: 'release', severity: 'medium', score: 3, pattern: 'version|changelog|release|deploy|ci|workflow', reason: 'Release or CI behavior changed.' }
];
const rules = [...builtInRules, ...(config.rules || [])].map((rule) => ({ ...rule, regex: new RegExp(rule.pattern, 'i') }));

const findings = [];
for (const file of files) {
  if (file.status.startsWith('D')) {
    findings.push({ category: 'deletion', severity: 'medium', score: 4, file: file.path, status: file.status, reason: 'File was deleted.', package: packageNameFor(file.path) });
  }
  for (const rule of rules) {
    if (rule.regex.test(file.path)) {
      findings.push({ category: rule.category, severity: rule.severity, score: rule.score, file: file.path, status: file.status, reason: rule.reason, package: packageNameFor(file.path) });
    }
  }
  for (const ownerRule of config.ownerRules || []) {
    if (globish(ownerRule.path).test(file.path)) {
      findings.push({
        category: 'owner-review',
        severity: ownerRule.severity || 'medium',
        score: ownerRule.score || 3,
        file: file.path,
        status: file.status,
        reason: `Requires review from ${ownerRule.owner}.`,
        package: packageNameFor(file.path)
      });
    }
  }
}

if (/^\+.*(password|secret|token|api[_-]?key)\s*[:=]/gim.test(diff)) {
  findings.push({ category: 'secret-pattern', severity: 'high', score: 8, file: '(diff content)', status: '+', reason: 'Added line looks like a secret assignment.', package: '(unknown)' });
}

const tests = files.filter((file) => /test|spec|__tests__/i.test(file.path));
const source = files.filter((file) => /\.(js|ts|tsx|jsx|py|go|rs|java|kt|swift|ets)$/.test(file.path) && !/test|spec|__tests__/i.test(file.path));
if (source.length && !tests.length) {
  findings.push({ category: 'test-gap', severity: 'medium', score: 3, file: '(diff)', status: 'M', reason: 'Source changed without test files in the same diff.', package: '(mixed)' });
}

const score = findings.reduce((sum, item) => sum + item.score, 0);
const level = findings.some((f) => f.severity === 'high') || score >= 15 ? 'high' : score >= 7 ? 'medium' : 'low';
const packages = [...new Set(files.map((file) => packageNameFor(file.path)))];
const result = {
  base,
  staged,
  level,
  score,
  filesChanged: files.length,
  packages,
  findings,
  suggestedChecks: [
    tests.length ? 'Run changed tests plus the relevant full suite.' : 'Add or run targeted tests for changed source files.',
    findings.some((f) => f.category.includes('secret') || f.category === 'security') ? 'Request security-sensitive review and scan for credentials.' : 'Review behavior changes against product expectations.',
    findings.some((f) => f.category === 'data') ? 'Verify migration rollback, seed data, and compatibility.' : 'Check deployment and rollback notes if this ships to production.'
  ]
};

function markdown(data) {
  return `# PR Risk Scan

Risk level: ${data.level} (score ${data.score})
Files changed: ${data.filesChanged}
Packages: ${data.packages.join(', ') || 'none'}

## Findings
${data.findings.length ? data.findings.map((f) => `- [${f.severity}/${f.category}] ${f.status} ${f.file} - ${f.reason}`).join('\n') : '- No obvious risk signals found.'}

## Suggested checks
${data.suggestedChecks.map((s) => `- ${s}`).join('\n')}
`;
}

function toSarif(data) {
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: { name: 'pr-risk-scan', informationUri: 'https://github.com/niuxinhuai/pr-risk-scan', rules: [] } },
      results: data.findings.filter((f) => f.file !== '(diff)' && !f.file.startsWith('(')).map((finding) => ({
        ruleId: finding.category,
        level: finding.severity === 'high' ? 'error' : finding.severity === 'medium' ? 'warning' : 'note',
        message: { text: finding.reason },
        locations: [{ physicalLocation: { artifactLocation: { uri: finding.file }, region: { startLine: 1 } } }]
      }))
    }]
  };
}

if (markdownFile) fs.writeFileSync(markdownFile, markdown(result));
if (sarif) console.log(JSON.stringify(toSarif(result), null, 2));
else if (json) console.log(JSON.stringify(result, null, 2));
else console.log(markdown(result));

if (failOn && severityRank[level] >= severityRank[failOn]) process.exit(2);
