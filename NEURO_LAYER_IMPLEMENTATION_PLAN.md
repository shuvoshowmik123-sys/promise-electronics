# Promise Core Neuro-Layer - Implementation Plan
## Optimized for Vercel Free Tier + Small Scale

**Target Scale:** 5-20 jobs/day, 2-5 admin users  
**Budget:** $0-5/month (AI costs only)  
**Platform:** Vercel Free Tier  
**Timeline:** 7-10 days implementation

---

## 📊 Revised Cost Analysis (Your Scale)

### Monthly Projections at 20 jobs/day:

| Module | Usage | Estimated Cost |
|--------|-------|----------------|
| **Module A** (Morning Brief) | 30 calls/month | **$0.50/month** ✅ |
| **Module D** (Training Loop) | 20 feedbacks/month | **$0.20/month** ✅ |
| **Module B** (AI Chat) | 50 queries/month | **$2-4/month** ✅ |
| **TOTAL** | | **~$3-5/month** 🎉 |

**Verdict:** At your scale, AI costs are **negligible**. You can afford to be experimental!

---

## 🚧 Vercel Free Tier Constraints & Solutions

### ❌ What You DON'T Have on Vercel Free:

1. **No Traditional Cron Jobs** → Use Vercel Cron (Beta) or external ping service
2. **10-second function timeout** → Keep AI calls under 8 seconds
3. **Cold starts** → First request may be slow (2-3 seconds)
4. **Limited serverless executions** → 100GB-hours/month (sufficient for your scale)

### ✅ What You DO Have:

- **Serverless Functions** → Perfect for AI API routes
- **Edge Functions** → Ultra-fast for simple lookups
- **PostgreSQL** → Vercel Postgres (free tier: 256MB, enough for 10k+ jobs)
- **Vercel Cron (Beta)** → Daily tasks up to 1/day on free tier
- **Environment Variables** → Secure API key storage

---

## 🎯 Recommended Implementation (Revised for Your Context)

### Phase 1: Core Intelligence (Week 1-2)
**Build:** Morning Brief + Training Loop  
**Cost:** ~$1/month  
**Effort:** 10-15 hours

### Phase 2: Interactive AI (Week 3-4) - OPTIONAL
**Build:** Admin Chat with 10 query templates  
**Cost:** +$2-4/month  
**Effort:** +8 hours

### Phase 3+: Advanced Features (Month 2+)
**Skip for now** - Not needed at current scale

---

## 🏗️ Architecture for Vercel

```
┌─────────────────────────────────────────────────────┐
│           Admin Panel (React/Next.js)                │
│  - Deployed on Vercel                                │
│  - /components/MorningBrief.tsx                      │
│  - /components/TrainingFeedbackModal.tsx             │
└──────────────────┬──────────────────────────────────┘
                   │ API Calls
                   ▼
┌─────────────────────────────────────────────────────┐
│        Vercel Serverless Functions (Node.js)         │
│                                                       │
│  📁 /api/ai/morning-brief.ts                         │
│     - Triggered by Vercel Cron (9 AM daily)          │
│     - Generates insights                             │
│     - Timeout: 8 seconds                             │
│                                                       │
│  📁 /api/ai/chat.ts                                  │
│     - Handles admin queries                          │
│     - Rate limited                                   │
│                                                       │
│  📁 /api/ai/feedback.ts                              │
│     - Stores training data                           │
│                                                       │
│  📁 /lib/aiService.ts (Shared)                       │
│     - Gemini API wrapper                             │
│     - Prompt templates                               │
│     - Response caching (using Vercel KV - optional)  │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│        Vercel Postgres (Free Tier: 256MB)            │
│  - ai_insights                                       │
│  - diagnosis_training_data                           │
│  - ai_query_log (lightweight version)                │
└─────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              Gemini API (Flash only)                 │
│  - Average response: 1-2 seconds                     │
│  - Cost: ~$0.001 per request at your volume          │
└─────────────────────────────────────────────────────┘
```

---

## 📋 Implementation Checklist

### 🔧 Day 1-2: Database Setup

#### Add New Tables to Schema

```typescript
// db/schema.ts (Add these to your existing schema)

export const aiInsights = pgTable('ai_insights', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 50 }).notNull(), // 'red', 'green', 'blue'
  title: text('title').notNull(),
  content: text('content').notNull(),
  actionableStep: text('actionable_step'),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const diagnosisTrainingData = pgTable('diagnosis_training_data', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').references(() => jobs.id),
  customerChatSummary: text('customer_chat_summary'),
  aiPrediction: text('ai_prediction'),
  actualIssue: text('actual_issue'),
  wasAccurate: boolean('was_accurate'),
  feedbackNotes: text('feedback_notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Lightweight audit log (no cost tracking needed at your scale)
export const aiQueryLog = pgTable('ai_query_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  queryType: varchar('query_type', { length: 50 }),
  wasSuccessful: boolean('was_successful').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});
```

#### Run Migration

```bash
# Generate migration
npm run db:generate

# Push to database
npm run db:push
```

---

### 🧠 Day 3-4: AI Service Layer

#### Create Core AI Service

```typescript
// lib/aiService.ts

import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

interface DailyStats {
  totalJobs: number;
  completedJobs: number;
  pendingJobs: number;
  revenue: number;
  topIssues: Array<{ issue: string; count: number }>;
  technicianPerformance: Array<{ name: string; jobsCompleted: number }>;
  lowStockItems: Array<{ name: string; quantity: number }>;
}

export const aiService = {
  /**
   * Generate Morning Brief Insights
   * Expected execution time: 2-4 seconds
   */
  async generateMorningBrief(stats: DailyStats) {
    const prompt = `You are the AI Operations Manager for Promise Electronics, a TV repair service in Bangladesh.

**Yesterday's Performance:**
- Total Jobs: ${stats.totalJobs} (Completed: ${stats.completedJobs}, Pending: ${stats.pendingJobs})
- Revenue: ${stats.revenue} BDT
- Top Issues: ${stats.topIssues.map(i => `${i.issue} (${i.count})`).join(', ')}
- Best Technician: ${stats.technicianPerformance[0]?.name || 'N/A'} (${stats.technicianPerformance[0]?.jobsCompleted || 0} jobs)
- Low Stock Alerts: ${stats.lowStockItems.length} items below threshold

**Your Task:**
Analyze this data and identify:

1. **RED (Critical Issue):** One urgent problem that needs immediate action
2. **GREEN (Opportunity):** One way to increase revenue or efficiency  
3. **BLUE (Trend to Watch):** One metric to monitor over the next few days

**Rules:**
- Keep each insight under 20 words
- Be specific with numbers when possible
- Focus on actionable items
- Write in a professional but friendly tone

**Output Format (JSON only, no markdown):**
{
  "red": {
    "title": "Brief headline",
    "action": "Specific action to take"
  },
  "green": {
    "title": "Brief headline",
    "action": "Specific action to take"
  },
  "blue": {
    "title": "Brief headline", 
    "action": "What to monitor"
  }
}`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Extract JSON from response (remove markdown code blocks if present)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      
      const insights = JSON.parse(jsonMatch[0]);
      return insights;
    } catch (error) {
      console.error('Morning brief generation failed:', error);
      
      // Fallback to basic analysis if AI fails
      return {
        red: {
          title: "AI Service Unavailable",
          action: "Using fallback analytics. Check API key and quota."
        },
        green: {
          title: `${stats.completedJobs} jobs completed yesterday`,
          action: "Keep up the good work!"
        },
        blue: {
          title: `${stats.pendingJobs} jobs pending`,
          action: "Monitor completion rate today"
        }
      };
    }
  },

  /**
   * Analyze diagnosis accuracy and suggest improvements
   * Used for weekly training batch
   */
  async analyzeTrainingData(recentFeedback: any[]) {
    if (recentFeedback.length === 0) {
      return { accuracy: 0, suggestions: [] };
    }

    const accurateCount = recentFeedback.filter(f => f.wasAccurate).length;
    const accuracy = (accurateCount / recentFeedback.length) * 100;

    // If accuracy is good, no need to call AI
    if (accuracy > 80) {
      return {
        accuracy,
        suggestions: ['Diagnosis accuracy is excellent. Keep current approach.']
      };
    }

    // Get common failure patterns
    const failures = recentFeedback
      .filter(f => !f.wasAccurate)
      .map(f => ({
        predicted: f.aiPrediction,
        actual: f.actualIssue,
        symptoms: f.customerChatSummary
      }));

    const prompt = `You are analyzing AI diagnosis errors for a TV repair service.

**Failed Predictions (Last 7 days):**
${JSON.stringify(failures, null, 2)}

**Current Accuracy:** ${accuracy.toFixed(1)}%

**Task:** Identify 3 specific reasons why the AI is making wrong predictions and suggest how to improve.

**Output Format (JSON only):**
{
  "commonPatterns": ["Pattern 1", "Pattern 2", "Pattern 3"],
  "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
}`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const analysis = JSON.parse(jsonMatch![0]);
      
      return {
        accuracy,
        ...analysis
      };
    } catch (error) {
      console.error('Training analysis failed:', error);
      return {
        accuracy,
        suggestions: ['Unable to analyze patterns. Manual review needed.']
      };
    }
  },

  /**
   * Simple chat interface (for Phase 2)
   * Uses predefined query templates for safety
   */
  async handleAdminQuery(query: string, context: any) {
    const safePrompt = `You are the AI assistant for Promise Electronics admin panel.

**User Question:** ${query}

**Available Data:**
${JSON.stringify(context, null, 2)}

**Task:** Answer the question based ONLY on the data provided. If you cannot answer with the given data, say "I need more data to answer this."

Keep your response under 100 words and be specific.`;

    try {
      const result = await model.generateContent(safePrompt);
      return result.response.text();
    } catch (error) {
      console.error('Chat query failed:', error);
      return 'Sorry, I encountered an error. Please try rephrasing your question.';
    }
  }
};
```

---

### ⏰ Day 5: Vercel Cron Setup

#### Create Cron API Route

```typescript
// app/api/cron/morning-brief/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { aiService } from '@/lib/aiService';
import { jobs, aiInsights } from '@/db/schema';
import { sql, gte } from 'drizzle-orm';

// This route will be called by Vercel Cron
export async function GET(request: NextRequest) {
  // Verify request is from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get yesterday's stats
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Aggregate data (adjust these queries to match your schema)
    const [jobStats] = await db
      .select({
        totalJobs: sql<number>`count(*)`,
        completedJobs: sql<number>`count(*) filter (where status = 'completed')`,
        pendingJobs: sql<number>`count(*) filter (where status = 'pending')`,
        revenue: sql<number>`sum(total_price)`,
      })
      .from(jobs)
      .where(gte(jobs.createdAt, yesterday));

    // Get top issues (example - adjust to your schema)
    const topIssues = await db
      .select({
        issue: jobs.issueType,
        count: sql<number>`count(*)`,
      })
      .from(jobs)
      .where(gte(jobs.createdAt, yesterday))
      .groupBy(jobs.issueType)
      .orderBy(sql`count(*) desc`)
      .limit(3);

    // TODO: Get technician performance and low stock items
    const technicianPerformance = []; // Implement based on your schema
    const lowStockItems = []; // Implement based on your schema

    // Generate AI insights
    const insights = await aiService.generateMorningBrief({
      totalJobs: jobStats.totalJobs || 0,
      completedJobs: jobStats.completedJobs || 0,
      pendingJobs: jobStats.pendingJobs || 0,
      revenue: jobStats.revenue || 0,
      topIssues: topIssues || [],
      technicianPerformance,
      lowStockItems,
    });

    // Save insights to database
    await db.insert(aiInsights).values([
      {
        type: 'red',
        title: insights.red.title,
        content: insights.red.action,
        actionableStep: insights.red.action,
        isRead: false,
      },
      {
        type: 'green',
        title: insights.green.title,
        content: insights.green.action,
        actionableStep: insights.green.action,
        isRead: false,
      },
      {
        type: 'blue',
        title: insights.blue.title,
        content: insights.blue.action,
        actionableStep: insights.blue.action,
        isRead: false,
      },
    ]);

    return NextResponse.json({
      success: true,
      insights,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Morning brief cron failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate morning brief' },
      { status: 500 }
    );
  }
}
```

#### Configure Vercel Cron

```json
// vercel.json (create in project root)
{
  "crons": [
    {
      "path": "/api/cron/morning-brief",
      "schedule": "0 3 * * *"
    }
  ]
}
```

**Note:** Schedule is in UTC. `0 3 * * *` = 3:00 AM UTC = 9:00 AM Bangladesh Time (UTC+6)

#### Add Environment Variables in Vercel

```bash
# In Vercel Dashboard → Settings → Environment Variables
GEMINI_API_KEY=your_gemini_api_key_here
CRON_SECRET=generate_a_random_secret_string_here
```

---

### 📱 Day 6-7: Frontend Components

#### Morning Brief Widget

```typescript
// components/MorningBrief.tsx

'use client';

import { useEffect, useState } from 'react';
import { Bell, AlertTriangle, TrendingUp, Eye } from 'lucide-react';

interface Insight {
  id: number;
  type: 'red' | 'green' | 'blue';
  title: string;
  content: string;
  actionableStep: string;
  isRead: boolean;
  createdAt: Date;
}

export function MorningBrief() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      const response = await fetch('/api/ai/insights');
      const data = await response.json();
      setInsights(data.insights || []);
    } catch (error) {
      console.error('Failed to fetch insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: number) => {
    await fetch(`/api/ai/insights/${id}/read`, { method: 'POST' });
    setInsights(prev => 
      prev.map(i => i.id === id ? { ...i, isRead: true } : i)
    );
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'red': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'green': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'blue': return <Eye className="w-5 h-5 text-blue-500" />;
      default: return <Bell className="w-5 h-5" />;
    }
  };

  const getCardClass = (type: string) => {
    switch (type) {
      case 'red': return 'border-l-4 border-red-500 bg-red-50';
      case 'green': return 'border-l-4 border-green-500 bg-green-50';
      case 'blue': return 'border-l-4 border-blue-500 bg-blue-50';
      default: return 'border-l-4 border-gray-300';
    }
  };

  if (loading) {
    return <div className="p-4">Loading insights...</div>;
  }

  if (insights.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No new insights yet. Check back tomorrow!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-xl font-bold flex items-center gap-2">
        <Bell className="w-6 h-6" />
        Morning Brief
      </h2>
      
      {insights.map((insight) => (
        <div
          key={insight.id}
          className={`p-4 rounded-lg shadow-sm ${getCardClass(insight.type)} ${
            insight.isRead ? 'opacity-60' : ''
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-1">{getIcon(insight.type)}</div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{insight.title}</h3>
              <p className="text-sm text-gray-700 mt-1">{insight.content}</p>
              {insight.actionableStep && (
                <div className="mt-2 text-xs bg-white bg-opacity-50 rounded p-2">
                  <strong>Action:</strong> {insight.actionableStep}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {new Date(insight.createdAt).toLocaleDateString()}
                </span>
                {!insight.isRead && (
                  <button
                    onClick={() => markAsRead(insight.id)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Mark as read
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

#### API Route to Fetch Insights

```typescript
// app/api/ai/insights/route.ts

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { aiInsights } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const insights = await db
      .select()
      .from(aiInsights)
      .orderBy(desc(aiInsights.createdAt))
      .limit(10);

    return NextResponse.json({ insights });
  } catch (error) {
    console.error('Failed to fetch insights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insights' },
      { status: 500 }
    );
  }
}
```

---

### 🎓 Day 8-9: Training Feedback Modal

#### Feedback Modal Component

```typescript
// components/TrainingFeedbackModal.tsx

'use client';

import { useState } from 'react';
import { X, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface Props {
  jobId: number;
  aiPrediction: string;
  customerChatSummary: string;
  onClose: () => void;
  onSubmit: (feedback: FeedbackData) => void;
}

interface FeedbackData {
  wasAccurate: boolean;
  actualIssue?: string;
  feedbackNotes?: string;
}

export function TrainingFeedbackModal({
  jobId,
  aiPrediction,
  customerChatSummary,
  onClose,
  onSubmit
}: Props) {
  const [step, setStep] = useState(1);
  const [wasAccurate, setWasAccurate] = useState<boolean | null>(null);
  const [actualIssue, setActualIssue] = useState('');
  const [feedbackNotes, setFeedbackNotes] = useState('');

  const handleSubmit = () => {
    if (wasAccurate === null) return;

    onSubmit({
      wasAccurate,
      actualIssue: wasAccurate ? undefined : actualIssue,
      feedbackNotes: wasAccurate ? undefined : feedbackNotes,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">AI Diagnosis Feedback</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        {step === 1 && (
          <div>
            <div className="mb-4 p-3 bg-blue-50 rounded">
              <p className="text-sm text-gray-700">
                <strong>AI Predicted:</strong> {aiPrediction}
              </p>
            </div>

            <p className="text-gray-800 font-semibold mb-3">
              Was the AI diagnosis accurate?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setWasAccurate(true);
                  setStep(2);
                }}
                className="w-full p-4 border-2 border-green-500 rounded-lg hover:bg-green-50 flex items-center gap-3"
              >
                <CheckCircle className="w-6 h-6 text-green-500" />
                <span className="font-medium">Yes, spot on!</span>
              </button>

              <button
                onClick={() => {
                  setWasAccurate(false);
                  setStep(2);
                }}
                className="w-full p-4 border-2 border-red-500 rounded-lg hover:bg-red-50 flex items-center gap-3"
              >
                <XCircle className="w-6 h-6 text-red-500" />
                <span className="font-medium">No, it was wrong</span>
              </button>

              <button
                onClick={() => {
                  setWasAccurate(false);
                  setActualIssue('Customer did not use AI');
                  setStep(2);
                }}
                className="w-full p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-3"
              >
                <AlertCircle className="w-6 h-6 text-gray-500" />
                <span className="font-medium">Customer didn't use Daktar Vai</span>
              </button>
            </div>
          </div>
        )}

        {step === 2 && !wasAccurate && (
          <div>
            <p className="text-gray-800 font-semibold mb-3">
              What was the actual issue?
            </p>

            <textarea
              value={actualIssue}
              onChange={(e) => setActualIssue(e.target.value)}
              placeholder="E.g., Backlight failure, not power supply"
              className="w-full p-3 border rounded-lg mb-4"
              rows={3}
            />

            <p className="text-gray-800 font-semibold mb-3">
              Why do you think AI was wrong? (Optional)
            </p>

            <select
              value={feedbackNotes}
              onChange={(e) => setFeedbackNotes(e.target.value)}
              className="w-full p-3 border rounded-lg mb-4"
            >
              <option value="">Select a reason...</option>
              <option value="Customer described symptoms poorly">Customer described symptoms poorly</option>
              <option value="Rare/uncommon issue">Rare/uncommon issue</option>
              <option value="Multiple issues present">Multiple issues present</option>
              <option value="AI needs more context about this TV model">AI needs more context about this TV model</option>
              <option value="Other">Other</option>
            </select>

            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!actualIssue.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Submit Feedback
              </button>
            </div>
          </div>
        )}

        {step === 2 && wasAccurate && (
          <div>
            <div className="text-center py-6">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-semibold text-gray-800">Great!</p>
              <p className="text-gray-600">This helps Daktar Vai learn and improve.</p>
            </div>

            <button
              onClick={handleSubmit}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

#### API Route to Save Feedback

```typescript
// app/api/ai/feedback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { diagnosisTrainingData } from '@/db/schema';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, customerChatSummary, aiPrediction, wasAccurate, actualIssue, feedbackNotes } = body;

    await db.insert(diagnosisTrainingData).values({
      jobId,
      customerChatSummary,
      aiPrediction,
      wasAccurate,
      actualIssue,
      feedbackNotes,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save feedback:', error);
    return NextResponse.json(
      { error: 'Failed to save feedback' },
      { status: 500 }
    );
  }
}
```

---

### 🧪 Day 10: Testing & Deployment

#### Testing Checklist

- [ ] **Morning Brief Generation:** Test with sample data
- [ ] **Cron Job:** Use Vercel CLI to test locally
  ```bash
  vercel dev
  # In another terminal:
  curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/morning-brief
  ```
- [ ] **Feedback Modal:** Test all three scenarios (accurate, inaccurate, no AI)
- [ ] **Error Handling:** Test with invalid Gemini API key
- [ ] **Database:** Verify all tables created correctly

#### Deployment Steps

```bash
# 1. Commit changes
git add .
git commit -m "feat: Add AI Neuro-Layer (Morning Brief + Training Loop)"

# 2. Push to Vercel
git push origin main

# 3. In Vercel Dashboard:
# - Add GEMINI_API_KEY environment variable
# - Add CRON_SECRET environment variable
# - Verify vercel.json cron config is detected

# 4. Test cron manually (first time)
# Go to: https://your-app.vercel.app/api/cron/morning-brief
# Add header: Authorization: Bearer YOUR_CRON_SECRET
```

---

## 🎨 UI Integration Examples

### Add to Admin Dashboard

```typescript
// app/admin/dashboard/page.tsx

import { MorningBrief } from '@/components/MorningBrief';

export default function AdminDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
      
      {/* Add Morning Brief Widget */}
      <div className="mb-6">
        <MorningBrief />
      </div>

      {/* Your existing dashboard content */}
      <div className="grid grid-cols-3 gap-4">
        {/* Stats cards, charts, etc. */}
      </div>
    </div>
  );
}
```

### Add Feedback to Job Completion Flow

```typescript
// In your job completion handler
import { TrainingFeedbackModal } from '@/components/TrainingFeedbackModal';

const handleJobComplete = async (job) => {
  // ... existing job completion logic
  
  // Show feedback modal if customer used AI
  if (job.aiPrediction) {
    setShowFeedbackModal(true);
  }
};

const handleFeedbackSubmit = async (feedback) => {
  await fetch('/api/ai/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: currentJob.id,
      customerChatSummary: currentJob.customerChat,
      aiPrediction: currentJob.aiPrediction,
      ...feedback,
    }),
  });
};
```

---

## 📊 Monitoring & Optimization

### Weekly Review Script

```typescript
// scripts/weekly-ai-review.ts
// Run manually or via another cron (Sundays)

import { db } from '@/db';
import { diagnosisTrainingData } from '@/db/schema';
import { gte } from 'drizzle-orm';
import { aiService } from '@/lib/aiService';

async function weeklyReview() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const feedback = await db
    .select()
    .from(diagnosisTrainingData)
    .where(gte(diagnosisTrainingData.createdAt, oneWeekAgo));

  const analysis = await aiService.analyzeTrainingData(feedback);

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           WEEKLY AI PERFORMANCE REPORT                     ║
╚═══════════════════════════════════════════════════════════╝

📊 Total Diagnoses: ${feedback.length}
✅ Accuracy: ${analysis.accuracy.toFixed(1)}%

🔍 Common Patterns:
${analysis.commonPatterns?.map((p, i) => `   ${i + 1}. ${p}`).join('\n')}

💡 Suggestions:
${analysis.suggestions?.map((s, i) => `   ${i + 1}. ${s}`).join('\n')}

Next Steps: ${
  analysis.accuracy > 80 
    ? '✅ Performance is excellent. Continue current approach.'
    : '⚠️ Consider updating Daktar Vai prompts based on suggestions above.'
}
  `);
}

weeklyReview().catch(console.error);
```

Run manually:
```bash
npx tsx scripts/weekly-ai-review.ts
```

---

## 🚀 Phase 2: AI Chat (Optional - Add Later)

If Phase 1 goes well, add this in Week 3-4:

### Simple Query Templates

```typescript
// lib/queryTemplates.ts

export const QUERY_TEMPLATES = {
  'top-technicians': {
    name: 'Top Performing Technicians',
    keywords: ['best tech', 'top technician', 'who completed most'],
    handler: async (params) => {
      const period = params.period || 'this-month';
      // Run your SQL query
      return `This month, [Name] completed the most jobs with X repairs.`;
    },
  },
  'inventory-alerts': {
    name: 'Low Stock Items',
    keywords: ['low stock', 'inventory alert', 'what should i order'],
    handler: async (params) => {
      // Query inventory
      return `You need to reorder: [list of items below threshold].`;
    },
  },
  // Add 8-10 more templates
};

export async function matchQueryTemplate(userQuery: string) {
  const query = userQuery.toLowerCase();
  
  for (const [key, template] of Object.entries(QUERY_TEMPLATES)) {
    if (template.keywords.some(kw => query.includes(kw))) {
      return { templateKey: key, template };
    }
  }
  
  return null;
}
```

---

## 🎯 Success Metrics (Track These)

### Week 1-2 Goals:
- ✅ Morning Brief generated successfully 5/7 days
- ✅ At least 10 training feedback entries collected
- ✅ Zero production errors from AI service
- ✅ Admin users check Morning Brief at least 3x/week

### Month 1 Goals:
- ✅ 80%+ of Morning Brief insights are actionable (survey Shuvo)
- ✅ Diagnosis accuracy baseline established (collect 30+ feedbacks)
- ✅ AI costs stay under $5/month
- ✅ Decision to proceed with Phase 2 or iterate

---

## 💡 Pro Tips

### 1. Start Simple, Iterate Fast
> Don't overthink the prompts. Launch with "good enough" and refine based on real feedback.

### 2. Cache Everything You Can
> At your scale, you could cache Morning Brief for entire day (regenerate only if admin clicks "Refresh")

### 3. Monitor Costs Weekly
```typescript
// Simple cost tracker
const estimateCost = (promptTokens: number, responseTokens: number) => {
  const inputCost = (promptTokens / 1_000_000) * 0.075; // Flash pricing
  const outputCost = (responseTokens / 1_000_000) * 0.30;
  return inputCost + outputCost;
};
```

### 4. Use Vercel Logs
> Enable Vercel logs to track AI performance and errors (free tier includes basic logs)

### 5. Backup with Static Analysis
> If Gemini API is down, show basic stats instead of breaking the UI

---

## 🔮 Future Enhancements (Month 2+)

### If This Goes Well:

1. **Predictive Alerts:**  
   "Samsung Model X tends to need backlight service after 18 months. You have 5 customers approaching this threshold."

2. **Smart Scheduling:**  
   "Assign this job to Rahim - he's closest and has 90% success rate with this issue type."

3. **Customer Communication:**  
   Auto-generate SMS updates: "Your TV is 80% complete. Ready for pickup tomorrow!"

4. **Inventory Optimization:**  
   "Based on trends, order 10 backlights by Friday to avoid stockouts."

---

## 📞 Support & Next Steps

### Immediate Actions:

1. **Get Gemini API Key:**
   - Go to: https://makersuite.google.com/app/apikey
   - Create project
   - Generate API key (FREE tier: 60 requests/minute, plenty for your scale)

2. **Add Dependencies:**
   ```bash
   npm install @google/generative-ai
   ```

3. **Create Database Tables:**
   - Add schema code above
   - Run `npm run db:push`

4. **Deploy Cron:**
   - Add `vercel.json`
   - Push to production
   - Test cron endpoint

---

## ❓ FAQ

**Q: What if I exceed Gemini free tier?**  
A: At 20 jobs/day, you'll use ~1,000 requests/month. Free tier is 60 requests/minute (unlimited monthly). You won't exceed it.

**Q: Can I test cron jobs locally?**  
A: Yes! Use `vercel dev` and call the endpoint manually with curl.

**Q: What if AI generates wrong insights?**  
A: That's why we collect feedback! Over time, you'll refine prompts. Start permissive, improve iteratively.

**Q: Do I need Pro model for anything?**  
A: Not at your scale. Flash is perfect for all 4 modules.

**Q: Can I use this with my existing admin panel?**  
A: Yes! The modal and brief components are standalone React components. Drop them anywhere.

---

## 🎉 Final Thoughts

At your scale (5-20 jobs/day, 2-5 admins), this AI layer will cost **less than a cup of coffee per month** but could save **hours of manual analysis**.

**The key insight:** You're not building Jarvis from Iron Man. You're building a smart assistant that:
- Notices patterns you might miss
- Learns from technician expertise
- Saves time on repetitive analysis

Start with Morning Brief + Training Loop. If it works, expand. If it doesn't, you've only invested 2 weeks.

**Ready to begin? Let me know if you need help with any specific part of the implementation!** 🚀
