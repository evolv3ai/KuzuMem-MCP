KuzuMem_MCP_strategy:

# ──────────────────────────────────────────────

  initialization: |-
    <thinking> **CHECK KuzuMem-MCP CONFIGURATION** </thinking>
    <thinking>
      1. Verify that a KuzuMem-MCP server is registered.  
      2. Verify a memory-bank repository for `${repository}:${branch}`  
         (default branch = `main`).  
      3. Every MCP tool call **MUST** include `--clientProjectRoot` and `--branch`.  
      4. Synthetic repository ID = `${repository}:${branch}`.  
    </thinking>
    <list_resources><server_name>KuzuMem-MCP</server_name></list_resources>
    <thinking>
      • If the memory bank exists → jump to `if_memory_bank_exists`.  
      • Otherwise → jump to `if_no_memory_bank`.  
    </thinking>

  if_no_memory_bank: |-
    1. Prompt user —  
       "No memory bank found for this branch. Create one?"  
    2. If the user **declines** →  
       a. Reply `[MEMORY BANK: INACTIVE]` and continue without persistence.  
    3. If the user **accepts** →  
       a. `init-memory-bank`  
       b. Seed metadata via `update-metadata`  
       c. Reply `[MEMORY BANK: ACTIVE]`.

  if_memory_bank_exists: |-
    <thinking> READ MEMORY-BANK DATA </thinking>
    1. `get-metadata` → grasp scope & tech.  
    2. `get-context --latest true --limit 10` → recent work.  
    3. List components; for each critical one:  
       • `get-component-dependencies`  
       • `get-component-dependents`  
    4. `get-governing-items-for-component` as required.  
    5. Optional graph algos: `pagerank`, `louvain-community-detection`,  
       `strongly-connected-components`.  
    6. Reply `[MEMORY BANK: ACTIVE]` and proceed.

# ──────────────────────────────────────────────

  general:
    status_prefix: "[MEMORY BANK: ACTIVE] | [MEMORY BANK: INACTIVE]"
    response_format: |-
      Return **either**  
        • JSON tool call: {"tool": {"name": "...", "arguments": {...}}}  
        • Plain Markdown if no tool call.  
      No additional top-level keys.
    guardrails:
      - "Always pass `--clientProjectRoot` and `--branch`; never write to `main` without user request."
      - "Strip secrets; on unsafe request reply `REFUSE: <reason>`."
    token_budget: 800

# ──────────────────────────────────────────────

  memory_bank_updates:
    frequency: "Update whenever a significant project change occurs."
    umb_trigger_regex: "^(Update Memory Bank|UMB)$"
    umb_ack: "[MEMORY BANK: UPDATING]"
    umb_process: |-
      1. Review full chat history → extract new decisions, components, rules.  
      2. Sync via MCP tools.  
      3. Summarise the updates to the user.

# ──────────────────────────────────────────────

  memory_bank_management_tools:
    init_memory_bank:
      trigger: "New repository or branch."
      format: "init-memory-bank {repository} --clientProjectRoot {clientProjectRoot} --branch {branch}"
    update_metadata:
      trigger: "Project metadata changes."
      format: "update-metadata {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --metadata {...}"
    get_metadata:
      trigger: "Session start or repo info needed."
      format: "get-metadata {repository} --clientProjectRoot {clientProjectRoot} --branch {branch}"
    update_context:
      trigger: "Significant work progress or focus shift."
      format: "update-context {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --agent {agent} --summary \"...\" --observation \"...\""
    get_context:
      trigger: "Session start or pre-recommendation."
      format: "get-context {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --latest true --limit 10"
    add_component:
      trigger: "New or modified component."
      format: "add-component {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --id comp-{Name} --name \"...\" --kind \"...\" --depends_on [...] --status active"
    add_decision:
      trigger: "Architectural decision made."
      format: "add-decision {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --id dec-{YYYYMMDD}-{slug} --name \"...\" --context \"...\" --date {YYYY-MM-DD}"
    add_rule:
      trigger: "New coding or architectural rule."
      format: "add-rule {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --id rule-{category}-vX.Y.Z --name \"...\" --created {YYYY-MM-DD} --triggers [...] --content \"...\" --status active"

# ──────────────────────────────────────────────

  graph_traversal_tools:
    get_component_dependencies:
      trigger: "Before modifying a component."
      format: "get-component-dependencies {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --componentId comp-{Name}"
    get_component_dependents:
      trigger: "Assess downstream impact."
      format: "get-component-dependents {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --componentId comp-{Name}"
    get_governing_items_for_component:
      trigger: "Check standards before coding."
      format: "get-governing-items-for-component {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --componentId comp-{Name}"
    get_item_contextual_history:
      trigger: "Understand item evolution."
      format: "get-item-contextual-history {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --itemId {ID} --itemType {Component|Decision|Rule}"
    get_related_items:
      trigger: "Explore neighbourhood."
      format: "get-related-items {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --startItemId {ID} --depth 2 --relationshipFilter DEPENDS_ON --targetNodeTypeFilter Component"

# ──────────────────────────────────────────────

  graph_algorithm_tools:
    pagerank:
      trigger: "Detect critical components."
      format: "pagerank {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --projectedGraphName core --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"
    louvain_community_detection:
      trigger: "Discover subsystems."
      format: "louvain-community-detection {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --projectedGraphName modules --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"
    k_core_decomposition:
      trigger: "Find tightly coupled clusters."
      format: "k-core-decomposition {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --projectedGraphName cohesion --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"] --k 2"
    strongly_connected_components:
      trigger: "Detect circular dependencies."
      format: "strongly-connected-components {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --projectedGraphName cycles --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"
    weakly_connected_components:
      trigger: "Locate isolated subsystems."
      format: "weakly-connected-components {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --projectedGraphName islands --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"
    shortest_path:
      trigger: "Trace relationships between two items."
      format: "shortest-path {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --projectedGraphName path --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"] --startNodeId {startId} --endNodeId {endId}"

# ──────────────────────────────────────────────

  best_practices:
    id_conventions:
      - "Component: comp-{Name}"
      - "Decision: dec-{YYYYMMDD}-{slug}"
      - "Rule:    rule-{category}-v{semver}"
    branch_handling: |-
      • Always pass `--clientProjectRoot` and `--branch`.  
      • Synthetic ID = `${repository}:${branch}`.  
      • Knowledge is isolated per branch.
    component_guidelines: |-
      • Accurately set `depends_on`.  
      • Status = active / deprecated / planned.  
      • Use descriptive names.
    decision_guidelines: |-
      • Record context, date, alternatives.  
      • Link decisions to components.
    rule_guidelines: |-
      • Include `triggers` array.  
      • Version with semver.  
      • `status = active` for enforced rules.
    graph_usage: |-
      • PageRank → hotspots.  
      • Community detection → modules.  
      • Cycle detection → issues.  
      • Shortest-path → relation explanations.
