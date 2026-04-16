import { isDuplicateIssue, getDistanceMeters, computeSemanticSimilarity } from './similarity';

/**
 * DEMONSTRATION FILE
 * Represents integration test cases showing how the "Cascade Loop" duplicate detection runs
 * This file is isolated and not used in the live production build.
 */

const newReport = {
  id: "C-1099",
  lat: 12.971590,
  lng: 77.594560,
  title: "Pothole on MG Road crossing",
  description: "A huge pothole has formed right in the middle of the intersection near the metro pillar."
};

const existingDatabaseReport = {
  id: "C-1002",
  lat: 12.971600,  // Very close physically
  lng: 77.594580,
  title: "Deep pothole near MG metro",
  description: "Dangerous pothole at the crosswalk by the MG road metro pillar. Needs immediate BWSSB attention."
};

const distantReport = {
  id: "C-1003",
  lat: 12.930600, // Very far away (Marathahalli)
  lng: 77.678400,
  title: "Pothole near outer ring road",
  description: "Huge pothole at the intersection."
};

function runDemo() {
  console.log("🚀 Running SCSS Algorithm Demo...\n");

  console.log("=== SCENARIO 1: Comparing Close Duplicate issues ===");
  const dist1 = getDistanceMeters(newReport.lat, newReport.lng, existingDatabaseReport.lat, existingDatabaseReport.lng);
  const sim1 = computeSemanticSimilarity(newReport.description, existingDatabaseReport.description);
  const isDup1 = isDuplicateIssue(newReport, existingDatabaseReport);
  
  console.log(`- Spatial Distance: ${dist1.toFixed(2)} meters`);
  console.log(`- Semantic Score: ${(sim1 * 100).toFixed(1)}% overlap`);
  console.log(`- Result: ${isDup1 ? 'DUPLICATE DETECTED (Merged to Supports)' : 'UNIQUE ISSUE'}\n`);


  console.log("=== SCENARIO 2: Comparing Distant issues with identical wording ===");
  const dist2 = getDistanceMeters(newReport.lat, newReport.lng, distantReport.lat, distantReport.lng);
  const sim2 = computeSemanticSimilarity(newReport.title, distantReport.title);
  const isDup2 = isDuplicateIssue(newReport, distantReport);

  console.log(`- Spatial Distance: ${dist2.toFixed(2)} meters`);
  console.log(`- Semantic Score: ${(sim2 * 100).toFixed(1)}% overlap`);
  console.log(`- Result: ${isDup2 ? 'DUPLICATE DETECTED (Merged to Supports)' : 'UNIQUE ISSUE'}\n`);
}

// execute
runDemo();
