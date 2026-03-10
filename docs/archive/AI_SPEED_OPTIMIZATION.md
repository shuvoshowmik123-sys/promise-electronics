# Promise-AI Performance Optimization Plan

Based on your audio feedback and system analysis, I've identified why the chatbot feels "significantly very slow" (3-6 seconds latency) and how to fix it while staying in the **Free Tier**.

## 🚀 Root Cause Analysis
1.  **Heavy Model Usage**: Currently, the system uses `llama-3.3-70b-versatile` for chat. 
    - This is a massive 70-Billion parameter model.
    - While smart, it generates text slowly (~30 tokens/sec) and has higher processing latency.
2.  **Sequential Data Fetching**: The server fetches Finance stats, then Jobs, then Inventory **one by one**. This adds up latency before the AI is even called.
3.  **Large Payload**: We send the entire raw data to the AI context, which increases processing time.

---

## ✅ Recommended Fixes (Free Tier Friendly)

### 1. Switch to "Instant" Model (High Impact)
**Action**: Change the chat model to `llama-3.1-8b-instant`.
- **Speed**: This model is optimized for Groq's LPU and is **5x-10x faster** (sub-second response).
- **Quality**: For a "Customer Support" or "Ops Assistant" role, 8B is perfectly capable.
- **Cost**: Free.

### 2. Parallelize Data Fetching (Medium Impact)
**Action**: Fetch all business stats simultaneously using `Promise.all()`.
- **Speed**: Reduces pre-processing time by ~50%.

---

## 🛠️ Implementation Guide

### Step 1: Update `server/services/ai.service.ts`

Find the `MODELS` configuration (around line 35) and change the `chat` model:

```typescript
// server/services/ai.service.ts

const MODELS = {
    groq: {
        // CORRECTION: Use the instant model for chat
        chat: "llama-3.1-8b-instant",      // <--- CHANGED FROM 70b
        fast: "llama-3.1-8b-instant",
        audio: "whisper-large-v3",
    },
    // ...
};
```

### Step 2: Optimize `server/routes/ai.routes.ts`

In the `chat` endpoint, change how we fetch data:

```typescript
// server/routes/ai.routes.ts

// CURRENT (Sequential - Slow):
// if (dashboard) await getStats();
// if (jobs) await getOverview();

// NEW (Parallel - Fast):
const [stats, overview, inventoryStats] = await Promise.all([
    (perms.dashboard) ? storage.getDashboardStats() : Promise.resolve(null),
    (perms.jobs) ? storage.getJobOverview() : Promise.resolve(null),
    (perms.inventory) ? getInventoryStats() : Promise.resolve(null)
]);

businessData.stats = stats;
businessData.overview = overview;
businessData.inventoryStats = inventoryStats;
```

---

## 📊 Expected Result
| Metric | Current (70B) | Optimized (8B) |
| :--- | :--- | :--- |
| **Latency** | 3.0s - 6.0s | **0.5s - 1.2s** |
| **Feel** | "Significantly slow" | **"Instant"** |
| **Cost** | Free | **Free** |

---

### Shall I apply these changes for you?
I can automatically update the files to switch the model and optimize the code. Just say **"Apply Fix"**.
