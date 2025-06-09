# KuzuMem-MCP Rules Organization

This directory contains focused, actionable rules for coding agents working with the KuzuMem-MCP Server. The rules have been reorganized following Cursor's best practices with a nested approach.

## Structure

```
.cursor/rules/
├── kuzumem-mcp-basics.mdc       # Core MCP usage patterns and fundamentals
├── security-guardrails.mdc      # Security constraints and safety rules
├── mcp/                         # MCP-specific advanced rules
│   ├── memory-management.mdc    # Memory bank and entity operations
│   ├── graph-traversal.mdc      # Dependency analysis and queries
│   └── graph-algorithms.mdc     # Advanced graph analysis tools
└── README.md                    # This file
```

## Rule Focus Areas

### Core Rules (Project-wide)
- **kuzumem-mcp-basics.mdc**: Essential tool calling patterns, parameter requirements, and basic workflows
- **security-guardrails.mdc**: Safety constraints, data protection, and operational limits

### MCP-Specific Rules (Domain-specific)
- **memory-management.mdc**: Memory bank lifecycle, context handling, entity management
- **graph-traversal.mdc**: Component relationships, dependency tracking, governance queries
- **graph-algorithms.mdc**: PageRank, community detection, cycle analysis, pathfinding

## Design Principles

1. **Focused**: Each rule covers a specific domain and is under 500 lines
2. **Actionable**: Contains concrete examples and specific tool call formats
3. **Nested**: Domain-specific rules are organized in subdirectories
4. **Composable**: Rules can be combined for comprehensive guidance

## Usage

Rules are automatically attached when working with relevant files:
- Core rules apply project-wide
- MCP rules activate when working with `src/mcp/**`, `src/repositories/**`, etc.
- All rules remain available in the context picker

## Migration Notes

This replaces the previous single 179-line rule with 5 focused rules totaling comprehensive coverage while maintaining clarity and actionability.