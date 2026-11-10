/**
 * BrandGuard AI - Compliance Engine Core Logic
 * Evaluates marketing content against brand guidelines.
 */

export interface BrandRule {
  forbiddenWords: string[];
  replacements: Record<string, string>; // e.g. { 'cheap': 'cost-effective' }
  toneRules: {
    noHyperbole: boolean;
    maxExclamationMarks: number;
    noAllCapsWords: boolean;
  };
  requiredDisclaimers: string[];
}

export interface Violation {
  id: string;
  type: 'critical' | 'tone' | 'approved_term' | 'disclaimer';
  title: string;
  description: string;
  match?: string;
  suggestion?: string;
  position?: number;
}

export interface ComplianceReport {
  score: number; // 0 to 100
  status: 'Passed' | 'Warning' | 'Rejected';
  violations: Violation[];
  metrics: {
    totalViolations: number;
    criticalCount: number;
    toneCount: number;
    suggestionsCount: number;
    wordCount: number;
    readingTimeMinutes: number;
  };
  timestamp: string;
  contentType: string;
}

/**
 * Parses free-form brand guidelines text into structured rules.
 */
export function parseBrandGuidelines(guidelinesText: string): BrandRule {
  const rules: BrandRule = {
    forbiddenWords: [],
    replacements: {},
    toneRules: {
      noHyperbole: true,
      maxExclamationMarks: 1,
      noAllCapsWords: true,
    },
    requiredDisclaimers: [],
  };

  const lines = guidelinesText.split('\n').map((l) => l.trim()).filter(Boolean);

  let currentSection = '';

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.includes('forbidden') || lower.includes('banned') || lower.includes('do not use')) {
      currentSection = 'forbidden';
    } else if (lower.includes('approved') || lower.includes('terminology') || lower.includes('replacements') || lower.includes('preferred')) {
      currentSection = 'replacements';
    } else if (lower.includes('disclaimer') || lower.includes('legal') || lower.includes('mandatory')) {
      currentSection = 'disclaimers';
    } else if (lower.includes('tone') || lower.includes('voice')) {
      currentSection = 'tone';
    }

    // Parse arrow replacement: "cheap -> affordable" or "cheap => cost-effective" or "use X instead of Y"
    if (line.includes('->') || line.includes('=>') || line.includes(':') && currentSection === 'replacements') {
      const parts = line.split(/->|=>|:/);
      if (parts.length >= 2) {
        const key = parts[0].replace(/^[-*•\d.]\s*/, '').trim().toLowerCase();
        const val = parts[1].trim();
        if (key && val) {
          rules.replacements[key] = val;
        }
      }
    }

    // Parse bullet or list items
    const itemMatch = line.match(/^[-*•\d.]\s*(.*)$/);
    const itemContent = itemMatch ? itemMatch[1].trim() : line;

    if (currentSection === 'forbidden' && itemContent) {
      // Split on commas if multiple words listed
      const words = itemContent.split(',').map((w) => w.trim()).filter((w) => w.length > 1 && !w.toLowerCase().includes('forbidden'));
      for (const word of words) {
        const cleaned = word.replace(/["'()]/g, '').trim();
        if (cleaned && !rules.forbiddenWords.includes(cleaned.toLowerCase())) {
          rules.forbiddenWords.push(cleaned.toLowerCase());
        }
      }
    }

    if (currentSection === 'disclaimers' && itemContent) {
      const cleaned = itemContent.replace(/^[-*•\d.]\s*/, '').trim();
      if (cleaned.length > 4 && !cleaned.toLowerCase().includes('disclaimer:')) {
        rules.requiredDisclaimers.push(cleaned);
      }
    }
  }

  // Fallback default forbidden phrases if text doesn't provide enough structure
  if (rules.forbiddenWords.length === 0) {
    rules.forbiddenWords = ['guaranteed return', 'risk-free', 'get rich', '100% safe', 'foolproof', 'insane discount'];
  }

  return rules;
}

/**
 * Analyzes marketing content against parsed guidelines and generates a compliance report.
 */
export function analyzeCompliance(
  content: string,
  guidelinesText: string,
  contentType: string = 'Social Post'
): ComplianceReport {
  const rules = parseBrandGuidelines(guidelinesText);
  const violations: Violation[] = [];
  const words = content.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (!content.trim()) {
    return {
      score: 100,
      status: 'Passed',
      violations: [],
      metrics: {
        totalViolations: 0,
        criticalCount: 0,
        toneCount: 0,
        suggestionsCount: 0,
        wordCount: 0,
        readingTimeMinutes: 0,
      },
      timestamp: new Date().toISOString(),
      contentType,
    };
  }

  const contentLower = content.toLowerCase();

  // 1. Check Forbidden Words (Critical)
  for (const forbidden of rules.forbiddenWords) {
    if (!forbidden) continue;
    const regex = new RegExp(`\\b${escapeRegExp(forbidden)}\\b`, 'gi');
    let match;
    while ((match = regex.exec(content)) !== null) {
      violations.push({
        id: `crit-${violations.length + 1}`,
        type: 'critical',
        title: `Forbidden Term Used: "${match[0]}"`,
        description: `The term "${match[0]}" is explicitly forbidden under the active brand governance guidelines.`,
        match: match[0],
        position: match.index,
      });
    }
  }

  // 2. Check Approved Terminology Replacements
  for (const [discouraged, preferred] of Object.entries(rules.replacements)) {
    const regex = new RegExp(`\\b${escapeRegExp(discouraged)}\\b`, 'gi');
    let match;
    while ((match = regex.exec(content)) !== null) {
      violations.push({
        id: `term-${violations.length + 1}`,
        type: 'approved_term',
        title: `Non-Standard Term: "${match[0]}"`,
        description: `Consider replacing "${match[0]}" with the approved brand terminology: "${preferred}".`,
        match: match[0],
        suggestion: preferred,
        position: match.index,
      });
    }
  }

  // 3. Tone & Style Checks
  // Check excessive exclamation marks
  const exclamationMatches = content.match(/!{2,}/g) || [];
  const singleExclamations = (content.match(/!/g) || []).length;
  if (exclamationMatches.length > 0 || singleExclamations > 2) {
    violations.push({
      id: `tone-${violations.length + 1}`,
      type: 'tone',
      title: 'Excessive Punctuation',
      description: 'Multiple or repetitive exclamation marks detected. Brand tone requires measured, confident communication.',
      suggestion: 'Reduce exclamation marks to 1 or replace with periods.',
    });
  }

  // Check ALL CAPS words (excluding acronyms of 2-4 letters like FDIC, AI, API, USD)
  const allCapsWords = words.filter((w) => {
    const clean = w.replace(/[^a-zA-Z]/g, '');
    const allowedAcronyms = ['AI', 'API', 'USD', 'FDIC', 'SEC', 'SaaS', 'B2B', 'ROI', 'APR', 'LLC', 'CEO', 'CTO'];
    return clean.length >= 4 && clean === clean.toUpperCase() && !allowedAcronyms.includes(clean);
  });

  if (allCapsWords.length > 0) {
    violations.push({
      id: `tone-${violations.length + 1}`,
      type: 'tone',
      title: `All-Caps Phrasing: "${allCapsWords.slice(0, 3).join(', ')}"`,
      description: 'Screaming capitalization weakens trust and violates editorial style guidelines.',
      suggestion: 'Use sentence casing or italics for emphasis.',
    });
  }

  // Check Hyperbolic claims
  const hypeWords = ['best ever', 'unbeatable', 'guaranteed success', 'miracle', 'revolutionary shortcut', 'no catch'];
  for (const hype of hypeWords) {
    if (contentLower.includes(hype)) {
      violations.push({
        id: `tone-${violations.length + 1}`,
        type: 'tone',
        title: `Hyperbolic Claim: "${hype}"`,
        description: 'Overpromising marketing claims degrade credibility and trigger compliance flags.',
        suggestion: 'State factual benefits backed by quantifiable evidence.',
      });
    }
  }

  // 4. Content-Type Specific Length & Disclaimers
  if (contentType === 'Social Post' && content.length > 300) {
    violations.push({
      id: `tone-${violations.length + 1}`,
      type: 'tone',
      title: 'Social Post Length Warning',
      description: `Post is ${content.length} characters long. Concise posts under 280-300 chars have 3x higher engagement.`,
      suggestion: 'Trim non-essential fluff or split into a thread.',
    });
  }

  if (contentType === 'Ad Copy' && content.length > 150) {
    violations.push({
      id: `tone-${violations.length + 1}`,
      type: 'tone',
      title: 'Ad Copy Exceeds Recommended Limit',
      description: 'Ad headline and description should be under 150 characters for standard display/search placements.',
    });
  }

  // 5. Required Disclaimers
  for (const disclaimer of rules.requiredDisclaimers) {
    if (!contentLower.includes(disclaimer.toLowerCase())) {
      violations.push({
        id: `disc-${violations.length + 1}`,
        type: 'disclaimer',
        title: `Missing Required Disclaimer: "${disclaimer}"`,
        description: `Active guidelines mandate inclusion of "${disclaimer}" for this publication.`,
        suggestion: `Append: "${disclaimer}"`,
      });
    }
  }

  // Compute Score (0-100)
  const criticalCount = violations.filter((v) => v.type === 'critical' || v.type === 'disclaimer').length;
  const toneCount = violations.filter((v) => v.type === 'tone').length;
  const suggestionsCount = violations.filter((v) => v.type === 'approved_term').length;

  let penalty = criticalCount * 25 + toneCount * 10 + suggestionsCount * 8;
  const score = Math.max(0, Math.min(100, 100 - penalty));

  let status: 'Passed' | 'Warning' | 'Rejected' = 'Passed';
  if (criticalCount > 0 || score < 60) {
    status = 'Rejected';
  } else if (score < 85 || toneCount > 0 || suggestionsCount > 0) {
    status = 'Warning';
  }

  return {
    score,
    status,
    violations,
    metrics: {
      totalViolations: violations.length,
      criticalCount,
      toneCount,
      suggestionsCount,
      wordCount,
      readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 200)),
    },
    timestamp: new Date().toISOString(),
    contentType,
  };
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
