memory_bank_strategy:
  initialization: |
      <thinking>
      - **CHECK FOR ADVANCED MEMORY BANK (KuzuDB/Branch-aware):**
      </thinking>
      <thinking>
      * First, check if the Advanced Memory Bank MCP server is registered.
      * Remember branch parameter directly corresponds to Git branches in the project.
      * Memory is fully isolated between branches and synthetic IDs use pattern: name + ':' + branch.
      </thinking>
      <list_resources>
      <server_name>advanced-memory-bank-mcp</server_name>
      </list_resources>
      <thinking>
      * If the Advanced Memory Bank server is found, determine current Git branch the user is on.
      * Check if a repository exists for this project with that branch.
      * If a repository exists, skip to `if_memory_bank_exists`.
      </thinking>
      <thinking>
      - **CHECK FOR ADVANCED MEMORY BANK:**
      </thinking>
          <thinking>
        * First, check if the Advanced Memory Bank MCP server is registered.
        * For the current project, check if repositories exist in any branch.
          </thinking>
          <list_resources>
          <server_name>advanced-memory-bank-mcp</server_name>
          </list_resources>
          <thinking>
        * If the Advanced Memory Bank server is found, check if a repository exists for this project.
        * If a repository exists but not for current branch, note this for the user.
        * If a repository exists for current branch, skip immediately to `if_memory_bank_exists`.
          </thinking>
  if_no_memory_bank: |
      1. **Inform the User:**  
          "No Advanced Memory Bank repository was found for this project on the current Git branch. I recommend creating one to maintain architectural knowledge and technical decisions. Would you like to switch to Architect mode to initialize one?"
      2. **Conditional Actions:**
         *If the user declines:
          <thinking>
          I need to proceed with the task without Memory Bank functionality.
          </thinking>
          a. Inform the user that the Memory Bank will not be created.
          b. Set the status to '[MEMORY BANK: INACTIVE]'.
          c. Proceed with the task using the current context if needed or if no task is provided, use the `ask_followup_question` tool.
         * If the user agrees:
          Switch to Architect mode to create the Memory Bank repository.
  if_memory_bank_exists: |
        **READ MEMORY BANK REPOSITORY DATA**
        <thinking>
        I will read memory bank repository data in a logical sequence based on dependency relationships.
        </thinking>
        Plan: Read repository data in an order that allows understanding of system architecture and context.
        1. First, read project metadata using `get-metadata` to understand project scope, technologies, and goals
        2. Next, read recent context history using `get-context` with latest=true to understand recent work
        3. Identify key components and their relationships:
           a. List active components with their dependencies 
           b. For critical components, check dependencies using `get-component-dependencies`
           c. For critical components, check dependents using `get-component-dependents`
        4. Read relevant architectural decisions using appropriate query
        5. Read applicable rules using appropriate query
        6. Set status to [MEMORY BANK: ACTIVE] and inform user.
        7. Proceed with the task using the context from the Memory Bank or if no task is provided, use the `ask_followup_question` tool.

general:
  status_prefix: "Begin EVERY response with either '[MEMORY BANK: ACTIVE]' or '[MEMORY BANK: INACTIVE]', according to the current state of the Memory Bank."

memory_bank_updates:
  frequency: "UPDATE MEMORY BANK THROUGHOUT THE CHAT SESSION, WHEN SIGNIFICANT CHANGES OCCUR IN THE PROJECT."
  decisions:
    trigger: "When a significant architectural decision is made (new component, data flow change, technology choice, implementation approach, etc.). Use your judgment to determine significance."
    action: |
      <thinking>
      I need to update the Memory Bank with a new decision record using `add-decision`.
      The decision should include a descriptive name, context information, and the current date.
      Must include the branch parameter to isolate the decision to the current Git branch.
      </thinking>
      Use the MCP tool to record the decision. Make sure to include the repository name, branch, a well-formatted ID, and all required information.
    format: |
      "add-decision [repository] dec-[YYYYMMDD]-[brief-description] --branch [branch] --name \"[Decision Name]\" --context \"[Context Information]\" --date \"[YYYY-MM-DD]\""
  metadata:
    trigger: "When the high-level project description, goals, features, or overall architecture changes significantly. Use your judgment to determine significance."
    action: |
      <thinking>
      A fundamental change has occurred which warrants an update to the project metadata.
      I should use `update-metadata` to modify the repository metadata.
      Must include the branch parameter to update metadata for the current Git branch.
      </thinking>
      Use the MCP tool to update metadata. Ensure you're only updating relevant fields and maintaining existing values for others.
    format: "update-metadata [repository] --branch [branch] --metadata '{"key": "value"}'"
  components:
    trigger: "When new architectural components are introduced or existing ones are modified. Use your judgement."
    action: |
      <thinking>
      I need to update the Memory Bank with a new component using `add-component`.
      The component should include a name, kind, dependencies, and status.
      Must include the branch parameter to add the component to the current Git branch.
      </thinking>
      Use the MCP tool to add the component. Make sure to properly document all dependencies and relationships.
    format: "add-component [repository] comp-[ComponentName] --branch [branch] --name \"[Component Name]\" --kind \"[Component Kind]\" --depends_on [\"comp-Dependency1\",\"comp-Dependency2\"] --status \"active|deprecated|planned\""
  contexts:
    trigger: "When the current focus of work changes, or when significant progress is made. Use your judgement."
    action: |
      <thinking>
      I need to update the Memory Bank with a new context entry using `update-context`.
      The context should include the agent name, a summary, decisions, and observations.
      Must include the branch parameter to update context for the current Git branch.
      </thinking>
      Use the MCP tool to add context information. Be comprehensive yet concise in your summary.
    format: "update-context [repository] --branch [branch] --agent \"[Agent Name]\" --summary \"[Summary]\" --decision \"[Decision]\" --observation \"[Observation]\""
  rules:
    trigger: "When new coding standards or architectural guidelines are established. Use your judgement."
    action: |
      <thinking>
      I need to update the Memory Bank with a new rule using `add-rule`.
      The rule should include a name, creation date, triggers, content, and status.
      Must include the branch parameter to add the rule to the current Git branch.
      </thinking>
      Use the MCP tool to add the rule. Make sure the rule is clear, actionable, and properly categorized.
    format: "add-rule [repository] rule-[category]-v[X.Y.Z] --branch [branch] --name \"[Rule Name]\" --created \"[YYYY-MM-DD]\" --triggers \"[trigger1,trigger2]\" --content \"[Rule Content]\" --status \"active\""
  graph_analysis:
    trigger: "When understanding the relationships between components or analyzing architectural dependencies."
    action: |
      <thinking>
      I need to analyze the memory bank using graph algorithms to provide architectural insights.
      Must include the branch parameter to analyze the correct branch's data.
      Choose the appropriate graph algorithm based on the specific analysis need.
      </thinking>
    dependencies_and_dependents:
      format: "mcp_get_component_dependencies [repository] --branch [branch] --componentId \"comp-[ComponentName]\""
      purpose: "Identify all upstream dependencies of a specific component"
    dependents_format:
      format: "mcp_get_component_dependents [repository] --branch [branch] --componentId \"comp-[ComponentName]\""
      purpose: "Identify all downstream components that depend on a specific component"
    governing_items:
      format: "mcp_get_governing_items_for_component [repository] --branch [branch] --componentId \"comp-[ComponentName]\""
      purpose: "Find all decisions and rules that govern a specific component"
    contextual_history:
      format: "mcp_get_item_contextual_history [repository] --branch [branch] --itemType \"Component|Decision|Rule\" --itemId \"[ItemId]\""
      purpose: "Retrieve the full contextual history for a specific memory item"
    related_items:
      format: "mcp_get_related_items [repository] --branch [branch] --startItemId \"[ItemId]\" --depth 1 --relationshipFilter \"DEPENDS_ON,CONTEXT_OF\" --targetNodeTypeFilter \"Component,Decision\""
      purpose: "Find all memory items related to a specific item"
    graph_algorithms:
      pagerank:
        format: "mcp_pagerank [repository] --branch [branch] --projectedGraphName \"influenceAnalysis\" --nodeTableNames [\"Component\",\"Decision\"] --relationshipTableNames [\"DEPENDS_ON\",\"CONTEXT_OF\"]"
        purpose: "Identify the most influential/central components and decisions in the architecture"
      community_detection:  
        format: "louvain_community_detection [repository] --branch [branch] --projectedGraphName \"communityAnalysis\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"
        purpose: "Detect natural groupings/subsystems within the component architecture"
      dependency_cycles:
        format: "strongly_connected_components [repository] --branch [branch] --projectedGraphName \"cycleAnalysis\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"
        purpose: "Identify circular dependencies in the component architecture"
      core_components:
        format: "k_core_decomposition [repository] --branch [branch] --projectedGraphName \"coreAnalysis\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"] --k 2"
        purpose: "Find the core components that form the critical foundation of the system"
      isolated_subsystems:
        format: "weakly_connected_components [repository] --branch [branch] --projectedGraphName \"islandAnalysis\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"
        purpose: "Identify isolated subsystems that are not connected to the main architecture"
      path_analysis:
        format: "shortest_path [repository] --branch [branch] --projectedGraphName \"pathAnalysis\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"] --startNodeId \"[StartId]\" --endNodeId \"[EndId]\""
        purpose: "Find the shortest dependency path between two components"

umb:
  trigger: "^(Update Memory Bank|UMB)$"
  instructions:
    - "Halt Current Task: Stop current activity"
    - "Acknowledge Command: '[MEMORY BANK: UPDATING]'"
    - "Review Chat History"
  core_update_process: |
      1. Current Session Review:
          - Analyze complete chat history
          - Extract significant code changes and patterns
          - Identify new components or libraries introduced
          - Track implementation decisions and their rationale
      2. Comprehensive Updates by Branch:
          - Check current Git branch for memory bank operations
          - Update metadata if technology stack changed on current branch
          - Document new components or modules created with branch awareness
          - Record implementation decisions made, specific to current branch
          - Add context entries for coding patterns established in this branch
          - Create rules for coding standards that emerged in branch-specific work
      3. Memory Bank Synchronization:
          - Execute appropriate MCP tool calls with branch parameter
          - Ensure all relevant information is captured in correct branch
          - Verify successful updates within the branch's memory repository
          - Provide summary of changes made, highlighting branch-specific updates
  task_focus: "During a UMB update, focus on capturing code-related decisions, patterns, components, and standards that emerged during the implementation. Pay special attention to technical choices with architectural implications. Use the appropriate MCP tools to record these changes in the memory bank repository for the current Git branch."
  cross-mode_updates: "During a UMB update, ensure that all relevant implementation details from the coding session are captured and added to the Memory Bank for the current branch. This includes technical choices, design patterns, and code organization approaches that may influence future development."
  post_umb_actions:
    - "Memory Bank fully synchronized for current branch"
    - "Implementation decisions recorded in branch-specific repository"
    - "Component structures documented with proper branch isolation"
    - "Coding patterns established with branch awareness"
    - "Technical standards captured for current development branch"
  override_file_restrictions: true
  override_mode_restrictions: true

memory_bank_best_practices:
  id_conventions: |
    - Component: `comp-[DescriptiveName]` (e.g., comp-AuthService, comp-DataAccess)
    - Decision: `dec-[YYYYMMDD]-[brief-description]` for major decisions with date reference
    - Rule: `rule-[category]-[version]` where version can follow semantic versioning
  branch_awareness: |
    - Branch parameter directly corresponds to Git branches in the project
    - Memory is fully isolated between branches (e.g., 'main', 'feature/auth', 'bugfix/login')
    - Synthetic repository IDs use pattern: name + ':' + branch as required by KuzuDB
    - Knowledge from one branch is not visible to other branches unless explicitly copied
    - Always include branch parameter in every MCP tool call
  code_component_documentation: |
    - Document all major classes, modules, and services as components
    - Clearly identify dependencies between components using depends_on parameter
    - Specify the component kind (service, library, utility, etc.)
    - Maintain active/deprecated/planned status for evolving components
    - Link components to decisions using related-items queries when appropriate
  implementation_decisions: |
    - Record significant algorithm choices with clear rationale
    - Document performance optimization approaches with measured impacts
    - Note error handling strategies and exception flows
    - Explain architectural patterns applied in implementation
    - Link decisions to affected components using graph relationship tools
  graph_usage: |
    - Use PageRank to identify critical components in the codebase
    - Apply community detection to identify natural module groupings
    - Check for circular dependencies using strongly-connected-components
    - Identify isolated subsystems with weakly-connected-components
    - Analyze impact paths between components using shortest-path
    - Find densely interconnected subsystems using k-core-decomposition
