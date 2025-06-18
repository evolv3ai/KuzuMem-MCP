# Core Memory Optimization Agent - Setup Guide

## 🧠 **High-Reasoning Model Configuration**

The Core Memory Optimization Agent uses advanced reasoning models for intelligent memory analysis and optimization decisions.

## 🔧 **Environment Variables**

### **Required API Keys:**

```bash
# OpenAI API Key (for o3, o1-mini models)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Anthropic API Key (for Claude models)
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here
```

### **Optional Configuration:**

```bash
# Custom API endpoints (if using proxies)
OPENAI_BASE_URL=https://api.openai.com/v1
ANTHROPIC_BASE_URL=https://api.anthropic.com

# Default reasoning settings (optional)
CORE_MEMORY_DEFAULT_PROVIDER=openai
CORE_MEMORY_DEFAULT_MODEL=o1-mini
```

## 🎯 **Supported Models & Reasoning Configuration**

### **OpenAI Models (HIGH Reasoning)**

| Model | Reasoning Type | Max Reasoning Tokens | Best For |
|-------|----------------|---------------------|----------|
| `o3` | HIGH reasoning | 32,768 | Most complex analysis, production |
| `o1-mini` | HIGH reasoning | 32,768 | Development, cost-effective |

**Automatic Configuration:**
- `reasoning: 'high'` - Enables maximum reasoning capability
- `maxReasoningTokens: 32768` - Full reasoning token budget
- `temperature: 0.1` - Consistent, deterministic analysis

### **Anthropic Models (Extended Thinking)**

| Model | Thinking Type | Thinking Budget | Best For |
|-------|---------------|----------------|----------|
| `claude-3-5-sonnet-20241022` | Extended thinking | 2,048 tokens | Most capable, production |
| `claude-3-5-haiku-20241022` | Extended thinking | 2,048 tokens | Faster, cost-effective |

**Automatic Configuration:**
- `thinking.enabled: true` - Enables extended thinking mode
- `thinking.maxTokens: 2048` - 2048 token thinking budget
- `temperature: 0.1` - Consistent, deterministic analysis

## 🚀 **Usage Examples**

### **1. OpenAI o3 (Most Capable)**

```json
{
  "tool": "memory-optimizer",
  "operation": "analyze",
  "repository": "my-repo",
  "branch": "main",
  "llmProvider": "openai",
  "model": "o3",
  "strategy": "conservative"
}
```

### **2. OpenAI o1-mini (Cost-Effective)**

```json
{
  "tool": "memory-optimizer",
  "operation": "analyze",
  "repository": "my-repo",
  "branch": "main",
  "llmProvider": "openai",
  "model": "o1-mini",
  "strategy": "balanced"
}
```

### **3. Claude Sonnet (Most Capable Anthropic)**

```json
{
  "tool": "memory-optimizer",
  "operation": "analyze",
  "repository": "my-repo",
  "branch": "main",
  "llmProvider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "strategy": "conservative"
}
```

### **4. Claude Haiku (Fast & Cost-Effective)**

```json
{
  "tool": "memory-optimizer",
  "operation": "analyze",
  "repository": "my-repo",
  "branch": "main",
  "llmProvider": "anthropic",
  "model": "claude-3-5-haiku-20241022",
  "strategy": "aggressive"
}
```

## 🛡️ **Optimization Strategies**

### **Conservative Strategy (Recommended for Production)**
- **Max Deletions:** 5 entities
- **Stale Threshold:** 180 days (6 months)
- **Focus:** Obvious duplicates and clearly obsolete entities
- **Safety:** Maximum safety, requires confirmation

### **Balanced Strategy (Recommended for Development)**
- **Max Deletions:** 20 entities
- **Stale Threshold:** 90 days (3 months)
- **Focus:** Stale detection + redundancy removal
- **Safety:** Moderate safety, requires confirmation

### **Aggressive Strategy (Use with Caution)**
- **Max Deletions:** 50 entities
- **Stale Threshold:** 30 days (1 month)
- **Focus:** Comprehensive cleanup
- **Safety:** Lower safety threshold, requires confirmation

## 🔄 **Complete Workflow Example**

### **Step 1: Analyze Memory Graph**

```json
{
  "tool": "memory-optimizer",
  "operation": "analyze",
  "repository": "my-project",
  "branch": "main",
  "llmProvider": "openai",
  "model": "o1-mini",
  "strategy": "conservative"
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
  }
}
```

### **Step 2: Preview Optimization (Dry Run)**

```json
{
  "tool": "memory-optimizer",
  "operation": "optimize",
  "repository": "my-project",
  "branch": "main",
  "analysisId": "analysis-1234567890-abc123",
  "dryRun": true,
  "strategy": "conservative"
}
```

### **Step 3: Execute Optimization (Confirmed)**

```json
{
  "tool": "memory-optimizer",
  "operation": "optimize",
  "repository": "my-project",
  "branch": "main",
  "analysisId": "analysis-1234567890-abc123",
  "dryRun": false,
  "confirm": true,
  "strategy": "conservative"
}
```

## 💡 **Best Practices**

### **Model Selection:**
- **Production:** Use `o3` or `claude-3-5-sonnet-20241022` for highest quality
- **Development:** Use `o1-mini` or `claude-3-5-haiku-20241022` for cost efficiency
- **Complex Projects:** Always use HIGH reasoning/extended thinking models

### **Strategy Selection:**
- **First Time:** Start with `conservative` strategy
- **Regular Maintenance:** Use `balanced` strategy
- **Major Cleanup:** Use `aggressive` strategy with caution

### **Safety Practices:**
- **Always** run dry-run first to preview changes
- **Always** require confirmation for actual optimization
- **Monitor** optimization results and adjust strategy accordingly
- **Backup** critical repositories before aggressive optimization

## 🔍 **Reasoning Capabilities**

### **OpenAI HIGH Reasoning:**
- **Deep Analysis:** Complex dependency chain analysis
- **Safety Validation:** Multi-step safety reasoning
- **Pattern Recognition:** Advanced pattern detection in memory graphs
- **Risk Assessment:** Comprehensive risk evaluation

### **Anthropic Extended Thinking:**
- **Contextual Understanding:** Deep context comprehension
- **Relationship Analysis:** Complex relationship reasoning
- **Safety Reasoning:** Extended safety validation
- **Optimization Planning:** Thoughtful optimization strategies

The Core Memory Optimization Agent leverages these advanced reasoning capabilities to make intelligent, safe, and context-aware decisions about memory optimization.
