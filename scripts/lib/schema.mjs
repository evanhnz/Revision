/**
 * Validation du format des fiches (front-matter + sections) avec Zod.
 *
 * Note d'architecture : la validation se fait ici, dans le script de build,
 * et non via une « content collection » Astro. Raison : une content collection
 * expose le contenu au moteur de rendu d'Astro, avec le risque qu'un fragment
 * en clair se retrouve dans « dist/ » — ce qui annulerait le chiffrement.
 * Le contenu en clair ne traverse donc jamais Astro.
 */
import { z } from 'zod';

const segment = z.union([z.string(), z.number()]).transform((v) => String(v).trim());

export const frontMatterSchema = z
  .object({
    titre: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
    /** Chemin dans l'arborescence, de la matière à la sous-catégorie. */
    chemin: z.union([z.array(segment), segment]).optional(),
    /** Ancien format, lu comme un chemin à deux niveaux. */
    matiere: segment.optional(),
    fascicule: segment.optional(),
    ordre: z.coerce.number().int().default(999),
    tags: z
      .union([z.array(segment), segment])
      .default([])
      .transform((v) => (Array.isArray(v) ? v : v.split(',').map((t) => t.trim())).filter(Boolean)),
  })
  .transform((v, ctx) => {
    if (!v.titre) {
      ctx.addIssue({ code: 'custom', message: 'le champ « titre » est obligatoire' });
      return z.NEVER;
    }
    let chemin = v.chemin === undefined ? [] : Array.isArray(v.chemin) ? v.chemin : v.chemin.split('/');
    if (!chemin.length && v.matiere) chemin = [v.matiere, v.fascicule].filter(Boolean);
    chemin = chemin.map((c) => c.trim()).filter(Boolean);
    if (!chemin.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'le champ « chemin » est obligatoire, par exemple : chemin: ["Droit des obligations", "Le contrat"]',
      });
      return z.NEVER;
    }
    return { titre: v.titre, chemin, ordre: v.ordre, tags: v.tags };
  });

/** Une catégorie de content/categories.yml, et ses sous-catégories. */
export const categorieSchema = z.lazy(() =>
  z.object({
    nom: segment.refine((v) => v.length > 0, 'catégorie sans nom'),
    icone: z.string().optional(),
    enfants: z.array(categorieSchema).default([]),
  }),
);
export const categoriesSchema = z.array(categorieSchema);

export const flashcardSchema = z
  .object({
    q: z.string().optional(),
    question: z.string().optional(),
    r: z.string().optional(),
    reponse: z.string().optional(),
  })
  .transform((v, ctx) => {
    const question = v.q ?? v.question;
    const reponse = v.r ?? v.reponse;
    if (!question) {
      ctx.addIssue({ code: 'custom', message: 'flashcard sans « q: » (question)' });
      return z.NEVER;
    }
    if (!reponse) {
      ctx.addIssue({ code: 'custom', message: `flashcard « ${question} » sans « r: » (réponse)` });
      return z.NEVER;
    }
    return { question: String(question).trim(), reponse: String(reponse).trim() };
  });

export const quizSchema = z
  .object({
    question: z.string().min(1, 'question de quiz vide'),
    options: z.array(z.union([z.string(), z.number()])).min(2, 'un QCM a besoin d\'au moins 2 options'),
    reponse: z.union([z.string(), z.number()]).optional(),
    reponses: z.array(z.union([z.string(), z.number()])).optional(),
    explication: z.string().optional(),
  })
  .transform((v, ctx) => {
    const options = v.options.map((o) => String(o).trim());
    const brutes = v.reponses ?? (v.reponse !== undefined ? [v.reponse] : []);
    if (brutes.length === 0) {
      ctx.addIssue({ code: 'custom', message: `quiz « ${v.question} » sans « reponse: »` });
      return z.NEVER;
    }
    const indices = [];
    for (const brute of brutes) {
      // La réponse peut être donnée soit par son texte, soit par son index (0-based).
      if (typeof brute === 'number' && Number.isInteger(brute) && options[brute] !== undefined) {
        indices.push(brute);
        continue;
      }
      const texte = String(brute).trim();
      const idx = options.findIndex((o) => o.toLowerCase() === texte.toLowerCase());
      if (idx === -1) {
        ctx.addIssue({
          code: 'custom',
          message: `quiz « ${v.question} » : la réponse « ${texte} » ne figure pas dans les options`,
        });
        return z.NEVER;
      }
      indices.push(idx);
    }
    return {
      question: v.question.trim(),
      options,
      bonnes: [...new Set(indices)].sort((a, b) => a - b),
      explication: v.explication?.trim(),
    };
  });

export const glossaireSchema = z.array(
  z.object({
    terme: z.string().min(1),
    formes: z.array(z.string()).default([]),
    definition: z.string().min(1),
  }),
);
