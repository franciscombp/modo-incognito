/**
 * Quién se puede llevar en El Soplón: ids de `characters3d.json` (el mismo
 * muñeco 3D del juego grande) con su nombre. Gabo NO está: el soplón trabaja
 * PARA él, y que Gabo jugara a buscarse a sí mismo no tiene chiste.
 *
 * Va aparte de `escena3d.js` para que el menú lo tenga sin cargar el 3D.
 */
export const CARAS = [
  ["giuli", "Giuli"], ["fran", "Fran"], ["manu", "Manu"], ["cesar", "César"],
  ["crispo", "Crispo"], ["chispita", "Chispita"], ["washo", "Washo"],
  ["parce", "Parce"], ["steven", "Steven"], ["kiara", "Kiara"], ["enriquetta", "Enriquetta"],
];
export const nombreDeCara = (id) => CARAS.find(([c]) => c === id)?.[1] ?? id;
export const esCara = (id) => CARAS.some(([c]) => c === id);
