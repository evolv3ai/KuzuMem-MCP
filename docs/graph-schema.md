# KuzuDB Graph Schema (Post-Refactor for Branch Awareness)

## Key Concept: Composite Unique IDs

To ensure branch awareness and uniqueness of items (Metadata, Context, Component, Decision, Rule) across different repositories and branches, a `graph_unique_id` is used as the `PRIMARY KEY` for these node tables. This ID is a string constructed programmatically by combining the repository name, the item's specific branch, and the item's logical ID.

Format: `graph_unique_id = "<repository_name>:<item_branch>:<item_id>"`

Each entity also stores its logical `id` (formerly `yaml_id`) and its `branch` as separate properties.

## Node Tables

### Repository

- id: STRING (Primary Key, format: `name:branch`)
- name: STRING
- branch: STRING
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### Metadata

- graph_unique_id: STRING (Primary Key, format: `repositoryName:branch:id`)
- id: STRING (Logical ID, e.g., "meta")
- name: STRING (Often the repository name)
- content: STRING (JSON string of metadata content)
- branch: STRING (Branch this metadata instance pertains to)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### Context

- graph_unique_id: STRING (Primary Key, format: `repositoryName:branch:id`)
- id: STRING (Logical ID, e.g., "context-YYYY-MM-DD")
- name: STRING
- summary: STRING
- iso_date: DATE (The date this context primarily refers to)
- branch: STRING (Branch this context instance pertains to)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### Component

- graph_unique_id: STRING (Primary Key, format: `repositoryName:branch:id`)
- id: STRING (Logical ID)
- name: STRING
- kind: STRING
- status: STRING
- branch: STRING (Branch this component instance pertains to)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### Decision

- graph_unique_id: STRING (Primary Key, format: `repositoryName:branch:id`)
- id: STRING (Logical ID)
- name: STRING
- context: STRING (Descriptive text, not a link)
- date: DATE (Date of the decision)
- branch: STRING (Branch this decision instance pertains to)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

### Rule

- graph_unique_id: STRING (Primary Key, format: `repositoryName:branch:id`)
- id: STRING (Logical ID)
- name: STRING
- content: STRING
- created: DATE (Date the rule was defined)
- triggers: STRING[]
- status: STRING
- branch: STRING (Branch this rule instance pertains to)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP

## Mermaid Diagram

```mermaid
flowchart TD
  classDef pk fill:#f96,stroke:#333,stroke-width:2px
  classDef branchPoint fill:#bbdefb,stroke:#333,stroke-width:2px

  Repository["Repository<br/>[PK] id (name:branch)<br/>name: STRING<br/>branch: STRING<br/>..."]
  Metadata["Metadata<br/>[PK] graph_unique_id<br/>id: STRING<br/>branch: STRING<br/>name: STRING<br/>content: STRING<br/>..."]
  Context["Context<br/>[PK] graph_unique_id<br/>id: STRING<br/>branch: STRING<br/>name: STRING<br/>summary: STRING<br/>iso_date: DATE<br/>..."]
  Component["Component<br/>[PK] graph_unique_id<br/>id: STRING<br/>branch: STRING<br/>name: STRING<br/>kind: STRING<br/>status: STRING<br/>..."]
  Decision["Decision<br/>[PK] graph_unique_id<br/>id: STRING<br/>branch: STRING<br/>name: STRING<br/>context: STRING<br/>date: DATE<br/>..."]
  Rule["Rule<br/>[PK] graph_unique_id<br/>id: STRING<br/>branch: STRING<br/>name: STRING<br/>content: STRING<br/>created: DATE<br/>triggers: STRING[]<br/>status: STRING<br/>..."]

  Repository -- "HAS_METADATA" --> Metadata
  Repository -- "HAS_CONTEXT" --> Context
  Repository -- "HAS_COMPONENT" --> Component
  Repository -- "HAS_DECISION" --> Decision
  Repository -- "HAS_RULE" --> Rule

  Component -- "DEPENDS_ON" --> Component
  Context -- "CONTEXT_OF" --> Component
  Context -- "CONTEXT_OF_DECISION" --> Decision
  Context -- "CONTEXT_OF_RULE" --> Rule
  Decision -- "DECISION_ON" --> Component

  class Repository branchPoint
  class Metadata,Context,Component,Decision,Rule pk
```

## Relationship Tables

- HAS_METADATA (FROM Repository TO Metadata)
- HAS_CONTEXT (FROM Repository TO Context)
- HAS_COMPONENT (FROM Repository TO Component)
- HAS_DECISION (FROM Repository TO Decision)
- HAS_RULE (FROM Repository TO Rule)
- DEPENDS_ON (FROM Component TO Component)
- CONTEXT_OF (FROM Context TO Component)
- CONTEXT_OF_DECISION (FROM Context TO Decision)
- CONTEXT_OF_RULE (FROM Context TO Rule)
- DECISION_ON (FROM Decision TO Component)
