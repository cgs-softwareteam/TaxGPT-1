/**
 * Helpers for building JSON-LD schema.org objects that individual pages
 * emit via the <Seo/> component. The site-wide SoftwareApplication +
 * Organization + WebSite schemas live in client/index.html; these are
 * per-page additions (WebPage, BreadcrumbList, FAQPage, etc.).
 *
 * Every helper returns a plain object; the <Seo/> component stringifies
 * and injects it in a <script type="application/ld+json"> tag.
 */

const BASE_URL = "https://aitaxmd.com";

interface WebPageInput {
  /** Page name — usually mirrors the <title>. */
  name: string;
  /** SERP-facing description of the page. */
  description?: string;
  /** Absolute or path URL. Defaults to BASE_URL. */
  url?: string;
}

/** Basic WebPage node bound to the site's WebSite. */
export function makeWebPage({ name, description, url }: WebPageInput) {
  const fullUrl = url
    ? url.startsWith("http")
      ? url
      : `${BASE_URL}${url}`
    : BASE_URL;
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    ...(description && { description }),
    url: fullUrl,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: "AITaxMD",
      url: BASE_URL,
    },
  };
}

interface BreadcrumbItem {
  name: string;
  /** Absolute or path URL. */
  url: string;
}

/**
 * BreadcrumbList schema — tells Google the navigation hierarchy.
 * Google renders these in the SERP snippet ("aitaxmd.com > Privacy Policy")
 * instead of the raw URL, which lifts click-through.
 */
export function makeBreadcrumb(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${BASE_URL}${item.url}`,
    })),
  };
}

interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * FAQPage schema — the highest-leverage per-page schema. Google can
 * render these as expandable snippets directly in search results,
 * doubling or tripling organic click-through on informational queries.
 *
 * Important: Google requires the FAQ content to be VISIBLE on the page
 * that emits this schema. Don't ship the schema without also rendering
 * the FAQ text to users, or you risk a manual action.
 */
export function makeFaqPage(entries: FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  };
}

/**
 * Site-wide FAQ list. Rendered visibly on the /faq page so the FAQPage
 * schema on that route reflects real page content (Google requires FAQ
 * schema content to be visible to users).
 */
export const FAQS: FaqEntry[] = [
  {
    question: "What is AITaxMD?",
    answer:
      "AITaxMD is an AI-powered tax planning assistant built for US entrepreneurs, doctors, freelancers, and business owners. You share a few details about your financial situation and AITaxMD generates a personalized tax-savings plan with strategies, estimated savings, and action steps.",
  },
  {
    question: "Is AITaxMD free to use?",
    answer:
      "Yes. AITaxMD includes a free tier that lets you generate a personalized tax-savings plan and ask general tax questions. Signing up with a free account unlocks more planning sessions, the ability to save and revisit your plans, and PDF export.",
  },
  {
    question: "Who should use AITaxMD?",
    answer:
      "AITaxMD is built for US professionals — physicians, freelancers, W-2 employees, entrepreneurs, and small-business owners looking for tailored tax-saving strategies without the cost of a full-service accountant. It's especially useful for people with variable income, side businesses, or profession-specific deductions.",
  },
  {
    question: "Is AITaxMD a substitute for a CPA or tax professional?",
    answer:
      "No. AITaxMD provides educational tax planning guidance to help you understand strategies and identify opportunities. Always consult with a qualified tax professional or CPA before implementing any tax strategies described in your plan.",
  },
  {
    question: "What information does AITaxMD need to build my plan?",
    answer:
      "AITaxMD asks for your approximate annual income, state of residence, age, tax paid last year, and profession — all in a single question. You reply once with all five details and the AI generates a personalized plan immediately. No back-and-forth.",
  },
  {
    question: "Is my data safe with AITaxMD?",
    answer:
      "Yes. AITaxMD uses bank-level encryption in transit and at rest. Your personal financial data is never shared with the IRS or third parties. You can request permanent deletion of your account and personal data at any time from the Data Deletion page.",
  },
];
