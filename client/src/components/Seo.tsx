import { Helmet } from "react-helmet-async";

interface SeoProps {
  /** Full page title. Include the brand — e.g. "Privacy Policy | AITaxMD". */
  title: string;
  /** SERP meta description. Keep under ~160 chars so Google doesn't truncate. */
  description?: string;
  /** Comma-separated keywords list. Low SEO weight today, but harmless. */
  keywords?: string;
  /**
   * When true, emits `<meta name="robots" content="noindex, nofollow">` so
   * this page never appears in search results. Use for private / logged-in
   * pages (admin dashboard, user usage, saved plans, 404).
   */
  noindex?: boolean;
  /**
   * Full absolute canonical URL for this page. Defaults to the current
   * pathname joined onto BASE_URL. Only set explicitly when you need a
   * different canonical (e.g. duplicate content pointing to a primary URL).
   */
  canonical?: string;
  /** Absolute URL of the Open Graph image. Defaults to the site-wide preview. */
  ogImage?: string;
  /**
   * Per-page JSON-LD schema.org objects (or an array of them). Injected
   * as <script type="application/ld+json"> tags in <head>. Use the
   * helpers in @/lib/schema (makeWebPage, makeBreadcrumb, makeFaqPage).
   * Site-wide schemas (SoftwareApplication, Organization, WebSite) are
   * already in client/index.html — this prop is for page-specific ones.
   */
  schema?: object | object[];
}

/**
 * Safely encode a schema object into a string that can live inside a
 * <script type="application/ld+json"> tag. The `<` → `<` escape
 * prevents any `</script>` sequence inside a value from breaking out
 * of the script tag (a classic JSON-in-HTML injection surface).
 */
function encodeSchema(obj: object): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

// Base URL of the production site. Used to build absolute canonicals /
// og:url values from a path.
const BASE_URL = "https://aitaxmd.com";
const DEFAULT_OG_IMAGE = `${BASE_URL}/taxgpt-preview.svg`;

/**
 * Per-route SEO tag manager. Mounts <Helmet> and lets each page override
 * the site-wide title / description / keywords / canonical / OG image / robots.
 *
 * The site-wide fallback values live in client/index.html — this component
 * only overrides them for pages that need something different, and cleans
 * up on unmount so the fallback comes back when the user navigates away.
 */
export function Seo({
  title,
  description,
  keywords,
  noindex,
  canonical,
  ogImage,
  schema,
}: SeoProps) {
  // Compute canonical from current path when not explicitly provided.
  const path =
    typeof window !== "undefined" ? window.location.pathname : "/";
  const resolvedCanonical = canonical ?? `${BASE_URL}${path}`;
  const resolvedOgImage = ogImage ?? DEFAULT_OG_IMAGE;

  // Normalize schema to an array so the render is a single map.
  const schemaList = schema
    ? Array.isArray(schema)
      ? schema
      : [schema]
    : [];

  return (
    <Helmet>
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      {keywords && <meta name="keywords" content={keywords} />}

      {/* Robots — noindex private pages so they don't appear in search. */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Canonical URL — tells Google which URL is the primary one for
          this content. Prevents duplicate-content penalties. */}
      <link rel="canonical" href={resolvedCanonical} />

      {/* Open Graph — controls Facebook / LinkedIn / Slack unfurls. */}
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={resolvedCanonical} />
      <meta property="og:image" content={resolvedOgImage} />

      {/* Twitter Card — controls X (Twitter) unfurls. */}
      <meta property="twitter:title" content={title} />
      {description && (
        <meta property="twitter:description" content={description} />
      )}
      <meta property="twitter:url" content={resolvedCanonical} />
      <meta property="twitter:image" content={resolvedOgImage} />

      {/* Per-page JSON-LD structured data. Content is HTML-safe encoded
          so any user-provided string can't break out of the <script> tag. */}
      {schemaList.map((s, i) => (
        <script key={i} type="application/ld+json">
          {encodeSchema(s)}
        </script>
      ))}
    </Helmet>
  );
}
