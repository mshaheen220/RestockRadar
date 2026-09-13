<?php

namespace RestockRadar\Matching;

use PDO;

/**
 * Stage 4: suggests links between watchlist products and the raw product_name strings seen
 * in purchase history — deterministic string matching, not ML, consistent with the rest of
 * the app. Suggestions are reviewed by a person (see /watchlist/{id}/match-suggestions) and
 * only become real once accepted into product_aliases; nothing here writes automatically.
 *
 * Scoring:
 *   - A `must_match` criterion whose value doesn't appear (case-insensitive, punctuation-
 *     normalized) in the candidate name disqualifies that candidate outright.
 *   - `preferred` criteria that do appear raise the score; absence doesn't disqualify.
 *   - `flexible` criteria are ignored entirely (they're notes, not matching signal).
 *   - Word-overlap (Jaccard) between the product's display name and the candidate always
 *     contributes a baseline, so products with no criteria yet (e.g. "Toilet paper") still
 *     get sensible suggestions.
 */
final class ProductMatcher
{
    private const STOPWORDS = ['the', 'a', 'an', 'of', 'with', 'and', 'for', 'in'];

    public function __construct(private PDO $pdo)
    {
    }

    /**
     * @return array<int, array{site_id: int, site_name: string, raw_product_name: string,
     *               transaction_count: int, score: float, matched_preferred: string[], missing_preferred: string[]}>
     */
    public function suggestMatches(array $watchlistProduct, int $limit = 15, float $minScore = 0.05): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT t.site_id, s.name AS site_name, t.product_name, COUNT(*) AS transaction_count
             FROM transactions t
             JOIN sites s ON s.id = t.site_id
             WHERE NOT EXISTS (
                 SELECT 1 FROM product_aliases pa
                 WHERE pa.site_id = t.site_id AND pa.raw_product_name = t.product_name
             )
             AND NOT EXISTS (
                 SELECT 1 FROM watchlist_product_rejected_matches r
                 WHERE r.watchlist_product_id = :wp_id AND r.site_id = t.site_id AND r.raw_product_name = t.product_name
             )
             GROUP BY t.site_id, t.product_name"
        );
        $stmt->execute(['wp_id' => $watchlistProduct['id']]);
        $candidates = $stmt->fetchAll();

        $displayTokens = $this->tokenize($watchlistProduct['display_name']);
        $mustMatch = [];
        $preferred = [];

        foreach ($watchlistProduct['criteria'] as $criterion) {
            if ($criterion['importance'] === 'must_match') {
                $mustMatch[] = $criterion['attribute_value'];
            } elseif ($criterion['importance'] === 'preferred') {
                $preferred[] = $criterion['attribute_value'];
            }
            // 'flexible' criteria are intentionally not used for matching.
        }

        $scored = [];

        foreach ($candidates as $candidate) {
            $normalizedName = $this->normalize($candidate['product_name']);

            $disqualified = false;
            foreach ($mustMatch as $required) {
                if (!str_contains($normalizedName, $this->normalize($required))) {
                    $disqualified = true;
                    break;
                }
            }
            if ($disqualified) {
                continue;
            }

            $candidateTokens = $this->tokenize($candidate['product_name']);
            $baseScore = $this->jaccard($displayTokens, $candidateTokens);

            $matchedPreferred = [];
            $missingPreferred = [];
            foreach ($preferred as $value) {
                if (str_contains($normalizedName, $this->normalize($value))) {
                    $matchedPreferred[] = $value;
                } else {
                    $missingPreferred[] = $value;
                }
            }

            $preferredRatio = $preferred === [] ? 0.0 : count($matchedPreferred) / count($preferred);
            $score = $preferred === [] ? $baseScore : (0.4 * $baseScore + 0.6 * $preferredRatio);

            if ($score < $minScore) {
                continue;
            }

            $scored[] = [
                'site_id' => (int) $candidate['site_id'],
                'site_name' => $candidate['site_name'],
                'raw_product_name' => $candidate['product_name'],
                'transaction_count' => (int) $candidate['transaction_count'],
                'score' => round($score, 3),
                'matched_preferred' => $matchedPreferred,
                'missing_preferred' => $missingPreferred,
            ];
        }

        usort($scored, fn ($a, $b) => $b['score'] <=> $a['score'] ?: $b['transaction_count'] <=> $a['transaction_count']);

        return array_slice($scored, 0, $limit);
    }

    private function normalize(string $value): string
    {
        $lower = strtolower($value);
        $cleaned = preg_replace('/[^a-z0-9\s]/', ' ', $lower);

        return trim(preg_replace('/\s+/', ' ', $cleaned));
    }

    /** @return string[] */
    private function tokenize(string $value): array
    {
        $words = explode(' ', $this->normalize($value));

        return array_values(array_unique(array_filter(
            $words,
            fn ($word) => $word !== '' && strlen($word) > 1 && !in_array($word, self::STOPWORDS, true)
        )));
    }

    private function jaccard(array $a, array $b): float
    {
        if ($a === [] || $b === []) {
            return 0.0;
        }

        $intersection = count(array_intersect($a, $b));
        $union = count(array_unique(array_merge($a, $b)));

        return $union > 0 ? $intersection / $union : 0.0;
    }
}
