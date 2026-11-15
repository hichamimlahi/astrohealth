// Voice trigger helpers (pure functions, easy to test)

// Phrases that open emergency mode. We avoid the single word "alert",
// because it is also used in normal speech ("my alert is active").
export const PHRASES_DECLENCHEUR = ['emergency', 'mayday', 'code red'];

export const TEXTE_PAR_DEFAUT =
  'Emergency triggered by the astronaut. No voice description was captured.';

// Returns the position just after the trigger phrase, or -1 if it is not in the text
export function positionApresDeclencheur(texte: string): number {
  const t = texte.toLowerCase();
  let meilleure = -1;
  for (const phrase of PHRASES_DECLENCHEUR) {
    const pos = t.indexOf(phrase);
    if (pos >= 0) {
      const fin = pos + phrase.length;
      if (meilleure === -1 || fin < meilleure) {
        meilleure = fin;
      }
    }
  }
  return meilleure;
}

// Builds the emergency description from the recognition results.
// resultats = one text per recognition result; indexDeclencheur = result that contained the trigger.
// manuel = true when emergency mode was opened with the button (no trigger phrase to remove).
export function construireTranscription(resultats: string[], indexDeclencheur: number, manuel: boolean): string {
  let texte = '';
  for (let i = indexDeclencheur; i < resultats.length; i++) {
    let t = resultats[i];
    if (i === indexDeclencheur && !manuel) {
      const pos = positionApresDeclencheur(t);
      if (pos >= 0) {
        t = t.slice(pos);
      }
    }
    texte += ' ' + t;
  }
  return texte.replace(/^[\s,.:;!-]+/, '').trim();
}
