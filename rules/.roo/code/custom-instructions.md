KuzuMem_MCP_strategy:

# ──────────────────────────────────────────────

  initialization: |-
    <thinking> CHECK KuzuMem-MCP SET-UP </thinking>
    <thinking>
      • Ensure KuzuMem-MCP server is registered.  
      • Resolve current Git branch → ${branch} (default main).
      • Determine client project root → ${clientProjectRoot}.
      • Synthetic repo-ID = ${repository}:${branch}.  
      • Does a memory bank exist for this repo-ID?  
        – yes → if_memory_bank_exists  
        – no  → if_no_memory_bank  
    </thinking>
    <list_resources><server_name>KuzuMem-MCP</server_name></list_resources>

# ──────────────────────────────────────────────

  if_no_memory_bank: |-
    1. Tell user:  
       "No KuzuMem-MCP memory bank for **${repository}** on branch **${branch}**.  
       Switch to *Architect mode* to create one?"  
    2. If user declines →  
       • Reply "[MEMORY BANK: INACTIVE]" and proceed / ask follow-up.  
    3. If user accepts →  
       • Switch to Architect mode (creation handled there).

# ──────────────────────────────────────────────

  if_memory_bank_exists: |-
    <thinking> READ MEMORY-BANK DATA </thinking>
    1. get-metadata  
    2. get-context --latest true --limit 10  
    3. Enumerate components; per critical one:  
       • get-component-dependencies  
       • get-component-dependents  
    4. governing items → get-governing-items-for-component  
    5. Reply "[MEMORY BANK: ACTIVE]"; if no task → ask_followup_question.

# ──────────────────────────────────────────────

  general:
    status_prefix: "[MEMORY BANK: ACTIVE] | [MEMORY BANK: INACTIVE]"
    response_format: |-
      Return either  
        • JSON tool call {"tool": {"name": "...", "arguments": {...}}}  
        • Plain Markdown if no tool call.
    guardrails:
      - "Always include --clientProjectRoot and --branch; Code mode can write to memory bank."
      - "Strip secrets; unsafe → REFUSE: <reason>."
    token_budget: 800
    override_file_restrictions: true
    override_mode_restrictions: true

# ──────────────────────────────────────────────

  memory_bank_updates:
    frequency: "Update continuously when significant project changes occur."
    decisions:
      trigger: "Significant architectural decision."
      format: |-
        add-decision {repository} dec-{YYYYMMDD}-{slug} --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --name "{Decision Name}" --context "{Context}" --date {YYYY-MM-DD}
    metadata:
      trigger: "Project-level info changes."
      format: |-
        update-metadata {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --metadata {json}
    components:
      trigger: "New or modified architectural component."
      format: |-
        add-component {repository} comp-{Name} --clientProjectRoot {clientProjectRoot} --branch {branch} --name "{Name}" \
        --kind "{Kind}" --depends_on [...] --status active|deprecated|planned
    contexts:
      trigger: "Focus change or significant progress."
      format: |-
        update-context {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --agent {agent} \
        --summary "{Summary}" --decision "{Decision}" \
        --observation "{Observation}"
    rules:
      trigger: "New coding / architectural rule."
      format: |-
        add-rule {repository} rule-{category}-vX.Y.Z --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --name "{Rule}" --created {YYYY-MM-DD} --triggers [...] \
        --content "{Content}" --status active

# ──────────────────────────────────────────────

  graph_analysis:
    dependencies:
      format: |
        get-component-dependencies {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --componentId comp-{Name}
      purpose: "Upstream dependencies of a component."
    dependents:
      format: |
        get-component-dependents {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --componentId comp-{Name}
      purpose: "Downstream impact of a component."
    governing_items:
      format: |
        get-governing-items-for-component {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --componentId comp-{Name}
      purpose: "Decisions & rules governing a component."
    contextual_history:
      format: |
        get-item-contextual-history {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --itemType {Component|Decision|Rule} --itemId {ID}
      purpose: "Evolution of any item."
    related_items:
      format: |
        get-related-items {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --startItemId {ID} \
        --depth 1 --relationshipFilter "DEPENDS_ON,CONTEXT_OF" \
        --targetNodeTypeFilter "Component,Decision"
      purpose: "Neighbourhood exploration."
    pagerank:
      format: |
        pagerank {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --projectedGraphName influence --nodeTableNames ["Component","Decision"] \
        --relationshipTableNames ["DEPENDS_ON","CONTEXT_OF"]
      purpose: "Most influential nodes."
    community_detection:
      format: |
        louvain_community_detection {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --projectedGraphName modules --nodeTableNames ["Component"] \
        --relationshipTableNames ["DEPENDS_ON"]
      purpose: "Subsystem grouping."
    dependency_cycles:
      format: |
        strongly_connected_components {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --projectedGraphName cycles --nodeTableNames ["Component"] \
        --relationshipTableNames ["DEPENDS_ON"]
      purpose: "Circular dependencies."
    core_components:
      format: |
        k_core_decomposition {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --projectedGraphName core --nodeTableNames ["Component"] \
        --relationshipTableNames ["DEPENDS_ON"] --k 2
      purpose: "Critical core."
    isolated_subsystems:
      format: |
        weakly_connected_components {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} \
        --projectedGraphName islands --nodeTableNames ["Component"] \
        --relationshipTableNames ["DEPENDS_ON"]
      purpose: "Isolated subsystems."
    path_analysis:
      format: |
        shortest_path {repository} --clientProjectRoot {clientProjectRoot} --branch {branch} --projectedGraphName path \
        --nodeTableNames ["Component"] --relationshipTableNames ["DEPENDS_ON"] \
        --startNodeId {startId} --endNodeId {endId}
      purpose: "Shortest dependency path."

# ──────────────────────────────────────────────

  umb:
    trigger: "^(Update Memory Bank|UMB)$"
    ack: "[MEMORY BANK: UPDATING]"
    core_update_process: |-
      1. Review chat → extract code changes, patterns, new libs.  
      2. Update metadata, components, decisions, context, rules (branch-aware).  
      3. Confirm successful writes and summarise branch-specific updates.

# ──────────────────────────────────────────────

  best_practices:
    id_conventions:
      - "Component: comp-{Name}"
      - "Decision: dec-{YYYYMMDD}-{slug}"
      - "Rule: rule-{category}-v{semver}"
    branch_awareness: |-
      • Always pass --clientProjectRoot and --branch; memory is isolated.  
      • Repo-ID pattern ${repository}:${branch}.  
      • No cross-branch leakage.
      • Each client project has its own isolated database in its root directory.
    code_component_documentation: |-
      • Document major classes/modules as components.  
      • Maintain depends_on, kind, status.  
      • Relate decisions to components via graph tools.
    implementation_decisions: |-
      • Capture algorithm choices, perf optimisations, error strategies.  
      • Link to affected components.
    graph_usage: |-
      • PageRank → critical nodes.  
      • Community detection → modules.  
      • SCC → cycles. WCC → islands.  
      • k-core → dense subsystems.  
      • shortest-path → impact tracing.
