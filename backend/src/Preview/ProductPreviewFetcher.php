<?php

namespace RestockRadar\Preview;

use RestockRadar\Analysis\PackQuantity;

/**
 * One-shot "grab the product name, image, and current price from a pasted URL" helper for the
 * Preferred Products form — not a price fetcher, not recurring, not the stage-2 site-fetcher
 * work (deferred; see PROJECT-BRIEF.md). Reads only standard metadata a page already publishes
 * for its own SEO/social-preview purposes — Open Graph tags, schema.org Product/Offer JSON-LD,
 * or schema.org microdata (`itemprop="price"` etc., the attribute-based form some sites use
 * instead of/alongside JSON-LD — confirmed on Walmart, whose price only shows up this way on at
 * least some product page templates) — rather than scraping page-specific markup, so it has some
 * chance of working even on sites that block bot-like browsing — no guarantee, since sites that
 * actively block scrapers may still return a CAPTCHA or empty shell for a plain HTTP GET
 * (confirmed on Walmart; see README).
 *
 * The price/image captured here are a one-time snapshot for whenever a choice is added or
 * refreshed — not a live or recurring feed. See watchlist_product_choices in schema.sql.
 */
final class ProductPreviewFetcher
{
    private const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        . '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    /**
     * @return array{title: ?string, image: ?string, price: ?float, currency: ?string, quantity: ?float, quantity_unit: ?string}
     * @throws \RuntimeException if the URL is invalid/unsafe or the page couldn't be fetched
     */
    public function fetch(string $url): array
    {
        $this->assertSafeUrl($url);

        return $this->parseHtml($this->download($url));
    }

    /**
     * Pure parsing, split out from fetch() so it can be exercised with a hand-built HTML string
     * in tests without depending on a live, possibly bot-blocked, network request.
     *
     * @return array{title: ?string, image: ?string, price: ?float, currency: ?string, quantity: ?float, quantity_unit: ?string}
     */
    public function parseHtml(string $html): array
    {
        $dom = new \DOMDocument();
        libxml_use_internal_errors(true);
        $dom->loadHTML($html);
        libxml_clear_errors();

        $xpath = new \DOMXPath($dom);
        $jsonLd = $this->extractJsonLdProduct($xpath);
        $offer = $this->jsonLdOffer($jsonLd);

        $title = $this->metaContent($xpath, 'og:title')
            ?? $jsonLd['name'] ?? null
            ?? $this->tagText($xpath, '//title');

        $image = $this->metaContent($xpath, 'og:image')
            ?? $this->jsonLdImage($jsonLd);

        $price = $this->toFloatOrNull($offer['price'] ?? null)
            ?? $this->toFloatOrNull($this->metaContent($xpath, 'product:price:amount'))
            ?? $this->toFloatOrNull($this->itemPropContent($xpath, 'price'));

        $currency = (is_array($offer) ? ($offer['priceCurrency'] ?? null) : null)
            ?? $this->metaContent($xpath, 'product:price:currency')
            ?? $this->itemPropContent($xpath, 'priceCurrency');

        $guess = $title !== null ? PackQuantity::guess($title) : null;

        return [
            'title' => $title !== null ? trim($title) : null,
            'image' => $image !== null ? trim($image) : null,
            'price' => $price,
            'currency' => $currency !== null ? trim((string) $currency) : null,
            'quantity' => $guess['quantity'] ?? null,
            'quantity_unit' => $guess['unit'] ?? null,
        ];
    }

    private function assertSafeUrl(string $url): void
    {
        $parts = parse_url($url);

        if ($parts === false || !isset($parts['scheme'], $parts['host']) || !in_array($parts['scheme'], ['http', 'https'], true)) {
            throw new \RuntimeException('URL must be a valid http:// or https:// address.');
        }

        $host = $parts['host'];
        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : gethostbyname($host);

        if ($ip === $host && !filter_var($host, FILTER_VALIDATE_IP)) {
            throw new \RuntimeException('Could not resolve that host.');
        }

        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw new \RuntimeException('That URL points to a private/reserved address, which is not allowed.');
        }
    }

    private function download(string $url): string
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "User-Agent: " . self::USER_AGENT . "\r\nAccept: text/html\r\n",
                'timeout' => 8,
                'follow_location' => 1,
                'max_redirects' => 5,
                'ignore_errors' => true,
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);

        $html = @file_get_contents($url, false, $context);

        if ($html === false) {
            throw new \RuntimeException('Could not fetch that page — it may be blocking automated requests.');
        }

        return $html;
    }

    private function metaContent(\DOMXPath $xpath, string $property): ?string
    {
        $nodes = $xpath->query("//meta[@property='{$property}']/@content");
        if ($nodes === false || $nodes->length === 0) {
            $nodes = $xpath->query("//meta[@name='{$property}']/@content");
        }

        return $nodes !== false && $nodes->length > 0 ? $nodes->item(0)->nodeValue : null;
    }

    /**
     * schema.org microdata: `<span itemprop="price">$4.67</span>` (value in the element's own
     * text) or `<meta itemprop="price" content="4.67">` (value in a `content` attribute instead,
     * used when the visible text is formatted differently from the raw value) — checks both.
     */
    private function itemPropContent(\DOMXPath $xpath, string $itemprop): ?string
    {
        $nodes = $xpath->query("//*[@itemprop='{$itemprop}']");
        if ($nodes === false || $nodes->length === 0) {
            return null;
        }

        $node = $nodes->item(0);
        $content = $node->attributes?->getNamedItem('content')?->nodeValue;

        return $content !== null && $content !== '' ? $content : $node->textContent;
    }

    private function tagText(\DOMXPath $xpath, string $query): ?string
    {
        $nodes = $xpath->query($query);

        return $nodes !== false && $nodes->length > 0 ? $nodes->item(0)->textContent : null;
    }

    /** @return array<string,mixed>|null */
    private function extractJsonLdProduct(\DOMXPath $xpath): ?array
    {
        $scripts = $xpath->query("//script[@type='application/ld+json']");
        if ($scripts === false) {
            return null;
        }

        foreach ($scripts as $script) {
            $decoded = json_decode($script->textContent, true);
            if (!is_array($decoded)) {
                continue;
            }

            $candidates = isset($decoded['@type']) ? [$decoded] : ($decoded['@graph'] ?? $decoded);
            if (!is_array($candidates)) {
                continue;
            }

            foreach ($candidates as $entry) {
                if (is_array($entry) && ($entry['@type'] ?? null) === 'Product') {
                    return $entry;
                }
            }
        }

        return null;
    }

    private function jsonLdImage(?array $jsonLd): ?string
    {
        $image = $jsonLd['image'] ?? null;

        if (is_string($image)) {
            return $image;
        }
        if (is_array($image)) {
            return is_string($image[0] ?? null) ? $image[0] : ($image['url'] ?? null);
        }

        return null;
    }

    /** @return array<string,mixed>|null */
    private function jsonLdOffer(?array $jsonLd): ?array
    {
        $offers = $jsonLd['offers'] ?? null;
        if (!is_array($offers)) {
            return null;
        }

        // A single Offer is an associative array (has 'price' or '@type'); a list of offers is
        // a plain array of those — take the first one.
        if (array_key_exists('price', $offers) || array_key_exists('@type', $offers)) {
            return $offers;
        }

        foreach ($offers as $entry) {
            if (is_array($entry)) {
                return $entry;
            }
        }

        return null;
    }

    private function toFloatOrNull(mixed $value): ?float
    {
        if ($value === null) {
            return null;
        }
        if (is_numeric($value)) {
            return (float) $value;
        }
        if (is_string($value)) {
            $cleaned = preg_replace('/[^0-9.]/', '', $value);
            return $cleaned === '' ? null : (float) $cleaned;
        }

        return null;
    }
}
