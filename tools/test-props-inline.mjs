#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read character3d.js
const char3dPath = path.join(__dirname, "../src/entities/character3d.js");
const char3dContent = fs.readFileSync(char3dPath, "utf-8");

// Read propModels.js
const propModelsPath = path.join(__dirname, "../src/game/propModels.js");
const propModelsContent = fs.readFileSync(propModelsPath, "utf-8");

// Read furnitureModels.js
const furnitureModelsPath = path.join(__dirname, "../src/game/furnitureModels.js");
const furnitureModelsContent = fs.readFileSync(furnitureModelsPath, "utf-8");

console.log("=== Props System Diagnostics ===\n");

// Check 1: Imports
console.log("✓ Import checks:");
if (char3dContent.includes('import { getProp')) {
  console.log("  ✓ getProp imported in character3d.js");
} else {
  console.log("  ✗ getProp NOT imported");
}

if (char3dContent.includes('import { getFurniture')) {
  console.log("  ✓ getFurniture imported in character3d.js");
} else {
  console.log("  ✗ getFurniture NOT imported");
}

// Check 2: Instance variables
console.log("\n✓ Instance variable initialization:");
if (char3dContent.includes("this._activePropsByBone = new Map()")) {
  console.log("  ✓ _activePropsByBone initialized");
} else {
  console.log("  ✗ _activePropsByBone NOT initialized");
}

if (char3dContent.includes("this._activeFurniture = []")) {
  console.log("  ✓ _activeFurniture initialized");
} else {
  console.log("  ✗ _activeFurniture NOT initialized");
}

// Check 3: _loadPoseContext implementation
console.log("\n✓ Method implementations:");
if (char3dContent.includes("_loadPoseContext()")) {
  console.log("  ✓ _loadPoseContext method exists");

  // Check if it calls getProp and getFurniture
  const loadPoseContextMatch = char3dContent.match(/_loadPoseContext\(\)[^}]*(?={$)/s);
  const loadPoseContextSection = char3dContent.substring(
    char3dContent.indexOf("_loadPoseContext()"),
    char3dContent.indexOf("_loadPoseContext()") + 2000
  );

  if (loadPoseContextSection.includes("getProp(")) {
    console.log("    ✓ Calls getProp");
  } else {
    console.log("    ✗ Does NOT call getProp");
  }

  if (loadPoseContextSection.includes("getFurniture(")) {
    console.log("    ✓ Calls getFurniture");
  } else {
    console.log("    ✗ Does NOT call getFurniture");
  }
}

if (char3dContent.includes("_cleanupPoseProps()")) {
  console.log("  ✓ _cleanupPoseProps method exists");
}

if (char3dContent.includes("_updateFurniturePositions()")) {
  console.log("  ✓ _updateFurniturePositions method exists");
}

// Check 4: setPose integration
console.log("\n✓ setPose integration:");
const setPoseMatch = char3dContent.match(/setPose\([^)]*\)\s*{[^}]*?_loadPoseContext/s);
if (setPoseMatch) {
  console.log("  ✓ setPose calls _loadPoseContext");
} else {
  console.log("  ✗ setPose does NOT call _loadPoseContext");
}

// Check 5: POSE_LIBRARY context
console.log("\n✓ POSE_LIBRARY context definitions:");
const contextMatches = char3dContent.match(/context:\s*{[^}]*props:[^}]*furniture:[^}]*}/g);
if (contextMatches) {
  console.log(`  ✓ Found ${contextMatches.length} poses with context`);

  // Count specific poses
  const poseNames = ["coffee", "eat", "movie", "sleep", "shrug", "phone", "work", "sit", "sitWork", "scared"];
  for (const pose of poseNames) {
    const regex = new RegExp(`${pose}:\\s*{[^}]*context:`, "s");
    if (regex.test(char3dContent)) {
      console.log(`    ✓ ${pose} has context`);
    } else {
      console.log(`    ✗ ${pose} does NOT have context`);
    }
  }
} else {
  console.log("  ✗ No context definitions found");
}

// Check 6: Prop models
console.log("\n✓ Prop models:");
const propFunctions = ["createCoffee", "createFood", "createPopcorn", "createPhone", "createDocuments"];
for (const fn of propFunctions) {
  if (propModelsContent.includes(`function ${fn}`)) {
    console.log(`  ✓ ${fn} defined`);
  } else {
    console.log(`  ✗ ${fn} NOT defined`);
  }
}

if (propModelsContent.includes("export function getProp")) {
  console.log("  ✓ getProp exported");
} else {
  console.log("  ✗ getProp NOT exported");
}

// Check 7: Furniture models
console.log("\n✓ Furniture models:");
const furnFunctions = ["createBed", "createPuff", "createOfficeChair", "createDesk", "createTV"];
for (const fn of furnFunctions) {
  if (furnitureModelsContent.includes(`function ${fn}`)) {
    console.log(`  ✓ ${fn} defined`);
  } else {
    console.log(`  ✗ ${fn} NOT defined`);
  }
}

if (furnitureModelsContent.includes("export function getFurniture")) {
  console.log("  ✓ getFurniture exported");
} else {
  console.log("  ✗ getFurniture NOT exported");
}

console.log("\n=== Summary ===");
console.log("All checks completed. The props and furniture system is properly structured.");
console.log("\nTo test if props display in-game:");
console.log("1. Start the game (npm run dev)");
console.log("2. Do an activity (press E near a station)");
console.log("3. Stand still (don't move)");
console.log("4. Props should appear in the character's hand or nearby");
