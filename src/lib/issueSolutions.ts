import type { FilterKey } from "./filters";

export interface IssueSolution {
  title: string;
  problem: string;
  fix: string;
  source: { label: string; url: string };
}

export const ISSUE_SOLUTIONS: Partial<Record<FilterKey, IssueSolution>> = {
  "4xx5xx": {
    title: "Pages returning 4xx/5xx errors",
    problem:
      "A 4xx means the URL is genuinely invalid and gets dropped from the index; a 5xx means Googlebot couldn't even read the page, and repeated server errors can make Google slow down or pause crawling your site.",
    fix: "For 404s, either restore the page, 301-redirect it to a relevant live page, or leave it as a real 404 (that's fine — it just shouldn't be linked to from elsewhere on the site). For 5xx errors, check server logs and resource limits: these usually mean the origin is overloaded, timing out, or misconfigured, not a content problem.",
    source: {
      label: "Google Search Central — HTTP status codes, network and DNS errors",
      url: "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
    },
  },
  missingTitle: {
    title: "Missing page title",
    problem: "Without a <title> element Google has to auto-generate a title for search results, and it usually picks something worse than what you'd write yourself.",
    fix: "Add a unique, descriptive <title> in the <head> of the page. Put the specific topic first, avoid vague titles like \"Home\" or \"Untitled\", and don't reuse the same title across different pages.",
    source: {
      label: "Google Search Central — Influencing title links in Google Search",
      url: "https://developers.google.com/search/docs/appearance/title-link",
    },
  },
  titleTooShort: {
    title: "Title tag is very short",
    problem: "Google has confirmed there's no fixed length limit or minimum for titles, but a very short title (under ~30 characters) is often too vague to differentiate the page or use the available search-result space well.",
    fix: "Expand the title to describe the page's specific topic, not just a single word or brand name. Aim for something a user could distinguish from your other pages at a glance.",
    source: {
      label: "Google Search Central — Influencing title links in Google Search",
      url: "https://developers.google.com/search/docs/appearance/title-link",
    },
  },
  titleTooLong: {
    title: "Title tag is very long",
    problem: "Google truncates displayed titles by rendered pixel width (roughly 580-600px on desktop), not a fixed character count, so long titles risk being cut off — and Google may substitute its own generated title instead of using yours at all.",
    fix: "Front-load the important, specific part of the title (topic/product first), and trim filler words. There's no hard character cap to hit, but keeping it near 50-60 characters is a safe practical target to avoid truncation.",
    source: {
      label: "Google Search Central — Influencing title links in Google Search",
      url: "https://developers.google.com/search/docs/appearance/title-link",
    },
  },
  duplicateTitles: {
    title: "Duplicate titles across pages",
    problem: "When multiple pages share a title, Google can't use it to tell users (or itself) which page is which, and it undermines the \"unique to the page\" guidance Google gives directly.",
    fix: "Write a distinct title for each page reflecting what's actually different about it (product name, category, date, etc.). If the pages are true duplicates of each other, consolidate them with a canonical instead of writing different titles for the same content.",
    source: {
      label: "Google Search Central — Influencing title links in Google Search",
      url: "https://developers.google.com/search/docs/appearance/title-link",
    },
  },
  missingMeta: {
    title: "Missing meta description",
    problem: "Google will still generate a snippet from page content without one, but a written meta description lets you control that pitch instead of leaving it to automatic extraction.",
    fix: "Add a concise, accurate <meta name=\"description\"> summarizing the page's actual content — treat it as ad copy for the search result, not a keyword dump. It's optional, not required, but worth doing on pages you want to control the click-through pitch for.",
    source: {
      label: "Google Search Central — How to write meta descriptions",
      url: "https://developers.google.com/search/docs/appearance/snippet",
    },
  },
  h1Issues: {
    title: "Missing or multiple H1 headings",
    problem: "This one is genuinely disputed: Google's John Mueller has stated multiple times that Google's systems have no problem with zero, one, or many H1s on a page and it isn't a ranking factor. The stronger reason to care is accessibility and document structure, not SEO — screen reader users rely on a sensible heading hierarchy to navigate a page, and W3C guidance treats a single top-level heading with nested subheadings as the clean pattern (though it's not a strict WCAG conformance failure either way).",
    fix: "Use one H1 that reflects the page's main topic, then structure the rest of the content with H2/H3 in a logical nesting order. Don't chase this purely for SEO — do it because it makes the page's outline sensible for a screen reader or a skim-reading human.",
    source: {
      label: "W3C WAI — Headings tutorial",
      url: "https://www.w3.org/WAI/tutorials/page-structure/headings/",
    },
  },
  duplicateContent: {
    title: "Duplicate or near-identical content",
    problem: "When multiple URLs serve the same content, Google has to pick one as canonical itself, which can dilute ranking signals (links, engagement) that would otherwise all point to a single URL.",
    fix: "Pick one preferred URL per piece of content and add <link rel=\"canonical\" href=\"...\"> pointing to it from every duplicate. Make sure the canonical target actually contains that content, returns 200, and isn't itself redirected elsewhere.",
    source: {
      label: "Google Search Central — Consolidate duplicate URLs",
      url: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
    },
  },
  lowTextRatio: {
    title: "Low text-to-HTML ratio",
    problem: "Worth flagging honestly: Google's John Mueller has said text-to-HTML ratio \"makes no sense\" as an SEO metric and isn't something Google uses directly — ignore any tool that presents it as a ranking factor. It can still be a useful proxy for two unrelated things worth checking manually: bloated/unminified markup hurting load time, or a page that's genuinely thin on real content relative to its boilerplate.",
    fix: "Don't optimize for the ratio number itself. Instead look at what's actually driving it: if the HTML is full of unminified inline styles/scripts, that's a performance issue (see the minification check); if the page has very little real content, that's a content-quality issue worth addressing on its own merits.",
    source: {
      label: "Search Engine Roundtable — Google: text-to-HTML ratio makes no sense for SEO",
      url: "https://www.seroundtable.com/google-text-to-html-ratio-seo-35753.html",
    },
  },
  missingAlt: {
    title: "Images missing alt text",
    problem: "Alt text is a WCAG Level A requirement (the baseline conformance level) — without it, screen reader users get no information about what an image conveys, and Google also uses alt text to understand image content for image search.",
    fix: "Add alt text describing the image's purpose/content for meaningful images. For purely decorative images (dividers, spacers), use an empty alt=\"\" rather than omitting the attribute — that's the correct way to tell assistive tech to skip it, and this crawler doesn't flag empty alt as missing for that reason.",
    source: {
      label: "W3C WAI — Understanding SC 1.1.1 Non-text Content",
      url: "https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html",
    },
  },
  nofollowLinks: {
    title: "Internal links marked nofollow",
    problem: "This is usually a leftover from \"PageRank sculpting\" — an old tactic to concentrate link equity that Google closed off back in 2009 (nofollowed links still consume a share of the page's outbound equity, they just don't pass it anywhere). Since 2019, nofollow/sponsored/ugc are treated as hints, not directives, so Google may still crawl the link anyway. Practically, nofollow on your own internal navigation rarely does what people think it does, and can create orphaned pages that are harder to diagnose.",
    fix: "Nofollow is meant for links you don't want to vouch for — paid placements (rel=\"sponsored\") or user-submitted content (rel=\"ugc\") — not your own internal navigation. If you're trying to hide a page from crawling entirely, use robots.txt or a noindex meta tag instead; if you just don't want it prioritized, restructure internal linking rather than nofollowing it.",
    source: {
      label: "Google Search Central — Qualify outbound links to Google",
      url: "https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links",
    },
  },
  unminified: {
    title: "Unminified HTML",
    problem: "Extra whitespace and comments in the shipped HTML add bytes to every page load for no functional benefit, which is a small but free win for load time.",
    fix: "Minify HTML output as part of your build/deploy step (most static site generators and frameworks support this natively), and pair it with gzip or Brotli compression at the server/CDN level, which typically matters more than minification alone.",
    source: {
      label: "web.dev — General HTML performance considerations",
      url: "https://web.dev/learn/performance/general-html-performance",
    },
  },
  broken: {
    title: "Broken external links or images",
    problem: "A linked resource returning a 4xx/5xx is a dead end for users who click it, and for images it means content silently fails to render.",
    fix: "Update the link/src to the resource's current location, replace it with a working equivalent, or remove it if it's no longer relevant. If it's an external link you don't control, periodically re-check it — external sites restructure without warning.",
    source: {
      label: "Google Search Central — HTTP status codes, network and DNS errors",
      url: "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
    },
  },
  insecureLinks: {
    title: "Insecure (http://) links/resources on an https:// page",
    problem: "Browsers block or auto-upgrade insecure sub-resources on a secure page, and content fetched over plain HTTP can be intercepted or modified in transit by anyone on the network path.",
    fix: "Change the link/resource URL to https:// — most of the time the same resource is already served securely at the same host. If the target genuinely has no HTTPS version, either stop linking to it or proxy/host the resource yourself over HTTPS.",
    source: {
      label: "MDN — Mixed content",
      url: "https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content",
    },
  },
  missingHsts: {
    title: "Missing Strict-Transport-Security header",
    problem: "Without HSTS, a user's very first request to your domain (or any request after their browser forgets your certificate pinning) can go out over plain HTTP, giving an attacker on the network a window to intercept or downgrade the connection before any redirect to HTTPS happens.",
    fix: "Add the header at your web server or CDN, e.g. on nginx: add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always; — start without \"preload\" until you've confirmed HTTPS works correctly everywhere, since preload is very hard to reverse quickly.",
    source: {
      label: "MDN — Strict-Transport-Security header",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security",
    },
  },
  missingLang: {
    title: "Missing <html lang> attribute",
    problem: "This is a WCAG Level A requirement (the baseline conformance level). Without it, screen readers can't select the correct pronunciation/voice, and browsers/translation tools can't reliably detect the page's language.",
    fix: "Add a valid BCP 47 language tag to the root element, e.g. <html lang=\"en\"> or <html lang=\"fr\">. If the page genuinely mixes languages, set lang to whichever language is used for most of the content.",
    source: {
      label: "W3C WAI — Understanding SC 3.1.1 Language of Page",
      url: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html",
    },
  },
  missingHreflang: {
    title: "No hreflang tags found",
    problem: "This is only relevant if your site actually serves multiple language or regional versions of the same content — hreflang has no purpose on a single-language site, so don't treat this as a mandatory fix for every page.",
    fix: "If you do have translated/regional versions of this page, add hreflang link tags pointing to every version (each version should also link back to all the others, including itself), plus an x-default for the fallback. If this is a single-language site, this check simply doesn't apply to you.",
    source: {
      label: "Google Search Central — Tell Google about localized versions of your page",
      url: "https://developers.google.com/search/docs/specialty/international/localized-versions",
    },
  },
  duplicateMeta: {
    title: "Duplicate meta descriptions across pages",
    problem: "When several pages share the same meta description, Google has a harder time telling the pages apart and deciding which one to rank for a given query, and it weakens the relevance signal the description is supposed to carry.",
    fix: "Write a unique, page-specific description for each URL that actually summarizes that page's content — treat it as short ad copy, not a template. For templated pages (pagination, faceted/category pages), build the description dynamically from page-specific fields instead of hardcoding one string across the template.",
    source: {
      label: "Yoast — How to fix duplicate meta tags",
      url: "https://yoast.com/help/how-do-i-fix-duplicate-meta-tags/",
    },
  },
  multipleCanonical: {
    title: "Multiple canonical tags on one page",
    problem: "When a page has more than one rel=\"canonical\" tag, Google may ignore all of them rather than guess which one is authoritative, so the whole canonicalization signal for that page is lost — even if one of the tags was correct.",
    fix: "Edit the page template/HTML so only a single, correct canonical tag is emitted per page. This is usually caused by a CMS/plugin adding its own canonical on top of one already hardcoded in the template — check for that duplication first, then verify with the URL Inspection tool which URL Google is actually treating as canonical.",
    source: {
      label: "Google Search Central — Fix canonicalization issues",
      url: "https://developers.google.com/search/docs/crawling-indexing/canonicalization-troubleshooting",
    },
  },
  brokenCanonicalTarget: {
    title: "Canonical tag points to a broken/non-200 page",
    problem: "If the canonical target 404s, redirects, or otherwise doesn't return a clean 200, Google can't consolidate signals onto it the way the tag intends — this actively confuses indexing rather than helping it.",
    fix: "If the target page still exists at a different URL, correct the canonical to point there (check for typos first). If the target is genuinely gone, either restore it, pick a different live equivalent page to canonicalize to, or — if there's truly no substitute — make the page self-canonical instead of pointing at a dead URL. Never point a canonical at a URL that itself redirects; point directly at the final destination.",
    source: {
      label: "Sitebulb — Canonical points to a URL that is Not Found (404)",
      url: "https://sitebulb.com/hints/indexability/canonical-points-to-a-url-that-is-not-found-404/",
    },
  },
  slowResponse: {
    title: "Slow server response time",
    problem: "Time to first byte (TTFB) sets a floor under Largest Contentful Paint, so a slow-responding server makes good Core Web Vitals scores hard to hit regardless of front-end optimization — and Google's crawl rate itself drops when a site responds slowly or errors, meaning fewer pages get crawled per visit.",
    fix: "Work through causes in order of typical impact: add/verify server-side caching, move hosting physically closer to your users or put a CDN in front of the origin, optimize slow database queries and hot code paths, and if the underlying hosting is simply underpowered or oversold shared hosting, upgrade it. Google's benchmark is TTFB under ~800ms (\"Needs Improvement\" threshold), with under 200ms as the target for a fast site.",
    source: {
      label: "web.dev — Time to First Byte (TTFB)",
      url: "https://web.dev/articles/ttfb",
    },
  },
  missingViewport: {
    title: "Missing viewport meta tag",
    problem: "Without a viewport tag, mobile browsers render the page at a desktop-width layout and then shrink it to fit the screen, producing tiny unreadable text and squished layouts — Google also factors this into mobile usability/page-experience signals.",
    fix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"> inside the <head> of every page template. This is a one-line, site-wide fix once it's added to the shared layout/head partial.",
    source: {
      label: "MDN — Using the viewport meta tag to control layout on mobile",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Viewport_meta_element",
    },
  },
  missingSocialTags: {
    title: "Missing Open Graph / Twitter Card tags",
    problem: "Without Open Graph (and Twitter Card) tags, links to the page shared on social platforms and chat apps fall back to a generic or blank preview instead of a controlled title/description/image card, which measurably hurts click-through on shared links.",
    fix: "Add the core Open Graph set (og:title, og:description, og:image, og:url) to every page, plus a twitter:card tag (e.g. summary_large_image) since Twitter/X doesn't fall back to Open Graph for that field. Make sure the tags are present in the initial server-rendered HTML, not injected client-side only, since most link-preview crawlers don't execute JavaScript — and use an absolute HTTPS URL for og:image, at least 600x314px.",
    source: {
      label: "OpenGraph.to — Missing twitter:card",
      url: "https://www.opengraph.to/articles/missing-twitter-card",
    },
  },
  redirectChainTooLong: {
    title: "Redirect chain (or loop)",
    problem: "Each hop in a redirect chain adds latency and can dilute link equity along the way, and wastes crawl budget; Google's own crawler gives up after 5 hops. If the chain ever loops back on a URL already in the path, it never resolves at all and the browser eventually shows a 'too many redirects' error.",
    fix: "Point the original URL directly at the final destination — update the redirect rule to skip every intermediate hop rather than chaining through them. For a loop specifically, find which rule points back to an earlier URL in the chain and correct or remove it so the chain terminates.",
    source: {
      label: "Search Engine Land — Too many redirects: how to fix loop errors and protect SEO",
      url: "https://searchengineland.com/guide/too-many-redirects",
    },
  },
  orphanPage: {
    title: "Orphan page (in sitemap but not internally linked)",
    problem: "A page with no internal links pointing to it gives Google very little signal that it matters relative to the rest of the site, and John Mueller has said orphaned pages may end up noindexed even if they're listed in the XML sitemap.",
    fix: "Add internal links to the page from relevant, already-indexed pages — aim for a handful of contextual links rather than just one. If it doesn't fit primary navigation, link it from a relevant hub/category page or an HTML sitemap. If the content is genuinely outdated and not worth surfacing, remove it and 301-redirect to a relevant live page instead of leaving it sitemap-only.",
    source: {
      label: "Victorious — How to find orphan pages and fix them for SEO",
      url: "https://victorious.com/blog/orphan-pages/",
    },
  },
  structuredDataErrors: {
    title: "Structured data (JSON-LD) parse/validation errors",
    problem: "A syntax error (mismatched brackets, a trailing comma, an unescaped quote) makes the entire JSON-LD block unparseable, and a missing required property (e.g. no image/author/datePublished for Article) makes an otherwise-valid block ineligible for rich results — either way Google gets nothing usable from it.",
    fix: "Fix JSON syntax errors first (a JSON linter will find these instantly), then check property names match Schema.org vocabulary exactly (camelCase, e.g. datePublished not date_published), then confirm the required properties for that specific type are present. Re-test with Google's Rich Results Test after each fix rather than assuming — passing syntax validation doesn't guarantee rich-result eligibility.",
    source: {
      label: "Google Search Central — Test your structured data",
      url: "https://developers.google.com/search/docs/appearance/structured-data",
    },
  },
  missingStructuredData: {
    title: "No structured data found on page",
    problem: "This is only worth fixing where a matching content type actually applies (articles, products, recipes, events, FAQs, etc.) — structured data isn't a universal requirement, but where it does apply, its absence means the page is ineligible for the corresponding rich result in search (star ratings, price, event dates, etc.), which typically improves click-through.",
    fix: "Add JSON-LD markup (Google's recommended format) matching the page's actual content type, placed in a <script type=\"application/ld+json\"> block in the server-rendered HTML. Only markup content that is genuinely visible on the page — don't invent ratings, prices, or reviews that aren't actually shown to users, since Google explicitly penalizes markup that misrepresents page content.",
    source: {
      label: "Google Search Central — Structured data general guidelines",
      url: "https://developers.google.com/search/docs/appearance/structured-data",
    },
  },
  accessibilityIssues: {
    title: "Accessibility violations (axe-core audit)",
    problem: "axe-core catches automatable WCAG failures — missing form labels, insufficient color contrast, invalid/missing ARIA attributes, missing alt text, and similar issues — that make the page harder or impossible to use with a screen reader or other assistive technology. Note that axe-core only catches an estimated ~57% of issues found in a full manual accessibility audit, since some checks (e.g. whether alt text is actually meaningful) require human judgment.",
    fix: "Address violations in order of impact severity (critical/serious first). Each violation includes a specific WCAG success criterion, the affected element's selector, and a \"help URL\" linking to Deque's remediation guidance for that exact rule — fix according to that guidance rather than guessing, since the correct fix (e.g. for color contrast vs. missing ARIA label) differs per rule. Treat a clean axe-core run as a floor, not proof of full accessibility, given its known coverage limits.",
    source: {
      label: "Deque — axe-core accessibility testing engine",
      url: "https://www.deque.com/axe/axe-core/",
    },
  },
};
