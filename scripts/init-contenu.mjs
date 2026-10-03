#!/usr/bin/env node
/**
 * Complète « content/ » avec les fichiers de départ qui y manquent
 * (catégories, glossaire), sans jamais écraser un fichier existant.
 * Lancé au premier usage local et par la publication automatique.
 */
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(racine, 'content-exemple');
const cible = path.join(racine, 'content');

await mkdir(cible, { recursive: true });
let copies = 0;
for (const nom of await readdir(source)) {
  if (existsSync(path.join(cible, nom))) continue;
  await copyFile(path.join(source, nom), path.join(cible, nom));
  copies++;
}
console.log(copies ? `✓ content/ complété : ${copies} fichier(s) de départ.` : 'content/ est déjà complet.');
