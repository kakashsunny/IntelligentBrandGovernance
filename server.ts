import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API endpoint for Brand Review using the GEMINI_API_KEY from environment secrets
  app.post('/api/review', async (req, res) => {
    try {
      const { guidelines, content, contentType, apiKey: clientApiKey } = req.body;
      const apiKey = (clientApiKey && clientApiKey.trim() !== '' && !clientApiKey.startsWith('API_KEY_'))
        ? clientApiKey.trim()
        : process.env.GEMINI_API_KEY;

      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey === 'API_KEY_HERE') {
        return res.status(400).json({
          error: 'GEMINI_API_KEY is not configured or is placeholder.'
        });
      }

      const SYSTEM_PROMPT = `You are BrandGuard AI, a strict brand compliance reviewer.
The user has provided their Brand Guidelines and a piece of marketing content to review.
Your job is to review the content against the guidelines and return a JSON response in this exact format:

{
  "overall_status": "BLOCKED" | "WARNINGS" | "APPROVED",
  "summary": "One sentence summary of the review",
  "violations": [
    {
      "excerpt": "the exact words from the content that are problematic",
      "rule_broken": "which guideline rule this violates",
      "severity": "Blocker" | "Warning" | "Suggestion",
      "fix": "suggested rewrite or fix"
    }
  ]
}

If there are no violations, return violations as an empty array and overall_status as "APPROVED".
Return ONLY the JSON. No explanation text outside the JSON.`;

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents: [
            {
              parts: [
                {
                  text: `CONTENT TYPE: ${contentType}\n\nBRAND GUIDELINES:\n${guidelines}\n\nMARKETING CONTENT TO REVIEW:\n${content}`
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1
          }
        })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        return res.status(response.status).json({
          error: errorBody.error?.message || `Gemini API error HTTP ${response.status}`
        });
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      const cleanText = rawText ? rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim() : '{}';
      const parsed = JSON.parse(cleanText);

      return res.json(parsed);
    } catch (err: any) {
      console.error('Server /api/review error:', err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // Mount Vite middlewares for HMR / static serving in development
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BrandGuard AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
