export function applyCharacterModels(recipes, models = { bodies: {}, faces: {} }) {
  const characters = recipes ?? {};
  for (const [id, recipe] of Object.entries(characters)) {
    if (!recipe || recipe.baseModel) continue;
    const file = models.bodies?.[id];
    if (file) recipe.baseModel = file;
    const face = models.faces?.[id];
    if (face) recipe.faces = face;
  }
  return characters;
}
