# pr-risk-scan

[![CI](https://github.com/niuxinhuai/pr-risk-scan/actions/workflows/ci.yml/badge.svg)](https://github.com/niuxinhuai/pr-risk-scan/actions/workflows/ci.yml)

Scan a git diff for release, security, schema, config, and test-risk signals before opening a PR.

在发 PR 前扫描 git diff，找出发布、安全、schema、配置和测试风险信号。

## English

### Install

```bash
npm install -g pr-risk-scan
```

For local development:

```bash
npm install
npm link
pr-risk-scan --help
```

### Features

- Scans working tree or staged changes.
- Flags security, schema, config, API, release, deletion, secret-pattern, and test-gap risk.
- Provides deterministic risk levels and review suggestions.
- Supports `.pr-risk-scanrc.json` configuration, owner review rules, ignored paths, Markdown reports, and SARIF output.
- Can fail CI or pre-push hooks with `--fail-on`.

### Usage

```bash
pr-risk-scan
pr-risk-scan --base main
pr-risk-scan --staged --fail-on medium
pr-risk-scan --sarif > pr-risk.sarif
pr-risk-scan --markdown pr-risk.md
pr-risk-scan --json
```

### Automation

Use `pr-risk-scan --fail-on high` to block obviously risky PRs while allowing medium-risk changes to be reviewed. See `examples/github-action.yml` and `examples/pr-risk-scanrc.json`.

### Test

```bash
npm test
npm --cache /tmp/npm-cache pack --dry-run .
```

## 中文

### 安装

```bash
npm install -g pr-risk-scan
```

本地开发：

```bash
npm install
npm link
pr-risk-scan --help
```

### 功能

- 支持扫描工作区或 staged 变更。
- 标记安全、schema、配置、API、发布、删除、疑似密钥和测试缺口风险。
- 输出确定性的风险等级和复核建议。
- 支持 `.pr-risk-scanrc.json` 配置、owner 复核规则、忽略路径、Markdown 报告和 SARIF 输出。
- 可通过 `--fail-on` 用于 CI 或 pre-push hook。

### 用法

```bash
pr-risk-scan
pr-risk-scan --base main
pr-risk-scan --staged --fail-on medium
pr-risk-scan --json
```

### 自动化

Use `pr-risk-scan --fail-on high` to block obviously risky PRs while allowing medium-risk changes to be reviewed.

### 测试

```bash
npm test
npm --cache /tmp/npm-cache pack --dry-run .
```
