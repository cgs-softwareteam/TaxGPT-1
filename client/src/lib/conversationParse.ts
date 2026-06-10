/**
 * Lightweight regex-based extractor that pulls signal out of an in-progress
 * conversation so the auth dialog and nudges can personalize copy.
 *
 * Used by:
 *   - AuthDialog (limit-reached mode) to show "$X savings as a <profession>"
 *   - Home (mid-conversation triggers) to detect when the AI has emitted a
 *     full structured report
 *
 * All fields are best-effort. If a value can't be confidently parsed it's
 * returned as undefined and callers fall back to generic copy.
 */

export interface ParsedTaxContext {
  /** Most recent dollar amount the AI reported as "Estimated Potential Tax Savings". */
  estimatedSavings?: number;
  /** A short, human-readable profession label (e.g. "physician", "freelancer"). */
  profession?: string;
  /** US state name if we could detect one in the conversation. */
  state?: string;
  /** True when conversation text contains medical-profession signals. */
  isMedicalProfessional: boolean;
}

interface Message {
  role: string;
  content: string;
}

// Markers that indicate the AI generated the full structured report (Phase 2
// in the system prompt). Either marker alone is enough — both should appear
// together in a complete report.
const REPORT_MARKER =
  /(✅\s*\*\*Scenario Title|💰\s*\*\*Estimated Potential Tax Savings)/i;

/** True when the assistant message contains the structured tax report format. */
export function isStructuredReport(content: string): boolean {
  return REPORT_MARKER.test(content);
}

/**
 * Walk the conversation backwards and return the most recent assistant
 * message that contains a full structured tax report. Used to decide
 * whether to show the "Email me my plan" section in AuthDialog.
 */
export function findLatestReportContent(
  messages: readonly Message[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && isStructuredReport(m.content)) {
      return m.content;
    }
  }
  return undefined;
}

// Comprehensive US state name list (no abbreviations to keep false-positive
// risk low — "OR" / "IN" / "ME" as abbreviations would match too much).
const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
  "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
  "Washington", "West Virginia", "Wisconsin", "Wyoming",
];
const STATE_REGEX = new RegExp(
  `\\b(${US_STATES.join("|")})\\b`,
  "i"
);

const MEDICAL_REGEX =
  /\b(doctor|physician|medical\s+practice|medical\s+professional|clinician|surgeon|dentist|md\b|orthopedic|cardiologist|radiologist|anesthesiologist)\b/i;

/**
 * Parse a conversation history into structured signal for personalized copy.
 * Cheap — pure string / regex work, safe to call on every render.
 */
export function parseTaxContext(messages: readonly Message[]): ParsedTaxContext {
  const allText = messages.map((m) => m.content).join("\n");
  const lower = allText.toLowerCase();

  // 1. Estimated savings — pull from the MOST RECENT assistant message that
  // contains the marker. The system prompt instructs the AI to format it as
  // "💰 **Estimated Potential Tax Savings:** $X,XXX" but be permissive about
  // punctuation in case the model varies.
  let estimatedSavings: number | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "assistant") continue;
    const m = messages[i].content.match(
      /Estimated\s+Potential\s+Tax\s+Savings:?\s*\**\s*\$?\s*([\d,]+(?:\.\d+)?)/i,
    );
    if (m) {
      const cleaned = m[1].replace(/,/g, "");
      const n = parseFloat(cleaned);
      if (!Number.isNaN(n) && n > 0) {
        estimatedSavings = Math.round(n);
        break;
      }
    }
  }

  // 2. Medical-professional detection — same heuristics the server uses.
  const isMedicalProfessional = MEDICAL_REGEX.test(allText);

  // 3. Profession label. Order matters: most specific first.
  let profession: string | undefined;
  if (isMedicalProfessional) {
    profession = "physician";
  } else if (/\b(freelanc|gig\s+work|1099|contractor|self.?employ)/i.test(lower)) {
    profession = "freelancer";
  } else if (/\b(business\s+owner|entrepreneur|startup|founder|small\s+business)/i.test(lower)) {
    profession = "entrepreneur";
  } else if (/\b(consultant|consulting)/i.test(lower)) {
    profession = "consultant";
  }

  // 4. State - require a context word ("in", "from", "live", "reside",
  // "state of") immediately before the state name to reduce false positives
  // like "Georgia on my tax form".
  let state: string | undefined;
  const stateContext = allText.match(
    new RegExp(`\\b(?:in|from|live\\s+in|reside\\s+in|state\\s+of|based\\s+in)\\s+(${US_STATES.join("|")})\\b`, "i"),
  );
  if (stateContext) {
    state = stateContext[1];
  } else {
    // Fallback: bare state name, only if it appears with capitalization
    // (suggesting the user typed it as a proper noun answer to a question).
    const bareMatch = allText.match(STATE_REGEX);
    if (bareMatch) state = bareMatch[1];
  }
  // Normalize casing (the regex is case-insensitive but we want the canonical form).
  if (state) {
    const canonical = US_STATES.find((s) => s.toLowerCase() === state!.toLowerCase());
    if (canonical) state = canonical;
  }

  return { estimatedSavings, profession, state, isMedicalProfessional };
}

/** Format a dollar amount like `$12,500`. Returns undefined for nullish input. */
export function formatUsd(amount: number | undefined): string | undefined {
  if (amount === undefined || amount === null) return undefined;
  return `$${amount.toLocaleString("en-US")}`;
}
