KuzuMem_MCP_strategy:
initialization: |
<thinking> - **CHECK FOR ADVANCED MEMORY BANK (KuzuDB/Branch-aware):**
</thinking>
<thinking>
_First, check if the KuzuMem-MCP MCP server is registered.
_ Remember branch parameter directly corresponds to Git branches in the project.
_Memory is fully isolated between branches and synthetic IDs use pattern: name + ':' + branch.
</thinking>
<list_resources>
<server_name>KuzuMem-MCP</server_name>
</list_resources>
<thinking>
_ If the KuzuMem-MCP server is found, determine current Git branch the user is on.
_Check if a repository exists for this project with that branch.
_ If a repository exists, skip to `if_memory_bank_exists`.
</thinking>
if_no_memory_bank: | 1. **Inform the User:**  
 "No KuzuMem-MCP repository was found for this project on the current Git branch. I recommend creating one to maintain debugging history and error patterns. Would you like to switch to Architect mode to initialize one?" 2. **Conditional Actions:**
_If the user declines:
<thinking>
I need to proceed with the task without Memory Bank functionality.
</thinking>
a. Inform the user that the Memory Bank will not be created.
b. Set the status to '[MEMORY BANK: INACTIVE]'.
c. Proceed with the task using the current context if needed or if no task is provided, use the `ask_followup_question` tool.
_If the user agrees:
Switch to Architect mode to create the Memory Bank for the current branch.
if_memory_bank_exists: |
**READ MEMORY BANK REPOSITORY DATA**
<thinking>
I will read memory bank repository data in a logical sequence focused on debugging-related information.
</thinking>
Plan: Read repository data in an order that prioritizes debugging history and patterns. 1. First, read project metadata using `get-metadata` to understand project scope and debugging tools 2. Next, read recent context history using `get-context` with latest=true to understand recent debugging work 3. Identify key error patterns and related components:
a. List components with known bugs or error patterns
b. Check dependencies of error-prone components using `get-component-dependencies`
c. Find decisions related to bug fixes using `get-governing-items-for-component` 4. Read debugging-related decisions using appropriate query 5. Read testing rules and error prevention guidelines using appropriate query 6. Set status to [MEMORY BANK: ACTIVE] and inform user. 7. Proceed with the debugging task using the context from the Memory Bank or if no task is provided, use the `ask_followup_question` tool.

general:
status_prefix: "Begin EVERY response with either '[MEMORY BANK: ACTIVE]' or '[MEMORY BANK: INACTIVE]', according to the current state of the Memory Bank."

memory_bank_updates:
frequency: "UPDATE MEMORY BANK THROUGHOUT THE CHAT SESSION, WHEN SIGNIFICANT CHANGES OCCUR IN THE PROJECT."
decisions:
trigger: "When a significant debugging decision is made (bug root cause, fix approach, testing strategy, etc.). Use your judgment to determine significance."
action: |
<thinking>
I need to update the Memory Bank with a new decision record using `add-decision`.
The decision should include a descriptive name, context information about the bug, and the current date.
Must include the branch parameter to isolate the decision to the current Git branch.
</thinking>
Use the MCP tool to record the debugging decision. Make sure to include the repository name, branch, a well-formatted ID, and all required information.
format: |
"add-decision [repository] dec-[YYYYMMDD]-[bug-id-description] --branch [branch] --name \"[Bug Fix Approach]\" --context \"[Bug Details and Fix Rationale]\" --date \"[YYYY-MM-DD]\""
metadata:
trigger: "When the high-level debugging approach or tools change significantly. Use your judgment to determine significance."
action: |
<thinking>
A fundamental change has occurred which warrants an update to the project metadata.
I should use `update-metadata` to modify the repository metadata with debugging-related information.
Must include the branch parameter to update metadata for the current Git branch.
</thinking>
Use the MCP tool to update metadata. Ensure you're updating with debugging-specific information while maintaining other metadata values.
format: "update-metadata [repository] --branch [branch] --metadata '{\"debugTools\": \"[tools]\", \"testingApproach\": \"[approach]\"}'"
components:
trigger: "When new error patterns are discovered or components with bugs are identified. Use your judgement."
action: |
<thinking>
I need to update the Memory Bank with a new component using `add-component`.
The component should include the name of the buggy module, its kind, dependencies, and current status (fixed/pending).
Must include the branch parameter to add the component to the current Git branch.
</thinking>
Use the MCP tool to add the component. Make sure to properly document all dependencies and include error-related information.
format: "add-component [repository] comp-[ComponentName] --branch [branch] --name \"[Component With Bug]\" --kind \"[Component Type]\" --depends_on [\"comp-Dependency1\",\"comp-Dependency2\"] --status \"fixed|pending\""
contexts:
trigger: "When debugging sessions produce important insights or when bug patterns emerge. Use your judgement."
action: |
<thinking>
I need to update the Memory Bank with a new context entry using `update-context`.
The context should include the debugging agent, a summary of findings, decisions made, and observations about error patterns.
Must include the branch parameter to update context for the current Git branch.
</thinking>
Use the MCP tool to add debugging context information. Be comprehensive about error patterns and resolution approaches.
format: "update-context [repository] --branch [branch] --agent \"[Debugger]\" --summary \"[Debugging Session Summary]\" --decision \"[Fix Decision]\" --observation \"[Error Pattern Observation]\""
rules:
trigger: "When new testing rules or error prevention guidelines are established. Use your judgement."
action: |
<thinking>
I need to update the Memory Bank with a new rule using `add-rule`.
The rule should include a name, creation date, triggers related to testing/debugging, rule content, and status.
Must include the branch parameter to add the rule to the current Git branch.
</thinking>
Use the MCP tool to add the rule. Make sure the rule clearly addresses specific error patterns or prevention strategies.
format: "add-rule [repository] rule-[testing]-v[X.Y.Z] --branch [branch] --name \"[Testing Rule]\" --created \"[YYYY-MM-DD]\" --triggers \"[error1,error2]\" --content \"[Prevention Rule Content]\" --status \"active\""
bug_analysis:
trigger: "When analyzing bug patterns, dependency chains in errors, or error propagation paths."
action: |
<thinking>
I need to analyze the bug patterns and error relationships using graph algorithms.
Must include the branch parameter to analyze the correct branch's data.
Choose the appropriate graph algorithm based on the debugging need.
</thinking>
error_dependencies:
format: "mcp_get_component_dependencies [repository] --branch [branch] --componentId \"comp-[BuggyComponent]\""
purpose: "Identify upstream dependencies that might contribute to the bug"
error_impact:
format: "mcp_get_component_dependents [repository] --branch [branch] --componentId \"comp-[BuggyComponent]\""
purpose: "Identify downstream components affected by the bug"
error_constraints:
format: "mcp_get_governing_items_for_component [repository] --branch [branch] --componentId \"comp-[BuggyComponent]\""
purpose: "Find test rules and decisions that govern a buggy component"
bug_history:
format: "mcp_get_item_contextual_history [repository] --branch [branch] --itemType \"Component\" --itemId \"comp-[BuggyComponent]\""
purpose: "Retrieve the full debugging history for a component"
related_bugs:
format: "mcp_get_related_items [repository] --branch [branch] --startItemId \"comp-[BuggyComponent]\" --depth 1"
purpose: "Find all memory items related to a specific buggy component"
graph_algorithms:
error_patterns:
format: "mcp_pagerank [repository] --branch [branch] --projectedGraphName \"errorAnalysis\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"
purpose: "Identify the most critical error-prone components"
error_clusters:  
 format: "louvain_community_detection [repository] --branch [branch] --projectedGraphName \"errorClusters\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"
purpose: "Detect natural groupings of related errors"
error_cycles:
format: "strongly_connected_components [repository] --branch [branch] --projectedGraphName \"errorCycles\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"]"
purpose: "Identify circular dependencies that may cause cascading errors"
error_propagation:
format: "shortest_path [repository] --branch [branch] --projectedGraphName \"errorPath\" --nodeTableNames [\"Component\"] --relationshipTableNames [\"DEPENDS_ON\"] --startNodeId \"[SourceErrorId]\" --endNodeId \"[TargetErrorId]\""
purpose: "Find the error propagation path between two components"

umb:
trigger: "^(Update Memory Bank|UMB)$"
instructions: - "Halt Current Task: Stop current activity" - "Acknowledge Command: '[MEMORY BANK: UPDATING]'" - "Review Chat History"
core_update_process: | 1. Current Session Review: - Analyze complete debug history by branch - Extract significant bug patterns found in current branch - Track resolution approaches for branch-specific issues - Map error relationships within the current branch's components 2. Comprehensive Updates by Branch: - Check current Git branch for memory bank operations - Update from debugging perspective for specific branch - Document identified bugs with branch context - Record resolution strategies tied to current branch - Note testing approaches specific to branch's code - Document error prevention measures within branch context 3. Memory Bank Synchronization: - Update all affected memory entries with branch parameter - Ensure debugging context is preserved in correct branch - Document bug patterns clearly with branch information - Note prevention strategies that apply to the current branch
task_focus: "During a UMB update, focus on capturing any bugs identified, error patterns discovered, or debugging techniques developed _during the chat session_ for the current Git branch. This information should be added to the appropriate Memory Bank repository using the correct MCP tools with branch parameter. _Do not_ attempt to summarize the entire project or perform actions outside the scope of the current debugging session."
cross-mode_updates: "During a UMB update, ensure that all relevant debugging information from the chat session is captured and added to the Memory Bank for the current branch. This includes any bugs found, resolution approaches, and prevention strategies specific to this branch. Use the appropriate MCP tools with branch parameter to record this information."
post_umb_actions: - "Memory Bank fully synchronized for current branch" - "Bug patterns documented in branch-specific repository" - "Resolution strategies recorded with branch isolation" - "Prevention measures established for current branch" - "Next debugging session on this branch will have complete context"
override_file_restrictions: true
override_mode_restrictions: true

KuzuMem_MCP_best_practices:
id_conventions: | - Component: `comp-[DescriptiveName]` (e.g., comp-AuthService, comp-DataAccess) - Decision: `dec-[YYYYMMDD]-[bug-id-description]` for major bug fixes with date reference - Rule: `rule-[testing]-v[X.Y.Z]` for testing rules with semantic versioning
branch_awareness: | - Branch parameter directly corresponds to Git branches in the project - Memory is fully isolated between branches (e.g., 'main', 'feature/auth', 'bugfix/login') - Synthetic repository IDs use pattern: name + ':' + branch as required by KuzuDB - Bug fixes and patterns in one branch are not visible to other branches unless explicitly copied - Always include branch parameter in every MCP tool call
debugging_patterns: | - Document recurring bug types with clear patterns - Record resolution strategies that succeeded - Note testing approaches that caught specific bugs - Tag components prone to particular error types - Link related bugs using graph relationships
error_prevention: | - Create rules for preventing common bugs - Document test cases that should be added - Record validation strategies that catch errors - Note code review focus areas for bug-prone components - Use graph analysis to identify error-prone dependency chains
bug_tracking: | - Use consistent bug IDs in decision records (dec-YYYYMMDD-bug-description) - Link related bugs through common components and relationships - Track resolution status in component status field (fixed/pending) - Document time-to-resolution metrics - Use graph algorithms to identify critical error-prone components
graph_usage: | - Use PageRank to identify critical error-prone components - Apply community detection to identify related error clusters - Check for circular dependencies that cause cascading errors - Map error propagation paths using shortest-path - Identify error-prone subsystems with weakly-connected-components
