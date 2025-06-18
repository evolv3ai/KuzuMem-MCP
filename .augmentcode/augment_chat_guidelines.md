# KuzuMem-MCP Development Guidelines for Augment Chat

## Overview

This document provides comprehensive guidelines for working with the KuzuMem-MCP project, combining project configuration rules and workflow state management for consistent development practices.

## 1. Repository Identity & Base Configuration

All MCP tool calls **MUST** include these exact base fields:

```jsonc
{
  "clientProjectRoot": "/Users/jokkeruokolainen/Documents/Solita/GenAI/Azure/MCP/kuzumem-mcp",
  "repository": "kuzumem-mcp",
  "branch": "current_working_branch_name", // Update when on feature branches
}
```

## 2. ID Naming Conventions

| Entity/Artifact  | ID Format                       | Example                             |
| ---------------- | ------------------------------- | ----------------------------------- |
| Component        | `comp-<CamelName>`              | `comp-MemoryService`                |
| Decision         | `dec-YYYYMMDD-<slug>`           | `dec-20250612-api-versioning`       |
| Rule             | `rule-<category>-<slug>`        | `rule-security-auth`                |
| File             | `file-<path-slug>-v<revision>`  | `file-src-db-kuzu-ts-v1`            |
| Tag              | `tag-<category>`                | `tag-performance`                   |
| Context Log      | `ctx-YYYYMMDD-hhmm-<slug>`      | `ctx-20250612-0930-session-summary` |
| Graph Projection | `graph-<algorithm>-<timestamp>` | `graph-pagerank-20250612T094500Z`   |
| Relationship CSV | `rel-<from>-<to>-v<revision>`   | `rel-AuthService-PaymentService-v1` |

## 3. Memory & Entity Types

| Type      | Purpose                                         | Governing MCP Tool                                           |
| --------- | ----------------------------------------------- | ------------------------------------------------------------ |
| Component | System module/service/code unit                 | `mcp_KuzuMem-MCP_entity` (`entityType: component`)           |
| Decision  | Architectural/technical decision with rationale | `mcp_KuzuMem-MCP_entity` (`decision`)                        |
| Rule      | Coding standard/architectural constraint        | `mcp_KuzuMem-MCP_entity` (`rule`)                            |
| File      | Source file metadata & metrics                  | `mcp_KuzuMem-MCP_entity` (`file`)                            |
| Tag       | Categorical label for filtering/analysis        | `mcp_KuzuMem-MCP_entity` (`tag`)                             |
| Context   | Session log for work progress                   | `mcp_KuzuMem-MCP_context`                                    |
| Metadata  | Repository-level metadata                       | `mcp_KuzuMem-MCP_memory-bank` (`operation: update-metadata`) |

## 4. Tech Stack & Architecture

**Technology Stack:**

- Node 20 + TypeScript
- Embedded KuzuDB
- MCP TypeScript SDK
- Jest + ts-jest
- Vitest (watch mode)
- pnpm workspaces

**Engineering Principles:**

1. Clean Architecture: controllers → services → repositories → db; **no upward imports**
2. Dependency inversion on repository boundaries
3. All graph mutations behind a **transactional service layer**
4. Tests first: each new Component requires unit & integration coverage

## 5. Governance Rules

1. Every new `Component` **must** list `dependsOn`
2. Components are **never** deleted; mark `status: deprecated`
3. Every `Decision` must carry at least one impact `Tag` (`security`, `performance`, `architecture`)
4. Every `analyze`/`detect` run **must** persist results as a `graph-*` entity **and** link affected Components

## 6. Workflow State Machine

| Phase     | Purpose                                                    | Exit Condition                               |
| --------- | ---------------------------------------------------------- | -------------------------------------------- |
| ANALYZE   | Understand task, gather MCP context & graph topology       | Blueprint drafted                            |
| BLUEPRINT | Produce numbered Plan and propose a Decision               | User replies **APPROVED**                    |
| CONSTRUCT | Execute Plan step-by-step, reflecting changes in MCP graph | All Plan steps succeed                       |
| VALIDATE  | Run tests/linters, record summary                          | Tests green → DONE; else return to CONSTRUCT |
| ROLLBACK  | (auto) Undo partial work on unrecoverable error            | Rollback succeeds → ANALYZE                  |

## 7. Essential MCP Tool Patterns

### Initialize/Switch Branch

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_memory-bank",
    "arguments": {
      "operation": "init",
      "clientProjectRoot": "/Users/jokkeruokolainen/Documents/Solita/GenAI/Azure/MCP/kuzumem-mcp",
      "repository": "kuzumem-mcp",
      "branch": "feature/branch-name",
    },
  },
}
```

### Create Component

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_entity",
    "arguments": {
      "operation": "create",
      "entityType": "component",
      "id": "comp-ExampleName",
      "name": "Example Component",
      "kind": "service",
      "status": "active",
      "dependsOn": ["comp-OtherComponent"],
    },
  },
}
```

### Update Context

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_context",
    "arguments": {
      "operation": "update",
      "agent": "assistant",
      "summary": "one-line summary of work",
      "observation": "optional details",
      "repository": "kuzumem-mcp",
    },
  },
}
```

### Graph Analysis

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_analyze",
    "arguments": {
      "algorithm": "pagerank", // or "k-core", "louvain"
      "clientProjectRoot": "/Users/jokkeruokolainen/Documents/Solita/GenAI/Azure/MCP/kuzumem-mcp",
      "repository": "kuzumem-mcp",
      "graphName": "graph-pagerank-timestamp",
      "nodeTypes": ["Component"],
      "relationshipTypes": ["DEPENDS_ON"],
    },
  },
}
```

### Pattern Detection

```jsonc
{
  "tool": {
    "name": "mcp_KuzuMem-MCP_detect",
    "arguments": {
      "type": "cycles", // or "islands", "path", "strongly-connected", "weakly-connected"
      "repository": "kuzumem-mcp",
      "projectedGraphName": "graph-pagerank-timestamp",
      "nodeTableNames": ["Component"],
      "relationshipTableNames": ["DEPENDS_ON"],
    },
  },
}
```

## 8. Memory Hygiene Guidelines

| Memory Type                  | When to Write                                      |
| ---------------------------- | -------------------------------------------------- |
| Context (`ctx-*`)            | After every significant action or phase transition |
| Decision (`dec-*`)           | Blueprint creation & status updates                |
| Graph Projection (`graph-*`) | After every `analyze`/`detect` run                 |
| File (`file-*`)              | When adding/updating source files                  |
| Component/Rule/Tag           | When architecture evolves                          |

## 9. Quick Tool Reference

| Situation             | Recommended Tool                              |
| --------------------- | --------------------------------------------- |
| Need recent history   | `query → context`                             |
| Explore neighbourhood | `query → relationships`                       |
| Impact analysis       | `query → dependencies` + `analyze → pagerank` |
| Detect cycles/islands | `detect → cycles` / `detect → islands`        |
| Bulk onboarding       | `bulk-import → components/rules`              |

## 10. Error Handling

- Any MCP tool error → raise `Status: BLOCKED`, log details, await user direction
- Unrecoverable build/test failures → enter **ROLLBACK**: revert code changes or restore previous git commit
- Always log context after significant actions or errors

## 11. Change Control

- Configuration files are authoritative; updates require an approved `Decision` (`status: approved`)
- Agents may propose diff patches but **MUST NOT** commit without human review
- All transient state must be persisted through KuzuMem-MCP tools, not by editing configuration files

---

**Note:** This guideline ensures consistent interaction with the KuzuMem-MCP system while maintaining proper architectural governance and workflow state management.
