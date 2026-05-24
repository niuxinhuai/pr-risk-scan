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

### Usage

Run inside a git repository.

```bash
pr-risk-scan
pr-risk-scan --base main
pr-risk-scan --staged --json
```

### Status

This is an MVP designed to be useful immediately and easy to extend. It has no runtime dependencies and targets Node.js 18+.

### Test

```bash
npm test
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

### 用法

在 Git 仓库中运行。

```bash
pr-risk-scan
pr-risk-scan --base main
pr-risk-scan --staged --json
```

### 当前状态

这是一个可以直接使用的 MVP，重点是小、清晰、容易二次开发。运行时无第三方依赖，要求 Node.js 18+。

### 测试

```bash
npm test
```
