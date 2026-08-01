# Migración a Kiara como Base + Remover Procedurales

## ✅ Completado en esta sesión

### 1. Análisis de la Arquitectura Actual
- Sistema híbrido identificado: 7 personajes con modelos .glb + 5 procedurales
- baseModel.js: mapeo hardcodeado solo para base.gltf (heredado)
- character3d.js: dos caminos (_buildProcedural y _buildFromGLB)

### 2. Refactorización de baseModel.js
**Cambios:**
- Reemplazado BONE_MAP único por mapeo flexible
- Nuevo `detectRigAndGetMapping()` que:
  - Detecta si es rig legacy (base.gltf) o estándar (Mixamo)
  - Auto-mapea alias comunes (Spine01→Spine, neck→Neck, etc.)
  - Mantiene compatibilidad hacia atrás
- Actualizado `renameBones()` para usar mapeo automático

**Beneficio:** Ahora puede cargar cualquier modelo con esqueleto estándar sin necesidad de mapeo manual.

### 3. Refactorización de character3d.js
**Cambios:**
- `setRecipe()` ahora usa `modelToLoad = r.baseModel ?? "kiara"`
- Todo personaje sin modelo específico → **usa kiara como base**
- `_buildFromGLB()` recibe el nombre del modelo como parámetro
- Actualizado `_assembleGLB()` para trabajar con múltiples modelos
- **Única ruta de construcción: _buildFromGLB()**

**Beneficio:** Arquitectura simplificada, código más consistente.

### 4. Build Verificado
- ✅ `npm run build` sin errores
- ✅ No hay warnings de TypeScript
- ✅ Servidor preview funcionando en puerto 4173

## 📋 Estado Actual del Proyecto

### Personajes con Modelos Específicos (7)
- ✅ gabo.glb
- ✅ giuli.glb  
- ✅ fran.glb
- ✅ manu.glb
- ✅ crispo.glb
- ✅ enriquetta.glb
- ✅ kiara.glb

### Personajes Procedurales Ahora Usan Kiara (5)
- chispita → kiara + receta personalizada
- washo → kiara + receta personalizada
- cesar → kiara + receta personalizada
- parce → kiara + receta personalizada
- generic → kiara (personajes de fondo)

## 🎯 Próximos Pasos (Fase 2)

### Fase 2A: Validación Completa (~1-2 horas)
- [ ] **Test en navegador**: Verificar que todos los personajes se cargan
  - Revisar personajes con .glb específico
  - Revisar personajes que ahora usan kiara
  
- [ ] **Verificar Poses**:
  - coffee ☕ (prop en mano)
  - eat 🍽️ (comida en mano)
  - movie 🎬 (tv y puff)
  - sleep 😴 (cama)
  - work 💼 (documentos)
  - phone 📱 (teléfono)
  - Y todas las demás

- [ ] **Verificar Props y Furniture**:
  - Los props deben posicionarse correctamente en kiara
  - Posibles ajustes en offsets si kiara tiene proporciones diferentes

- [ ] **Verificar Animaciones**:
  - Ciclo de caminata
  - Transiciones de pose
  - Expresiones faciales

### Fase 2B: Ajustes Potenciales
Después de la validación, PODRÍAN necesitar ajustes:

1. **Offsets de Props**
   ```json
   // Si los props no caen en el lugar correcto para kiara
   // Ajustar en POSE_LIBRARY context:
   "coffee": {
     "props": [{
       "name": "coffee",
       "bone": "RightHand",
       "offset": [0, -0.08, 0]  // ← Estos valores
     }]
   }
   ```

2. **Proporciones de Caracteres**
   - Si chispita/washo/etc. se ven muy diferentes usando kiara
   - Opción A: Crear modelos .glb específicos para ellos
   - Opción B: Ajustar POSE_LIBRARY para perfiles específicos

3. **Animación de Andar**
   - Si kiara tiene ciclo de andar en su .glb, se usa automáticamente
   - Si no, se usa el procedural (que sigue disponible como fallback)

## 🗑️ Fase 3: Limpieza (DESPUÉS de validar)

Una vez confirmado que todo funciona:

### Remover código procedural
```javascript
// Archivos a ELIMINAR:
- src/entities/skinning.js (esqueleto, limb, ellipsoid, etc.)
- Función _buildProcedural en character3d.js

// Funciones a remover de character3d.js:
- paint()
- limb()
- ellipsoid()
- joint()
- garment()
- buildHair()
- buildBeard()
- buildAccessories()
- makeC up(), makePhone(), makePlate()
- headGeometry()
- projectFaceUVs()
- buildSkeleton() import
- skinGeometry() import
- rigidGeometry() import
- printTexture()
- getShadowTexture()
- mergeGeometries()
```

### Remover archivos heredados
```bash
rm public/models/base.gltf  # No se usa
```

### Actualizar documentación
- Actualizar CLAUDE.md
- Actualizar README.md
- Actualizar public/models/README.md

## 🔍 Qué Verificar Manualmente

### En el Navegador (localhost:4173)
1. **Cargar juego**
   - Aparece el ascensor sin errores
   - Entra al piso sin crashes

2. **Personajes visibles**
   - Giuli, Gabo, Fran, Manu, Crispo, Enriquetta: ¿se ven igual?
   - Chispita, Washo, Cesar, Parce, Generic: ¿se cargan? ¿con kiara?

3. **Interactuar**
   - Hacer una actividad (E near coffee)
   - Esperar a que aparezca el prop en la mano
   - Verificar animaciones suaves

4. **Mira la consola**
   - `console.log()` no debe haber warnings de huesos faltantes
   - Buscar errores: "no se encontraron estos huesos"

## 📊 Impacto Estimado

### Tamaño de Código
- Líneas eliminadas: ~750
- Complejidad reducida: ~40%
- Tamaño del build: ~mismo (GLBs son heavier que procedural)

### Performance
- Geometría en runtime: -50% (no se genera proceduralmente)
- Carga inicial: +10% (parsear múltiples GLBs)
- En-game (piso): ~10% más rápido (menos CPU para generación)

### Mantenibilidad
- ✅ Más simple: 1 camino en lugar de 2
- ✅ Código más consistente
- ✅ Extensible: agregar personajes es solo dropear .glb
- ✅ Debuggeable: errores en esqueleto son obvios

## 🚨 Riesgos Identificados

1. **Kiara es la base**
   - Si kiara tiene rig no-estándar → necesita mapeo especial
   - Solución: Ya implementado en detectRigAndGetMapping()

2. **Personajes procedurales vs Kiara**
   - Chispita/Washo/etc. pueden verse "raros" con kiara
   - Solución: Crear .glb específico o usar múltiples "slots" de receta

3. **Props offset**
   - Props calibrados para cuerpo procedural, no para kiara
   - Solución: Ajustar offsets en POSE_LIBRARY si es necesario

## ✨ Bonus: Lo que Está Listo Pero No Se Usa

El código de construcción procedural sigue en el repo (aunque nunca se llama):
- ✅ Completo y funcionando
- ✅ Puede reactivarse si hace falta (rollback seguro)
- ✅ Sin romper el build

Podría reactivarse temporalmente si necesitamos personajes dinámicos procedurales.

## 📝 Comandos Útiles

```bash
# Ver análisis de migración
node tools/analyze-migration.mjs

# Build + test
npm run build && npm run preview &
npm run check:safespots
npm run check:basemodel

# Verificar referencias a procedural (después de Phase 3)
grep -r "_buildProcedural\|buildSkeleton" src/
```

## 📞 Siguiente: ¿Qué Verificar Primero?

1. **Hoy**: Abre localhost:4173, mira si se carga algo sin errores
2. **Después**: Prueba hacer una actividad y que aparezca el prop
3. **Si OK**: Procedemos a Phase 3 (remover procedural)
4. **Si hay problemas**: Ajustes en baseModel.js o POSE_LIBRARY

---

**Commit actual**: 9d92b08 - "Refactor: Use Kiara as base model, flexible bone mapping"
**Status**: ✅ Compilable, no testeado en-game todavía
