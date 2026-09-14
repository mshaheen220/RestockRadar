import { useState } from 'react';

// Known purchase-history sources (see backend/database/schema.sql sites table) mapped to their
// real domain, since a display name like "Sam's Club" can't be turned into a working domain by
// just slugifying it. Anything else falls through to the domain-guessing/pass-through logic below
// — this covers the free-text site labels the browser extension and URL-fetch write (already a
// real hostname) and any other site name reasonably.
const KNOWN_DOMAINS: Record<string, string> = {
  walmart: 'walmart.com',
  amazon: 'amazon.com',
  costco: 'costco.com',
  chewy: 'chewy.com',
  "sam's club": 'samsclub.com',
  'giant eagle': 'gianteagle.com',
  target: 'target.com',
};

// Fetched once from each site's own domain and stored under public/site-icons/ — a third-party
// favicon-lookup service (tried first) turned out to be unreliable for some of these (Costco's
// came back as an empty placeholder, not a 404, so onError never caught it). gianteagle.png is
// a manually cropped/padded leaf mark from the full wordmark logo, not a scraped favicon.
const LOCAL_ICONS: Record<string, string> = {
  'walmart.com': '/site-icons/walmart.ico',
  'amazon.com': '/site-icons/amazon.ico',
  'costco.com': '/site-icons/costco.svg',
  'chewy.com': '/site-icons/chewy.ico',
  'samsclub.com': '/site-icons/samsclub.ico',
  'gianteagle.com': '/site-icons/gianteagle.png',
};

function guessDomain(name: string): string {
  const trimmed = name.trim();

  if (trimmed.includes('.')) {
    return trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }

  const known = KNOWN_DOMAINS[trimmed.toLowerCase()];
  if (known) return known;

  return `${trimmed.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
}

/**
 * Shows a site's own icon next to its name wherever a site appears as a small pill/badge.
 * Prefers a locally stored copy for the handful of sites we actually track purchase history
 * from (see LOCAL_ICONS); for anything else — arbitrary sites the browser extension or URL-fetch
 * wrote — falls back to a live favicon-lookup service, and finally to an initial-letter badge if
 * even that fails to load.
 */
export default function SiteIcon({ name, size = 14 }: { name: string; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!name.trim() || failed) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center rounded-sm bg-stone-300 dark:bg-stone-600 text-stone-700 dark:text-stone-200 font-bold shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.65 }}
      >
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }

  const domain = guessDomain(name);
  const src = LOCAL_ICONS[domain] ?? `https://icons.duckduckgo.com/ip3/${domain}.ico`;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="inline-block rounded-sm shrink-0"
      onError={() => setFailed(true)}
    />
  );
}
