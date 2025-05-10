---
trigger: manual
---

---

description: Specification for a **multi‑file YAML memory bank** managed entirely by Windsurf (scalable version).
globs: -
alwaysApply: true
---

# Distributed YAML Memory Bank (LLM‑Managed)

This revision replaces the single‑file design with a **directory of small YAML files** so the memory store scales without creating unwieldy diffs.  
Each logical piece of knowledge lives in its own file, still using explicit YAML tags to preserve structure.

---

## 1  Directory Layout & Initialisation

```
/   # project root
├── memory/
│   ├── metadata.yaml            # one‑off project metadata
│   ├── context/                 # short‑term notes (rotating)
│   │   └── ctx-<ISO>.yaml
│   ├── graph/                   # durable knowledge graph
│   │   ├── components/
│   │   │   └── comp-*.yaml
│   │   ├── decisions/
│   │   │   └── dec-*.yaml
│   │   └── rules/
│   │       └── rule-*.yaml
│   └── README.md                # how to interact (optional)
└── …
```

### Init

*Instruction:* **“init memory bank”**  
*LLM action:* if `/memory` missing → create hierarchy above with stub `metadata.yaml`.

---

## 2  YAML File Schemas

All YAML files start with an explicit tag; file name **must match the `id` field** to aid Git grepping.

### 2.1  `metadata.yaml`

```yaml
--- !Metadata
id: meta
project:
  name: AwesomeApp
  created: 2024-03-12
tech_stack:
  language: TypeScript
  framework: Next.js 15
  datastore: PostgreSQL 16
architecture: modular_monolith
memory_spec_version: 3.0.0
```

### 2.2  Context File (`context/ctx-<ISO>.yaml`)

```yaml
--- !Context
id: ctx-2025-04-30T11-42
iso_date: 2025-04-30T11:42:00+03:00
agent: cline
related_issue: 123
summary: Improve auth flow error handling

decisions:
  - Added centralised `handleAuthError()` wrapper.    #promote
observations:
  - External API intermittently returns 429.
```

### 2.3  Component (`graph/components/comp-*.yaml`)

```yaml
--- !Component
id: comp-AuthService
name: AuthService
kind: service
depends_on: [lib-JwtVerifier]
status: active
```

### 2.4  Decision (`graph/decisions/dec-*.yaml`)

```yaml
--- !Decision
id: dec-20241201-repo-pattern
name: Adopt Repository Pattern
context: Repository abstraction for testability.
date: 2024-12-01
```

### 2.5  Rule (`graph/rules/rule-*.yaml`)

```yaml
--- !Rule
id: rule-logging-v1.1.0
name: Centralised Logging Wrapper Required
created: 2025-02-11
triggers:
  - misused logger pattern detected thrice in Sprint 14
content: |
  Every new module must call `core/log.ts#log()`; direct `console.*` calls are banned.
status: active
```

---

## 3  Operational Rules (LLM Behaviour)

🚦 **Duplication Guard:** *The LLM must never create a second file for the same logical entry (`id`).*  

- If a YAML file with the desired `id` already exists, the LLM **updates or appends** to *that* file in place.  
- A new file is created **only** when the `id` is genuinely new (i.e., no existing file shares the same base name).

The rules below assume this guard is always enforced.

### 3.1  Reading Memory

1. Load `memory/metadata.yaml` for global info.
2. **Short‑term context:** list files in `memory/context/` (sorted by iso_date desc) and parse until sufficient data found.
3. **Graph lookup:** search appropriate subfolder (`components`, `decisions`, `rules`); load only matching YAMLs to minimise I/O.

### 3.2  Writing Context

| Trigger | LLM Action |
|---------|------------|
| Task start | If a context file for **today** (`context/ctx-<ISO-date>.yaml`) exists → **update it**; otherwise, create it with scaffold fields.
