KuzuMemo_MCP_strategy:
initialization: |
<thinking> - **CHECK FOR KuzuMemo-MCP USAGE (KuzuDB/Branch-aware):**
</thinking>
<thinking>
_Check if the MCP server with KuzuMemo-MCP is registered.
_Check if a memory bank repository exists for the current project and branch.
_All operations must include branch parameter (defaulting to 'main') to maintain proper isolation.
_Repository operations use a synthetic ID composed of name and branch.
</thinking>
<list_resources>
<server_name>KuzuMemo-MCP</server_name>
</list_resources>
<thinking>
_If memory bank repository exists, skip to `if_memory_bank_exists`.
_Check both the repository name and branch parameter.
_For feature-specific work, check feature branch first, then main branch.
</thinking>
<thinking> - **CHECK FOR KuzuMemo-MCP USAGE:**
</thinking>
<thinking>
_First, check if the MCP server with KuzuMemo-MCP is registered.
_Check if a memory bank repository exists for the current project, considering the appropriate branch.
_Remember that all knowledge is isolated by branch in KuzuDB graph model.
</thinking>
<list_resources>
<server_name>KuzuMemo-MCP</server_name>
</list_resources>
<thinking>
_If memory bank repository exists, skip immediately to `if_memory_bank_exists`.
_If no memory bank exists for this branch but exists for another branch, consider if knowledge should be shared.
</thinking>
if_no_memory_bank: | 1. **Inform the User:**  
 "No Memory Bank repository was found for this project. I recommend creating one to maintain project context." 2. **Offer Initialization:**
Ask the user if they would like to initialize a Memory Bank repository. 3. **Conditional Actions:**
_If the user declines:
<thinking>
I need to proceed with the task without Memory Bank functionality.
</thinking>
a. Inform the user that the Memory Bank repository will not be created.
b. Set the status to '[MEMORY BANK: INACTIVE]'.
c. Proceed with the task using the current context if needed.
_If the user agrees:
<thinking>
I need to initialize the memory bank repository and add initial metadata.
</thinking>
a. Initialize the memory bank repository using the `init-memory-bank` tool.
b. Create initial metadata with `update-metadata`.
c. Set status to '[MEMORY BANK: ACTIVE]' and inform the user that the Memory Bank has been initialized.
d. Proceed with the task using the newly created memory bank context.
if_memory_bank_exists: |
**READ MEMORY BANK REPOSITORY DATA**
<thinking>
I will read memory bank repository data in a logical sequence based on dependency relationships.
</thinking>
Plan: Read repository data in an order that allows understanding of system architecture and context. 1. First, read project metadata using `get-metadata` to understand project scope, technologies, and goals 2. Next, read recent context history using `get-context` with latest=true to understand recent work 3. Identify key components and their relationships:
a. List active components and their dependencies
b. For critical components, check dependencies using `get-component-dependencies`
c. For critical components, check dependents using `get-component-dependents` 4. Read architectural decisions using appropriate query 5. Read relevant rules using appropriate query 6. If needed for deep architectural understanding, consider graph algorithm tools:
a. `mcp_pagerank` to identify central components
b. `strongly-connected-components` to identify circular dependencies
c. `louvain-community-detection` to identify natural subsystems 7. Set status to [MEMORY BANK: ACTIVE] and inform user. 8. Proceed with the task using the context from the Memory Bank.

general:
status_prefix: "Begin EVERY response with either '[MEMORY BANK: ACTIVE]' or '[MEMORY BANK: INACTIVE]', according to the current state of the Memory Bank."

memory_bank_updates:
frequency: "UPDATE MEMORY BANK THROUGHOUT THE CHAT SESSION, WHEN SIGNIFICANT CHANGES OCCUR IN THE PROJECT."

# Memory Bank Management Tools

init_memory_bank:
trigger: "When starting a new project or creating a new branch."
action: |
<thinking>
I need to initialize a new memory bank using `init-memory-bank`.
The repository name and branch should be specified to create proper isolation.
</thinking>
format: "init-memory-bank [repository] --branch [branch]"

update_metadata:
trigger: "When the high-level project description, goals, features, or overall architecture changes significantly."
action: |
<thinking>
A fundamental change has occurred which warrants an update to the project metadata.
I should use `update-metadata` to modify the repository metadata.
</thinking>
format: "update-metadata [repository] --branch [branch] --metadata {\"project\": {\"name\": \"[Project Name]\", \"technologies\": [\"[Tech1]\", \"[Tech2]\"]}}"

get_metadata:
trigger: "When starting a new session or needing to reference project-wide information."
action: |
<thinking>
I need to retrieve project metadata to understand the project scope and technologies.
</thinking>
format: "get-metadata [repository] --branch [branch]"

update_context:
trigger: "When the current focus of work changes, or when significant progress is made."
action: |
<thinking>
I need to update the Memory Bank with a new context entry using `update-context`.
The context should include the agent name, a summary, and detailed observations.
</thinking>
format: "update-context [repository] --branch [branch] --agent \"[Agent Name]\" --summary \"[Summary]\" --observation \"[Detailed Observation]\""

get_context:
trigger: "When starting a new session or before making recommendations."
action: |
<thinking>
I need to retrieve recent context history to understand recent work.
</thinking>
format: "get-context [repository] --branch [branch] --latest true"

add_component:
trigger: "When new architectural components are introduced or existing ones are modified."
action: |
<thinking>
I need to update the Memory Bank with a new component using `add-component`.
The component should include a name, kind, dependencies, and status.
</thinking>
format: "add-component [repository] --branch [branch] --id comp-[ComponentName] --name \"[Component Name]\" --kind \"[Component Kind]\" --depends_on [\"comp-Dependency1\", \"comp-Dependency2\"] --status \"active\""

add_decision:
trigger: "When a significant architectural decision is made (new component, data flow change, technology choice, etc.)."
action: |
<thinking>
I need to update the Memory Bank with a new decision record using `add-decision`.
The decision should include a descriptive name, context information, and the current date.
</thinking>
format: "add-decision [repository] --branch [branch] --id dec-[YYYYMMDD]-[brief-description] --name \"[Decision Name]\" --context \"[Context Information]\" --date \"[YYYY-MM-DD]\""

add_rule:
trigger: "When new coding standards or architectural guidelines are established."
action: |
<thinking>
I need to update the Memory Bank with a new rule using `add-rule`.
The rule should include a name, creation date, triggers, content, and status.
</thinking>
format: "add-rule [repository] --branch [branch] --id rule-[category]-v[X.Y.Z] --name \"[Rule Name]\" --created \"[YYYY-MM-DD]\" --triggers [\"trigger1\",\"trigger2\"] --content \"[Rule Content]\" --status \"active\""

# Graph Traversal Tools

get_component_dependencies:
trigger: "Before modifying components to understand impact, or when explaining dependency chains."
action: |
<thinking>
I need to find all components this component depends on.
</thinking>
format: "get-component-dependencies [repository] --branch [branch] --componentId \"comp-[ComponentName]\""

get_component_dependents:
trigger: "When evaluating change impact or checking which components might break during refactoring."
action: |
<thinking>
I need to find all components that depend on this component.
</thinking>
format: "get-component-dependents [repository] --branch [branch] --componentId \"comp-[ComponentName]\""

get_governing_items_for_component:
trigger: "Before generating component code or ensuring compliance with standards."
action: |
<thinking>
I need to find all decisions and rules that affect this component.
</thinking>
format: "get-governing-items-for-component [repository] --branch [branch] --componentId \"comp-[ComponentName]\""

get_item_contextual_history:
trigger: "When trying to understand component evolution, decision history, or how rules have been applied."
action: |
<thinking>
I need to retrieve the context history for this item.
</thinking>
format: "get-item-contextual-history [repository] --branch [branch] --itemId \"[ItemID]\" --itemType \"[Component|Decision|Rule]\""

get_related_items:
trigger: "For general relationship exploration or understanding connected items."
action: |
<thinking>
I need to find all items related to this item within N hops.
</thinking>
format: "get-related-items [repository] --branch [branch] --startItemId \"[ItemID]\" --depth [1-3] --relationshipFilter \"DEPENDS_ON,CONTEXT_OF\" --targetNodeTypeFilter \"Component,Decision\""

# Graph Algorithm Tools

mcp_pagerank:
trigger: "When identifying critical components, understanding architectural importance, or prioritizing refactoring."
action: |
<thinking>
I need to identify influential or central components using PageRank algorithm.
</thinking>
format: "mcp_pagerank [repository] --branch [branch] --projectedGraphName \"componentAnalysis\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"

louvain_community_detection:
trigger: "At project start to understand existing module structure, when reorganizing code, or for architecture visualization."
action: |
<thinking>
I need to discover natural groupings of components using community detection.
</thinking>
format: "louvain-community-detection [repository] --branch [branch] --projectedGraphName \"communityAnalysis\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"

k_core_decomposition:
trigger: "When identifying tightly coupled subsystems or finding core architectural components."
action: |
<thinking>
I need to find densely connected component clusters using k-core decomposition.
</thinking>
format: "k-core-decomposition [repository] --branch [branch] --projectedGraphName \"kCoreAnalysis\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"] --k [2]"

strongly_connected_components:
trigger: "During code quality assessment, before major refactoring, or when diagnosing architectural issues."
action: |
<thinking>
I need to detect circular dependencies in components.
</thinking>
format: "strongly-connected-components [repository] --branch [branch] --projectedGraphName \"cycleAnalysis\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"

weakly_connected_components:
trigger: "When identifying isolated subsystems, ensuring full system coverage, or detecting disconnected parts of the architecture."
action: |
<thinking>
I need to find all isolated 'islands' or distinct topics within the memory bank.
</thinking>
format: "weakly-connected-components [repository] --branch [branch] --projectedGraphName \"islandAnalysis\" --nodeTableNames [\"Component\", \"Decision\", \"Rule\", \"Context\"] --relationshipTableNames [\"DEPENDS_ON\", \"CONTEXT_OF\", \"RELATED_TO\"]"

shortest_path:
trigger: "When understanding the relationship between two seemingly unrelated components or decisions, or tracing impact paths, explaining component relationships, or analyzing integration points."
action: |
<thinking>
I need to find the most direct relationship or sequence of connections between two memory items.
</thinking>
format: "shortest-path [repository] --branch [branch] --projectedGraphName \"pathAnalysis\" --nodeTableNames [\"Component\", \"Decision\", \"Rule\", \"Context\"] --relationshipTableNames [\"DEPENDS_ON\", \"CONTEXT_OF\", \"RELATED_TO\"] --startNodeId \"startId\" --endNodeId \"endId\""

umb:
trigger: "^(Update Memory Bank|UMB)$"
instructions: - "Halt Current Task: Stop current activity" - "Acknowledge Command: '[MEMORY BANK: UPDATING]'" - "Review Chat History"
user_acknowledgement_text: "[MEMORY BANK: UPDATING]"
core_update_process: | 1. Current Session Review: - Analyze complete chat history - Extract significant architectural decisions - Identify new components or modules - Track rule or standard changes 2. Comprehensive Updates: - Update metadata if project scope changed - Add context entries for session highlights - Document new components discovered - Record architectural decisions made - Establish new rules if standards were set 3. Memory Bank Synchronization: - Ensure all MCP tool calls are made - Verify successful updates - Provide summary of changes made
task_focus: "During a UMB update, focus on capturing any architectural decisions, component changes, or rule modifications made during the chat session. Use the appropriate MCP tools to record these changes in the memory bank repository."
post_umb_actions: - "Memory Bank fully synchronized" - "All architectural context preserved" - "Session decisions recorded" - "Component relationships updated" - "Rules and standards established"

KuzuMemo_MCP_best_practices:
id_conventions: | - Component: `comp-[DescriptiveName]` (e.g., comp-AuthService, comp-DataAccess) - Decision: `dec-[YYYYMMDD]-[brief-description]` for major decisions with date reference - Rule: `rule-[category]-[version]` where version can follow semantic versioning
branch_handling: | - Branch parameter directly corresponds to Git branches in the project - When user switches Git branches, switch memory bank branch parameter to match - Always include branch parameter in every MCP tool call to maintain isolation - Memory is fully isolated between branches (e.g., 'main', 'feature/auth', 'bugfix/login') - Synthetic repository IDs use pattern: name + ':' + branch as required by KuzuDB - Knowledge from one branch is not visible to other branches unless explicitly copied
component_guidelines: | - Clearly define component dependencies using the depends_on parameter - Set explicit status (active/deprecated/planned) for components - Use descriptive names that reflect component purpose - Maintain proper hierarchy with parent-child relationships
decision_guidelines: | - Include detailed context explaining reasoning behind decisions - Associate decisions with affected components when possible - Record date information for historical tracking - Document alternatives considered and reasons for rejection
rule_guidelines: | - Add specific triggers to indicate when rules apply - Only enforce rules with status="active" - Use content field to provide clear, actionable guidance - Version rules when they evolve over time
graph_usage: | - Use PageRank to identify critical components - Use community detection to identify natural subsystems - Use cycle detection to identify architectural issues - Use path analysis to understand component relationships
