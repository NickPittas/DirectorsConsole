# Multi-Node Parallel Generation Guide

A comprehensive guide to the multi-node parallel generation feature in Director's Console, enabling simultaneous image generation across multiple ComfyUI render nodes.

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [UI Guide](#ui-guide)
4. [Seed Strategies](#seed-strategies)
5. [Handling Failures](#handling-failures)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### What is Multi-Node Parallel Generation?

Multi-node parallel generation allows you to select multiple render nodes in the Director's Console storyboard and generate variations of the same prompt simultaneously. Each node generates a unique image using different seeds, giving you multiple options to choose from in a single operation.

### Why Use This Feature?

| Benefit | Description |
|---------|-------------|
| **Faster Exploration** | Generate 3-5 variations in the time it takes to generate one |
| **Visual Diversity** | Each seed produces a unique interpretation of your prompt |
| **Failure Isolation** | If one node fails, others continue generating |
| **Efficient Workflow** | Compare results side-by-side without manual repetition |

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Storyboard                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Panel 3: "City at Night"                                   ││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │  🔲 Node 1 (RTX 3090) → Seed: 42  → 🌆 Cyberpunk City  │││
│  │  │  🔲 Node 2 (RTX 4090) → Seed: 8765 → 🌆 Noir City       │││
│  │  │  🔲 Node 3 (RTX 4080) → Seed: 3210 → 🌆 Neon Downtown   │││
│  │  └─────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

1. **Multiple ComfyUI backends configured** - At least 2 render nodes connected to the Orchestrator
2. **Orchestrator running** - The API server must be running on port 9820
3. **CPE frontend connected** - Storyboard UI with multi-node support

### Quick Start

1. Open the Storyboard in Director's Console
2. Select a panel to edit
3. Click the **Node Selector** dropdown
4. Select multiple render nodes (2-5 recommended)
5. Configure seed strategy (default: `random`)
6. Click **Generate**

---

## UI Guide

### Selecting Render Nodes

The Multi-Node Selector displays all available ComfyUI backends:

```
┌─────────────────────────────────────┐
│  Target Nodes (3/5)       [All] [Clear]  │
├─────────────────────────────────────┤
│  🔴 RTX-3090-01 (online)  [✓]        │
│  🟢 RTX-4090-WS (online)   [✓]        │
│  🟡 RTX-4080-LAB (busy)    [✓]        │
│  ⚪ RTX-3080-DEV (offline)  [ ]        │
│  ⚪ RTX-3090-02 (offline)   [ ]        │
└─────────────────────────────────────┘
```

### Status Indicators

| Icon | Status | Description |
|------|--------|-------------|
| 🟢 | Online | Ready to accept jobs |
| 🟡 | Busy | Currently processing |
| 🔴 | Offline | Unavailable |
| ⚪ | Disabled | Manually turned off |

### Results Display

As generations complete, results appear in real-time:

```
┌─────────────────────────────────────────────────────────────────┐
│  Parallel Results (2/3 completed)                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │ 🌆 ✓    │  │ 🌆 ✓    │  │ ⏳ 45%  │                         │
│  │ Seed 42 │  │ Seed 8765│ │ Seed 3210│                        │
│  │ 3090-01 │  │ 4090-WS │  │ 4080-LAB│                        │
│  └─────────┘  └─────────┘  └─────────┘                         │
│                                                                 │
│  [Keep All Results]  [Keep Selected Only]  [Close]             │
└─────────────────────────────────────────────────────────────────┘
```

### Result States

| State | Visual | Description |
|-------|--------|-------------|
| **Queued** | ⏳ Hourglass | Waiting to start |
| **Running** | 🔄 Progress ring | Actively generating |
| **Completed** | ✓ Checkmark | Successfully finished |
| **Failed** | ⚠️ Warning | Error occurred |
| **Timeout** | ⏱️ Clock | Exceeded time limit |

---

## Seed Strategies

The seed strategy determines how unique seeds are generated for each parallel job.

### Available Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Random** | Random seeds with minimum 1M distance | Maximum visual diversity |
| **Sequential** | base_seed, base_seed+1, base_seed+2... | Systematic exploration |
| **Fibonacci** | Fibonacci-based spacing | Organic variation |
| **Golden Ratio** | Golden ratio multiplicative spacing | Mathematical harmony |

### Strategy Details

#### Random (Default)

```python
# Seeds: [42, 1847623, 9876543, ...]
# Minimum distance: 1,000,000 between seeds
# Best for: Maximum variety, exploratory work
```

**Best when:**
- You want completely different outputs
- Exploring new prompts
- Finding unexpected compositions

#### Sequential

```python
# Seeds: [42, 43, 44, 45, ...]
# Linear progression from base_seed
# Best for: Reproducible iterations
```

**Best when:**
- You need reproducible results
- Systematic parameter testing
- Fine-tuning a specific composition

#### Fibonacci

```python
# Seeds: [42, 42+1000, 42+2000, 42+5000, ...]
# Spacing follows: 1, 2, 3, 5, 8, 13...
# Best for: Gradual, natural variation
```

**Best when:**
- Organic progression between outputs
- Art direction with subtle changes
- Exploring a visual theme

#### Golden Ratio

```python
# Seeds: [42, 42+11, 42+29, 42+68, ...]
# Multiplicative spacing using φ (1.618...)
# Best for: Aesthetically balanced variations
```

**Best when:**
- Creating visually harmonious variations
- Artistic direction work
- When "divine proportion" matters

### Selecting a Strategy

```typescript
// In the UI, choose based on your goal:

// For exploration → Random
<Select strategy="random" />

// For reproducibility → Sequential
<Select strategy="sequential" base_seed={42} />

// For artistic direction → Fibonacci or Golden Ratio
<Select strategy="fibonacci" base_seed={42} />
```

---

## Handling Failures

### Failure Isolation

The system is designed so that **one failed job does not affect others**:

```
┌─────────────────────────────────────────────────────────────────┐
│  Job Group Status: Partial Complete                              │
├─────────────────────────────────────────────────────────────────┤
│  ✓ Node 1: Completed                                            │
│  ✗ Node 2: Failed (CUDA out of memory)                          │
│  ✓ Node 3: Completed                                            │
│                                                                 │
│  Results: 2/3 successful                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Failure Types

| Type | Cause | Resolution |
|------|-------|------------|
| **CUDA OOM** | GPU memory exhausted | Retry with fewer nodes |
| **Network Error** | Connection lost | Check backend connectivity |
| **Timeout** | Job exceeded timeout | Increase timeout setting |
| **Validation Error** | Invalid workflow | Check workflow JSON |

### Viewing Partial Results

When some jobs fail, you can still:

1. **View completed results** - Click on any successful thumbnail
2. **Retry failed jobs** - Select failed jobs and click "Retry"
3. **Export successful results** - Use "Keep Selected Only"

### Retry Failed Jobs

```python
# Retry specific failed child jobs
POST /api/job-group/{group_id}/retry
{
  "job_ids": ["j_abc123", "j_def456"]
}
```

---

## Best Practices

### Optimal Node Selection

| Node Count | Recommendation |
|------------|----------------|
| 2-3 | Optimal for most workflows |
| 4-5 | Good for exploration sessions |
| 6+ | May cause resource contention |

**Tip:** Don't select more nodes than you have VRAM to handle the workflow.

### Seed Strategy Selection Guide

| Goal | Recommended Strategy |
|------|---------------------|
| Explore new prompt | Random |
| Refine specific shot | Sequential |
| Artistic variation | Fibonacci |
| Harmonious series | Golden Ratio |

### Timeout Configuration

Default timeout: **300 seconds (5 minutes)**

Adjust based on:
- **Simple workflows**: 120 seconds
- **Complex workflows**: 600 seconds
- **High-res generations**: 900+ seconds

```json
{
  "timeout_seconds": 600
}
```

### Resource Management

```
✓ DO:
• Balance node selection with VRAM requirements
• Use "busy" nodes sparingly
• Monitor GPU usage during parallel jobs

✗ DON'T:
• Select offline nodes
• Overload GPU nodes with high-res workflows
• Ignore completion status differences
```

---

## Troubleshooting

### Common Issues

#### 1. No Online Nodes Available

**Problem:** Multi-node selector shows no available nodes.

**Solutions:**
```bash
# Check Orchestrator connectivity
curl http://localhost:9820/api/backends

# Verify backends are enabled
# Check backend configuration in Orchestrator settings
```

#### 2. Jobs Stuck at Queued

**Problem:** All jobs show "Queued" but never start.

**Solutions:**
- Check if backends are truly online
- Verify network connectivity to backends
- Restart the stalled backend

#### 3. Partial Failures

**Problem:** Some nodes complete, others fail repeatedly.

**Solutions:**
```python
# Check backend health
GET /api/backends/{backend_id}/status

# Review error messages for patterns
# Consider reducing timeout or workflow complexity
```

#### 4. Results Look Too Similar

**Problem:** All parallel results are nearly identical.

**Solutions:**
- Switch to **Random** seed strategy
- Increase MIN_RANDOM_DISTANCE setting
- Check that seeds are actually different

#### 5. WebSocket Connection Issues

**Problem:** Real-time updates not appearing.

**Solutions:**
```javascript
// Verify WebSocket URL
const ws = new WebSocket('ws://localhost:9820/ws/job-groups/jg_abc123');

// Check browser console for errors
// Verify no firewall blocking WS connections
```

### Error Messages Reference

| Error | Meaning | Action |
|-------|---------|--------|
| `"ParallelJobManager not initialized"` | Orchestrator not fully started | Wait for startup, restart if needed |
| `"No valid online backends available"` | All selected nodes offline | Check node status |
| `"Job group {id} not found"` | Group expired or invalid ID | Check group ID |
| `"CUDA out of memory"` | GPU memory exceeded | Reduce workflow complexity |

### Getting Help

1. **Check Orchestrator logs**: `logs/orchestrator.log`
2. **View backend status**: `GET /api/backends`
3. **Query job group**: `GET /api/job-groups/{group_id}`
4. **Contact support** with:
   - Job group ID
   - Error messages
   - Backend status at time of failure

---

## Technical Summary

### Data Flow

```
User selects nodes → Frontend submits job group → Orchestrator creates child jobs
     ↓                                                                    ↓
WebSocket connects ◄────────────────── Each job dispatches to backend
     ↓                                                                    ↓
Results stream in ◄─────────────────── Backend processes, returns outputs
     ↓                                                                    ↓
User sees results ─────────────────── Group completes (success/partial/fail)
```

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/job-group` | Submit parallel job group |
| `GET /api/job-groups/{id}` | Get group status |
| `DELETE /api/job-groups/{id}` | Cancel group |
| `WS /ws/job-groups/{id}` | Real-time streaming |

See [API Reference](../Orchestrator/docs/API_JOB_GROUPS.md) for complete documentation.

### Seed Range

- **Minimum**: 0
- **Maximum**: 2^63 - 1 (9223372036854775807)

---

*Last Updated: February 1, 2026*
*Part of Director's Console - Project Eliot*
