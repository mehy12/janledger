/**
 * Algorithm: Spatially Constrained Semantic Similarity (SCSS)
 * 
 * This module implements a hybrid validation algorithm designed for real-time 
 * duplicate detection in civic reporting systems. It acts as the backbone of the 
 * "Cascade Loop" ensuring ledger integrity and preventing redundancy.
 * 
 * It combines two primary verification layers:
 * 1. Geospatial Proximity Filtering: Uses the Haversine formula to compute exact distance 
 *    on a spherical earth. Issues outside a strict radius (e.g. 30 meters) are instantly rejected.
 * 2. Semantic Similarity Scoring: Evaluates the literal text description overlap to ensure 
 *    that two spatially close issues are actually describing the same underlying problem.
 */

interface CivicIssue {
  id: string;
  lat: number;
  lng: number;
  title: string;
  description: string;
}

/**
 * Calculates the great-circle distance between two points on the Earth using the Haversine formula.
 * @returns Distance in meters
 */
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);

  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Computes a basic semantic similarity score between two texts using normalized word overlap.
 * In a full production ML environment, this is replaced by cosine similarity on vector embeddings.
 * @returns Score from 0.0 to 1.0
 */
export function computeSemanticSimilarity(textA: string, textB: string): number {
  const wordsA = new Set(textA.toLowerCase().match(/\w+/g) || []);
  const wordsB = new Set(textB.toLowerCase().match(/\w+/g) || []);

  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersectionSize = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersectionSize++;
    }
  }

  // Jaccard similarity index as a stand-in for semantic overlap
  const unionSize = wordsA.size + wordsB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Core Duplicate Detection Logic
 * Analyzes two civic issues to determine if they represent the same real-world incident.
 * 
 * Flow:
 * - If spatial distance > 30 meters, they are physically distant -> false
 * - Else run semantic engine. If similarity > 0.6 -> true (duplicate)
 */
export function isDuplicateIssue(issueA: CivicIssue, issueB: CivicIssue): boolean {
  const MAX_DUPLICATE_RADIUS_METERS = 30;
  const SEMANTIC_THRESHOLD = 0.6; // High confidence required

  const distance = getDistanceMeters(issueA.lat, issueA.lng, issueB.lat, issueB.lng);

  if (distance > MAX_DUPLICATE_RADIUS_METERS) {
    return false; // Automatically eliminate geometrically invalid pairs
  }

  // Combine title and description for semantic analysis
  const corpusA = `${issueA.title} ${issueA.description}`;
  const corpusB = `${issueB.title} ${issueB.description}`;

  const similarityScore = computeSemanticSimilarity(corpusA, corpusB);

  return similarityScore >= SEMANTIC_THRESHOLD;
}
