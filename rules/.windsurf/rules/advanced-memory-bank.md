---
trigger: always_on
description: Guidelines for using the Advanced Memory Bank MCP tool effectively
---

# Advanced Memory Bank MCP Tool Usage Guidelines

## When to Create Memories

As an AI assistant, you should proactively create memories in the following situations:

1. **When encountering architectural decisions**
   - Create a decision record whenever the USER makes a significant architectural choice
   - Use `add-decision` to document rationale, context, and implications

2. **When identifying system components**
   - Create component records when new services, modules, or libraries are introduced
   - Use `add-component` to document component name, kind, dependencies, and status

3. **When establishing coding standards**
   - Create rule records for enforced coding practices and standards
   - Use `add-rule` to document triggers, specific requirements, and compliance expectations

4. **When capturing session context**
   - Record summaries of important development sessions
   - Use `add-context` at the end of significant work sessions to capture learnings
   - Include key observations and actionable decisions

5. **When updating project metadata**
   - Update the repository's metadata when tech stack or architecture changes
   - Use `update-metadata` to ensure project information remains current

## When to Read Memories

Retrieve and consult memories in these scenarios:

1. **At the beginning of each conversation**
   - Use `get-metadata` to understand project structure and architecture
   - Review existing rules to ensure compliance with established guidelines

2. **When addressing architectural concerns**
   - Use `get-context` to review relevant historical context before making suggestions
   - Reference existing component relationships before suggesting changes

3. **When working on existing components**
   - Review component dependencies before suggesting modifications
   - Ensure recommendations align with documented component status

4. **When enforcing consistency**
   - Reference existing rules before suggesting code patterns
   - Maintain consistency with previously recorded decisions

5. **When suggesting improvements**
   - Ground recommendations in historical context from previous sessions
   - Refer to past observations to avoid repeating unsuccessful approaches

## Memory Creation Best Practices

1. **Use clear, consistent identifiers**
   - Follow the established naming conventions:
     - Context: `ctx-YYYY-MM-DDThh-mm`
     - Component: `comp-ComponentName`
     - Decision: `dec-YYYYMMDD-brief-description`
     - Rule: `rule-category-vX.Y.Z`

2. **Include sufficient detail**
   - Provide comprehensive content that will be useful when retrieved later
   - Include rationale, not just descriptions
   - Link related decisions and observations when possible

3. **Categorize properly**
   - Use the appropriate memory type for the content:
     - `metadata` for project-wide information
     - `context` for session-specific notes
     - `component` for architectural elements
     - `decision` for architectural decisions
     - `rule` for enforced guidelines

4. **Update rather than duplicate**
   - Check if a memory already exists before creating a new one
   - Update existing memories when only minor changes are needed

## Memory Retrieval Best Practices

1. **Filter by repository**
   - Always specify the repository name when retrieving memories
   - Use consistent repository names across operations

2. **Review most recent context first**
   - Sort context by date to see the most recent developments
   - Give precedence to newer decisions over older ones when conflicts exist

3. **Cross-reference between memory types**
   - Look for related components when reviewing decisions
   - Check for rules that may impact components under discussion

4. **Respect memory status**
   - Pay attention to status fields (e.g., for rules and components)
   - Only enforce active rules, not deprecated ones

## Usage in Workflows

1. **Project Initialization**

   ```
   # Create initial repository metadata
   init-memory-bank my-repo
   update-metadata my-repo --name "Project Name" --tech-stack "Node.js, TypeScript"
   ```

2. **Architecture Design**

   ```
   # Document key components
   add-component my-repo comp-AuthService --name "AuthService" --kind "service"
   add-component my-repo comp-Database --name "Database" --kind "storage"
   
   # Record architecture decisions
   add-decision my-repo dec-20250510-auth-pattern --name "JWT Authentication" --context "Selected for stateless auth"
   ```

3. **Code Standard Enforcement**

   ```
   # Define coding standards
   add-rule my-repo rule-logging-v1 --name "Structured Logging" --content "All logs must use the structured logger"
   ```

4. **Session Recording**

   ```
   # Document session outcomes
   add-context my-repo --agent "Team Lead" --summary "Refactored authentication flow" --decision "Move to token-based auth"
   ```

Remember that a well-maintained memory bank becomes increasingly valuable over time. The more consistent and thorough the memory creation, the more effective the assistance provided based on those memories.
