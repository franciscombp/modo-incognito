#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Leer configuración
const chars3dPath = path.join(__dirname, "../public/data/characters3d.json");
const modelsPath = path.join(__dirname, "../public/models");
const modelsIndexPath = path.join(__dirname, "../public/data/models.json");

const chars3d = JSON.parse(fs.readFileSync(chars3dPath, "utf-8"));
const modelsIndex = JSON.parse(fs.readFileSync(modelsIndexPath, "utf-8"));
const filesInModels = fs.readdirSync(modelsPath);

console.log("=== ANÁLISIS DE MIGRACIÓN: PROCEDURAL -> KIARA BASE ===\n");

// Listar personajes
console.log("📋 PERSONAJES EN characters3d.json:");
const characters = Object.entries(chars3d.characters);
const proceduralChars = [];
const modelChars = [];

for (const [id, recipe] of characters) {
  const hasModel = modelsIndex.bodies[id];
  if (hasModel) {
    modelChars.push({ id, model: hasModel });
    console.log(`  ✓ ${id}: ${hasModel}`);
  } else {
    proceduralChars.push(id);
    console.log(`  • ${id}: (procedural)`);
  }
}

console.log(
  `\nResumo: ${modelChars.length} con modelo importado, ${proceduralChars.length} procedurales`
);

console.log("\n📦 MODELOS EN public/models/:");
const glbFiles = filesInModels.filter((f) => f.endsWith(".glb"));
const pngFiles = filesInModels.filter((f) => f.endsWith(".faces.png"));
console.log(`  .glb:        ${glbFiles.join(", ")}`);
console.log(`  .faces.png:  ${pngFiles.join(", ")}`);

console.log("\n⚙️ CAMBIOS REQUERIDOS:");

console.log("\n1️⃣ baseModel.js:");
console.log("   - Remover BONE_MAP específico de base.gltf");
console.log("   - Crear mapeo genérico para nombres estándar (Mixamo)");
console.log("   - Detectar automáticamente estructura ósea");
console.log("   - Soportar: Spine01/Spine02 -> Chest, neck -> Neck, etc.");

console.log("\n2️⃣ character3d.js:");
console.log("   - Cambiar setRecipe() para defaultear a 'kiara' si no hay modelo");
console.log("   - Eliminar completamente _buildProcedural()");
console.log("   - Simplificar: solo _buildFromGLB()");

console.log("\n3️⃣ Archivos a eliminar:");
console.log("   - src/entities/skinning.js (esqueleto procedural)");
console.log("   - public/models/base.gltf (heredado)");
console.log("   - Funciones procedurales: limb(), paint(), buildSkeleton()");

console.log("\n4️⃣ Para personajes procedurales actuales:");
console.log("   Opciones:");
console.log("   a) Crear modelos .glb para cada uno");
console.log("   b) Usar kiara con diferentes estilos de pelo/ropa");
console.log("   c) Opción mixta: modelos para personajes importantes, kiara para extras");

console.log("\n5️⃣ POSE_LIBRARY:");
console.log("   - Verificar que el contexto de poses sigue siendo válido");
console.log("   - Posibles ajustes en offsets de props/furniture");

console.log("\n📊 IMPACTO:");
const reduction = `
  Líneas de código: -${Math.round(500 + proceduralChars.length * 50)} aprox.
  Complejidad: -40%
  Tamaño JS: ~igual (los .glb importados pesan más que procedural)
  Runtime: +5% (menos geometría generada, pero carga de GLBs)
`;
console.log(reduction);

console.log("\n🎯 ARQUITECTURA NUEVA:");
console.log(`
  character3d.js -> setRecipe(recipe)
    ├─ ¿recipe.baseModel?
    │  ├─ SÍ: loadBaseModel(recipe.baseModel)
    │  └─ NO: loadBaseModel("kiara") [CAMBIO]
    └─ _buildFromGLB() [SOLO CAMINO]

  baseModel.js -> Mapeo genérico de huesos
    ├─ Detectar nombres estándar (Hips, Spine, etc.)
    ├─ Mapear alias (Spine02->Chest, neck->Neck)
    └─ Aplicar POSE_LIBRARY sin cambios
`);

console.log("\n✅ CHECKLIST DE IMPLEMENTACIÓN:");
console.log("  [ ] Inspeccionar kiara.glb y documentar estructura ósea");
console.log("  [ ] Actualizar baseModel.js con mapeo genérico");
console.log("  [ ] Modificar character3d.js setRecipe()");
console.log("  [ ] Remover skinning.js y funciones procedurales");
console.log("  [ ] Eliminar base.gltf");
console.log("  [ ] Ejecutar npm run build && npm run preview");
console.log("  [ ] Verificar todas las poses (coffee, movie, sleep, etc.)");
console.log("  [ ] Verificar props/furniture cargan correctamente");
console.log("  [ ] Ejecutar tests");
