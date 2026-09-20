import { normalizeText } from './format';
import type { Category, ID, PeculeData, TxKind } from './types';

const NOISE =
  /\b(cb|carte|paiement|achat|prlv|prelevement|sepa|vir|virement|inst|instantane|recu|emis|de|du|la|le|les|des|en|par|retrait|dab|facture|fact|ref|x+\d+|\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?)\b/g;

/** Clé d'un libellé bancaire : sans numéros de carte, dates, montants ni mots de service. */
export function labelKey(label: string): string {
  return normalizeText(label)
    .replace(NOISE, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\b[a-z]\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const shortKey = (key: string) => key.split(' ').slice(0, 2).join(' ');

/** Indices pour les marchands courants, reliés aux noms des catégories par défaut. */
const HINTS: [RegExp, string][] = [
  [/\b(carrefour|auchan|leclerc|lidl|intermarche|monoprix|franprix|super u|hyper u|casino|picard|aldi|grand frais|biocoop|naturalia|netto|cora|match)\b/, 'Courses'],
  [/\b(restaurant|resto|mcdo|mcdonald|burger king|kfc|deliveroo|uber eats|just eat|starbucks|boulangerie|brasserie|bar|cafe|pizza|sushi)\b/, 'Restaurants & sorties'],
  [/\b(sncf|ratp|navigo|uber|bolt|blablacar|total|esso|shell|avia|peage|vinci|sanef|aprr|parking|indigo|essence|carburant|station)\b/, 'Transports'],
  [/\b(netflix|spotify|deezer|disney|canal|youtube|apple com|google|icloud|free mobile|orange|sfr|bouygues|sosh|red by sfr|prime video|abonnement)\b/, 'Abonnements'],
  [/\b(edf|engie|veolia|eau|gaz|electricite|totalenergies|ekwateur|suez)\b/, 'Factures & énergie'],
  [/\b(pharmacie|doctolib|medecin|dentiste|ophtalmo|kine|hopital|clinique|mutuelle|laboratoire)\b/, 'Santé'],
  [/\b(loyer|foncia|nexity|syndic|charges copro)\b/, 'Logement'],
  [/\b(impot|impots|dgfip|tresor public|taxe)\b/, 'Impôts & taxes'],
  [/\b(amazon|fnac|darty|zalando|decathlon|ikea|leroy merlin|castorama|zara|h m|uniqlo|sephora|vinted|cdiscount|boulanger)\b/, 'Shopping'],
  [/\b(cinema|ugc|pathe|gaumont|concert|fnac spectacles|steam|playstation|nintendo|salle de sport|basic fit|fitness)\b/, 'Loisirs'],
  [/\b(airbnb|booking|hotel|air france|easyjet|ryanair|transavia|vueling)\b/, 'Voyages'],
  [/\b(cotisation|commission|frais|agios|interets debiteurs)\b/, 'Frais bancaires'],
  [/\b(salaire|paie|remuneration)\b/, 'Salaire'],
  [/\b(caf|pole emploi|france travail|cpam|ameli|allocation)\b/, 'Aides & allocations'],
  [/\b(remboursement|rembt|avoir)\b/, 'Remboursements'],
];

export interface Categorizer {
  suggest(label: string, kind: TxKind): ID | undefined;
}

export function createCategorizer(data: Pick<PeculeData, 'rules' | 'transactions' | 'categories'>): Categorizer {
  const categories = new Map(data.categories.filter((c) => !c.archived).map((c) => [c.id, c]));
  const byName = new Map<string, Category>();
  for (const c of categories.values()) byName.set(normalizeText(c.name), c);

  const rules = data.rules
    .filter((r) => categories.has(r.categoryId) && r.pattern.trim())
    .map((r) => ({ needle: normalizeText(r.pattern), categoryId: r.categoryId }))
    .sort((a, b) => b.needle.length - a.needle.length);

  const full = new Map<string, Map<ID, number>>();
  const short = new Map<string, Map<ID, number>>();
  const count = (index: Map<string, Map<ID, number>>, key: string, id: ID) => {
    if (!key) return;
    const m = index.get(key) ?? new Map<ID, number>();
    m.set(id, (m.get(id) ?? 0) + 1);
    index.set(key, m);
  };
  for (const tx of data.transactions) {
    if (!tx.categoryId || tx.kind === 'transfer' || !categories.has(tx.categoryId)) continue;
    const key = labelKey(tx.label);
    count(full, `${tx.kind}|${key}`, tx.categoryId);
    count(short, `${tx.kind}|${shortKey(key)}`, tx.categoryId);
  }
  const best = (m?: Map<ID, number>) => {
    if (!m) return undefined;
    let top: ID | undefined;
    let topCount = 0;
    for (const [id, n] of m) if (n > topCount) [top, topCount] = [id, n];
    return top;
  };

  return {
    suggest(label, kind) {
      if (kind === 'transfer') return undefined;
      const text = normalizeText(label);
      const rule = rules.find((r) => text.includes(r.needle));
      if (rule) return rule.categoryId;
      const key = labelKey(label);
      const learned = best(full.get(`${kind}|${key}`)) ?? (key ? best(short.get(`${kind}|${shortKey(key)}`)) : undefined);
      if (learned) return learned;
      for (const [pattern, name] of HINTS) {
        if (!pattern.test(text)) continue;
        const cat = byName.get(normalizeText(name));
        if (cat && (cat.type === 'income') === (kind === 'income')) return cat.id;
      }
      return undefined;
    },
  };
}
