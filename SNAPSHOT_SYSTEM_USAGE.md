# Snapshot System - Usage Guide

## 🎯 **Overview**

The Snapshot System provides safe backup and restore capabilities for the Core Memory Optimization Agent, enabling confident optimization with rollback guarantees.

## 🚀 **Key Features**

### **✅ Automatic Snapshot Creation**
- **Pre-optimization snapshots** created automatically before optimization
- **Atomic operations** using KuzuDB transactions
- **Complete state capture** including entities, relationships, and metadata

### **✅ Safe Rollback Operations**
- **Validation before rollback** ensures snapshot integrity
- **Transactional rollback** guarantees atomic restoration
- **Complete state restoration** to exact pre-optimization state

### **✅ Snapshot Management**
- **List snapshots** for a repository/branch
- **Snapshot validation** checks integrity before use
- **Snapshot statistics** show entity counts and sizes

## 📋 **Usage Examples**

### **1. Analyze with Automatic Snapshot Creation**

```json
{
  "tool": "memory-optimizer",
  "operation": "analyze",
  "repository": "my-project",
  "branch": "main",
  "clientProjectRoot": "/path/to/project",
  "strategy": "conservative",
  "llmProvider": "openai",
  "model": "o1-mini"
}
```

**Response:**
```json
{
  "success": true,
  "operation": "analyze",
  "data": {
    "analysisId": "analysis-1234567890-abc123",
    "summary": {
      "totalEntitiesAnalyzed": 150,
      "staleEntitiesFound": 12,
      "redundancyGroupsFound": 3,
      "optimizationOpportunities": 8,
      "overallHealthScore": 85
    },
    "staleEntities": [...],
    "redundancies": [...],
    "recommendations": [...]
  },
  "message": "Analysis completed. Found 12 stale entities, 3 redundancy groups, and 8 optimization opportunities."
}
```

### **2. Execute Optimization with Automatic Snapshot**

```json
{
  "tool": "memory-optimizer",
  "operation": "optimize",
  "repository": "my-project",
  "branch": "main",
  "clientProjectRoot": "/path/to/project",
  "analysisId": "analysis-1234567890-abc123",
  "dryRun": false,
  "confirm": true,
  "strategy": "conservative"
}
```

**Response:**
```json
{
  "success": true,
  "operation": "optimize",
  "data": {
    "planId": "plan-1234567890-def456",
    "status": "success",
    "executedActions": [
      {
        "actionId": "comp-old-api-v1",
        "status": "success"
      },
      {
        "actionId": "dec-deprecated-feature",
        "status": "success"
      }
    ],
    "optimizationSummary": {
      "entitiesDeleted": 5,
      "entitiesMerged": 2,
      "entitiesUpdated": 1
    },
    "snapshotId": "snapshot-1703123456789-xyz789"
  },
  "message": "Optimization completed with status: success. Affected 8 entities."
}
```

### **3. List Available Snapshots**

```json
{
  "tool": "memory-optimizer",
  "operation": "list-snapshots",
  "repository": "my-project",
  "branch": "main",
  "clientProjectRoot": "/path/to/project"
}
```

**Response:**
```json
{
  "success": true,
  "operation": "list-snapshots",
  "data": {
    "snapshots": [
      {
        "id": "snapshot-1703123456789-xyz789",
        "repository": "my-project",
        "branch": "main",
        "description": "Pre-optimization snapshot for plan plan-1234567890-def456",
        "created": "2024-12-21T10:30:56.789Z",
        "entitiesCount": 150,
        "relationshipsCount": 89,
        "size": 45678
      },
      {
        "id": "snapshot-1703120000000-abc123",
        "repository": "my-project",
        "branch": "main",
        "description": "Manual snapshot before major refactor",
        "created": "2024-12-21T09:33:20.000Z",
        "entitiesCount": 142,
        "relationshipsCount": 85,
        "size": 43210
      }
    ],
    "count": 2,
    "repository": "my-project",
    "branch": "main"
  },
  "message": "Found 2 snapshots for my-project:main"
}
```

### **4. Rollback to Previous Snapshot**

```json
{
  "tool": "memory-optimizer",
  "operation": "rollback",
  "repository": "my-project",
  "branch": "main",
  "clientProjectRoot": "/path/to/project",
  "snapshotId": "snapshot-1703123456789-xyz789"
}
```

**Response:**
```json
{
  "success": true,
  "operation": "rollback",
  "data": {
    "rollbackStatus": "success",
    "restoredEntities": 150,
    "restoredRelationships": 89,
    "rollbackTime": "2024-12-21T10:45:30.123Z",
    "snapshotId": "snapshot-1703123456789-xyz789"
  },
  "message": "Successfully rolled back to snapshot snapshot-1703123456789-xyz789. Restored 150 entities and 89 relationships."
}
```

## 🛡️ **Safety Features**

### **Automatic Snapshot Creation**
- **Every optimization** automatically creates a snapshot (unless dry-run)
- **No user intervention** required for basic safety
- **Snapshot ID returned** in optimization results for easy rollback

### **Validation Before Rollback**
- **Integrity checks** ensure snapshot is valid before rollback
- **Entity validation** checks for required fields and duplicates
- **Relationship validation** ensures proper structure
- **Error prevention** stops invalid rollbacks before they start

### **Transactional Operations**
- **Atomic snapshots** - either complete success or complete failure
- **Atomic rollbacks** - either complete restoration or no changes
- **Database consistency** maintained at all times

## 📊 **Snapshot Information**

### **What's Included in Snapshots:**
- **All entities** for the repository/branch (Components, Decisions, Rules, Files, Contexts, Tags)
- **All relationships** between entities
- **Repository metadata** and configuration
- **Timestamps** and descriptive information

### **What's NOT Included:**
- **Other repositories** or branches (isolation maintained)
- **Snapshot entities** themselves (prevents recursive snapshots)
- **System metadata** unrelated to the specific repository

## 🔧 **Advanced Usage**

### **Snapshot Validation**
```typescript
// Snapshots are automatically validated before rollback
// Validation checks:
// - Required entity fields (id, nodeLabels)
// - No duplicate entity IDs
// - Required relationship fields (fromId, toId, relationshipType)
// - Snapshot data integrity
```

### **Error Handling**
```typescript
// If optimization fails after snapshot creation:
// 1. Snapshot ID is logged for manual rollback
// 2. Error details include rollback instructions
// 3. Memory graph remains in partial state until rollback
```

### **Performance Considerations**
```typescript
// Snapshot creation time scales with:
// - Number of entities in repository/branch
// - Number of relationships
// - Complexity of entity properties
// 
// Typical performance:
// - Small projects (< 100 entities): < 1 second
// - Medium projects (100-1000 entities): 1-5 seconds  
// - Large projects (1000+ entities): 5-30 seconds
```

## 🎯 **Best Practices**

### **1. Always Use Snapshots for Production**
```json
{
  "dryRun": false,
  "confirm": true,
  // Snapshots are created automatically - no additional config needed
}
```

### **2. List Snapshots Before Rollback**
```json
// First, see what snapshots are available
{
  "operation": "list-snapshots",
  "repository": "my-project",
  "branch": "main"
}

// Then rollback to the desired snapshot
{
  "operation": "rollback",
  "snapshotId": "snapshot-1703123456789-xyz789"
}
```

### **3. Test with Dry-Run First**
```json
// Always test optimization with dry-run first
{
  "operation": "optimize",
  "dryRun": true,  // No snapshot needed for dry-run
  "strategy": "conservative"
}

// Then execute with snapshot protection
{
  "operation": "optimize", 
  "dryRun": false,
  "confirm": true  // Snapshot created automatically
}
```

The Snapshot System provides **production-ready safety** for the Core Memory Optimization Agent, enabling confident optimization with guaranteed rollback capabilities! 🚀
