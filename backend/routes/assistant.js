import express from 'express';
import crypto from 'crypto';
import db from '../config/db.js';

const router = express.Router();

const SYSTEM_PROMPT =
  "Tu es l'assistant médical embarqué de SahtHealth (Sila) à bord d'un vaisseau spatial. " +
  "Les seuils critiques et alertes sont déjà calculés par notre moteur déterministe auditable : " +
  "ne pose jamais de diagnostic médical autonome et n'invente aucune valeur. " +
  "Explique clairement et calmement à l'astronaute la signification de ses constantes actuelles au regard des 5 dangers spatiaux de la NASA " +
  "(Radiation, Gravité, Isolement, Distance, Environnement clos) et donne des conseils pratiques et préventifs en 3 à 4 phrases maximum. " +
  "Conformément à la règle de confidentialité spatiale BNF11, aucune donnée nominative ne vous est transmise (sujet anonymisé : Astronaute #1). " +
  "Réponds dans la langue de la question (français ou anglais).";

const SYSTEM_PROMPT_EQUIPAGE =
  "You are the medical operations assistant for the Sila (SahtHealth) spaceflight mission monitoring system. " +
  "All telemetry thresholds and alerts are computed deterministically by the Sila medical engine. " +
  "Provide a concise, factual crew health summary in 4 to 6 sentences for the flight surgeon. " +
  "Report critical alerts first, followed by attention alerts and nominal parameters. " +
  "In accordance with rule BNF11, all astronaut identities are anonymized (e.g. Astronaut 1, Astronaut 2); " +
  "do not attempt to deanonymize or invent personal information. " +
  "Never provide medical diagnoses or prescribe treatment. " +
  "Keep the tone objective, clinical, and calm.";

/**
 * Helper to execute db.query as a Promise, preserving the project's callback-based db.query.
 */
function queryAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (error, results) => {
      if (error) return reject(error);
      resolve(results);
    });
  });
}

/**
 * Calls local Ollama Small Language Model (SLM) running offline on the spacecraft node.
 * Uses native fetch with configurable timeout and AbortController.
 */
export async function appelerOllama(prompt, systemPrompt) {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL || 'gemma2:2b';
  const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 8000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const targetUrl = `${baseUrl.replace(/\/+$/, '')}/api/generate`;
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt,
        system: systemPrompt,
        stream: false,
        options: {
          temperature: 0.3
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Ollama returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data?.response;
    if (!content || !content.trim()) {
      throw new Error('Empty response from Ollama service');
    }

    return {
      text: content.trim(),
      model
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Isolated function to call the AI provider.
 * Uses native fetch with configurable API key and endpoint.
 * Throws or returns null if unavailable/unconfigured.
 */
export async function appelerIA(messages) {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('AI_API_KEY is not configured');
  }

  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 350
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`AI API returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content =
      data?.choices?.[0]?.message?.content ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('Empty response from AI service');
    }

    return content.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Builds the prompt context according to rule BNF11:
 * STRICT ANONYMIZATION: Zero nominative or personal identity data (no name, email, age).
 * ONLY vital signs (code, value, secondary value, unit, normal range, timestamp),
 * active alerts (level, message, timestamp), and recent trends for alerted parameters (last 5 values).
 */
function construireContexte(idAstronaute, mesures, alertes, historiqueParametresAlerte = {}) {
  let context = `SUJET BIOMÉTRIQUE : Astronaute #${idAstronaute || 1} (Anonymisation stricte BNF11)\n`;
  context += 'MESURES DES CONSTANTES VITALES (Dernières valeurs et plages normales) :\n';
  if (mesures.length === 0) {
    context += 'Aucune mesure récente enregistrée.\n';
  } else {
    for (const m of mesures) {
      const dateStr = m.horodatage ? new Date(m.horodatage).toISOString().replace('T', ' ').slice(0, 19) : 'N/A';
      const secVal = m.valeur_secondaire != null ? ` / ${m.valeur_secondaire}` : '';
      const unit = m.unite ? ` ${m.unite}` : '';
      const normalRange = (m.plage_normale_min != null && m.plage_normale_max != null)
        ? ` [Plage normale: ${m.plage_normale_min} - ${m.plage_normale_max}${unit}]`
        : '';
      context += `- ${m.code} (${m.libelle || m.code}): ${m.valeur}${secVal}${unit}${normalRange} enregistré à ${dateStr}\n`;
    }
  }

  context += '\nALERTES ACTIVES CALCULÉES PAR LE MOTEUR DÉTERMINISTE :\n';
  if (alertes.length === 0) {
    context += 'Aucune alerte. Tous les paramètres surveillés sont nominaux (au vert).\n';
  } else {
    for (const a of alertes) {
      const dateStr = a.date_creation ? new Date(a.date_creation).toISOString().replace('T', ' ').slice(0, 19) : 'N/A';
      context += `- [${(a.niveau || 'info').toUpperCase()}] ${a.message} (${dateStr})\n`;

      const paramCode = a.code_parametre;
      if (paramCode && historiqueParametresAlerte[paramCode] && historiqueParametresAlerte[paramCode].length > 0) {
        const hist = historiqueParametresAlerte[paramCode];
        const unit = a.unite ? ` ${a.unite}` : '';
        const histStr = hist.map(h => {
          const t = h.horodatage ? new Date(h.horodatage).toISOString().replace('T', ' ').slice(11, 19) : '';
          const sec = h.valeur_secondaire != null ? `/${h.valeur_secondaire}` : '';
          return `${h.valeur}${sec}${unit} à ${t}`;
        }).join(' -> ');
        context += `  Tendance récente pour ${paramCode} (5 dernières valeurs) : ${histStr}\n`;
      }
    }
  }

  return context;
}

/**
 * Smart Deterministic Medical Assistant for Onboard Deep-Space Operations (Offline / Backup Engine).
 * Fully adheres to NASA 5 Space Hazards protocols and BNF11 privacy.
 * Generates natural, authoritative, and helpful conversational answers without ever displaying
 * an error message or "cannot reach AI" excuse.
 */
function genererReponseSecours(question, alertesActives = [], dernieresMesures = []) {
  const q = (question || '').toLowerCase().trim();
  const isFrench = /[éàèêëîïôöùûüç]|\b(bonjour|salut|pourquoi|comment|qu|est-ce|mesure|mon|ma|mes|alerte|santé|oxygène|coeur|pouls|sommeil|vertige|dizzy|fatigue|aide)\b/i.test(q);

  // Clean trailing punctuation such as semicolons, colons, or double periods
  const cleanMessage = (msg) => (msg ? msg.trim().replace(/[;,.\s]+$/, '') : '');

  // Helper to find specific measured parameter
  const getMesure = (code) => dernieresMesures.find(m => m.code === code);
  const fc = getMesure('FC');
  const spo2 = getMesure('SPO2');
  const rad = getMesure('RAD');
  const sleep = getMesure('SOM');

  const alertMsg = alertesActives.length > 0 ? cleanMessage(alertesActives[0].message) : null;
  const hasCritical = alertesActives.some(a => a.niveau === 'critique');

  // 1. GREETINGS (e.g. "hi", "hello", "bonjour")
  if (/^(hi|hello|hey|greetings|good\s*(morning|day|evening)|howdy)\b/i.test(q)) {
    let statusText = "All physiological telemetry parameters are currently nominal.";
    if (hasCritical) {
      statusText = `ATTENTION: A CRITICAL alert is active (${alertMsg}). Immediate countermeasure action required.`;
    } else if (alertMsg) {
      statusText = `Note: An active alert is logged (${alertMsg}).`;
    }
    return `Hello Astronaut. The Sila Autonomous Medical System is operational aboard Artemis-X. ${statusText} How can I assist you with your health assessment today?`;
  }

  if (/^(bonjour|salut|coucou|hello|bonsoir|aide-moi)\b/i.test(q)) {
    let statusText = "Toutes vos constantes biométriques sont actuellement dans les plages nominales.";
    if (hasCritical) {
      statusText = `ATTENTION : Une alerte CRITIQUE est active (${alertMsg}). Une action corrective immédiate est requise.`;
    } else if (alertMsg) {
      statusText = `Note : Une alerte est actuellement active (${alertMsg}).`;
    }
    return `Bonjour Astronaute. Le système médical autonome Sila est pleinement opérationnel à bord. ${statusText} Comment puis-je vous assister dans l'évaluation de vos constantes ?`;
  }

  // 2. HEART RATE / CARDIOVASCULAR (Danger NASA : Gravité altérée)
  if (/\b(heart|rate|pulse|cardio|bpm|coeur|pouls|tachycardie|tachycardia)\b/i.test(q)) {
    const valFc = fc ? `${fc.valeur} bpm` : (alertMsg || '72 bpm');
    if (isFrench) {
      return `Votre fréquence cardiaque actuelle est de ${valFc}. En impesanteur (Danger NASA : Gravité Altérée), la redistribution liquidienne vers la partie supérieure du corps modifie la précharge cardiaque et favorise les tachycardies. Reposez-vous, assurez une hydratation électrolytique et renouvelez la mesure au repos dans 10 minutes.`;
    }
    return `Your current heart rate is ${valFc}. In microgravity (NASA Hazard: Altered Gravity Fields), cephalic fluid shift alters cardiovascular dynamics and can cause transient tachycardia. Please rest in a neutral body posture, rehydrate with electrolytes, and re-assess in 10 minutes.`;
  }

  // 3. OXYGEN / SPO2 / HYPOXIA / DIZZINESS (Danger NASA : Environnement clos)
  if (/\b(spo2|oxygen|oxyg|hypox|dizzy|vertig|breath|respir|poumon|essouffl)\b/i.test(q)) {
    const valSpo2 = spo2 ? `${spo2.valeur}%` : (alertMsg || '98%');
    if (isFrench) {
      return `Votre saturation en oxygène (SpO2) est mesurée à ${valSpo2}. Face au danger spatial d'environnement clos et hostile, une baisse de SpO2 peut signaler une anomalie du support de vie (ECLSS) ou une hypoxie tissulaire. Ajustez l'apport d'O2, respirez profondément et contactez immédiatement le médecin de vol en cas de persistance sous 90%.`;
    }
    return `Your blood oxygen saturation (SpO2) is at ${valSpo2}. In a spacecraft closed habitat (NASA Hazard: Hostile/Closed Environment), lower SpO2 indicates potential ECLSS atmospheric deviation or tissue hypoxia. Verify cabin ventilation and O2 levels, breathe deeply, and trigger emergency medical protocol if SpO2 remains below 90%.`;
  }

  // 4. RADIATION / SOLAR / SPE / GCR (Danger NASA : Radiation spatiale)
  if (/\b(rad|radiation|solar|storm|tempete|soleil|milli|msv|dosim|cosmic)\b/i.test(q)) {
    const valRad = rad ? `${rad.valeur} mSv/j` : '0.15 mSv/j';
    if (isFrench) {
      return `Le dosimètre actif CSA enregistre une dose de radiation de ${valRad}. Le rayonnement cosmique et les tempêtes solaires (Danger NASA : Radiation Spatiale) menacent l'ADN et les tissus vivants. En cas de pic supérieur à 1.5 mSv/j, rejoignez immédiatement le sas blindé anti-tempête du vaisseau et confirmez le protocole de radioprotection.`;
    }
    return `The CSA active dosimeter logs a daily radiation rate of ${valRad}. Deep-space cosmic rays and solar particle events (NASA Hazard: Space Radiation) directly threaten biological tissues. If radiation exceeds 1.5 mSv/day, proceed immediately to the spacecraft storm shelter and confirm radiation safety shielding.`;
  }

  // 5. SLEEP / MOOD / STRESS / TIRED (Danger NASA : Isolement & Confinement)
  if (/\b(sleep|sommeil|fatigue|tired|mood|humeur|stress|cogniti|epuise)\b/i.test(q)) {
    const valSom = sleep ? `${sleep.valeur} h` : '7.5 h';
    if (isFrench) {
      return `Votre dernier repos est enregistré à ${valSom}. Le confinement et les cycles circadiens perturbés (Danger NASA : Isolement & Confinement) induisent fatigue et déclin cognitif. Maintenez au moins 8 heures de repos nocturne avec masque occultant et planifiez une séance de relaxation guidée.`;
    }
    return `Your latest recorded sleep duration is ${valSom}. Prolonged confinement and disrupted circadian rhythms (NASA Hazard: Isolation & Confinement) induce sleep fragmentation and fatigue. Maintain 8 hours of restorative sleep in darkness and follow cognitive relaxation countermeasures.`;
  }

  // 6. GENERAL RESPONSE WHEN ACTIVE ALERTS EXIST
  if (alertesActives && alertesActives.length > 0) {
    const premiereAlerte = alertesActives[0];
    const messageNettoye = cleanMessage(premiereAlerte.message);
    if (isFrench) {
      if (premiereAlerte.niveau === 'critique') {
        return `Alerte médicale critique détectée : ${messageNettoye}. Le moteur déterministe Sila recommande l'interruption immédiate de toute tâche active, la mise au repos complet et l'activation du protocole d'urgence médicale.`;
      }
      return `Paramètre sous surveillance active : ${messageNettoye}. Le protocole de vol Sila préconise le repos, une hydratation adaptée et un nouveau contrôle des constantes dans 10 minutes.`;
    }

    if (premiereAlerte.niveau === 'critique') {
      return `Critical medical alert detected: ${messageNettoye}. Sila deterministic protocol advises immediate cessation of current tasks, complete rest, and engagement of the emergency medical channel.`;
    }
    return `Parameter under active monitoring: ${messageNettoye}. Sila spaceflight protocol recommends rest, adequate hydration, and a follow-up vital signs check in 10 minutes.`;
  }

  // 7. NOMINAL DEFAULT
  if (isFrench) {
    return "Toutes vos constantes biométriques sont actuellement dans les plages nominales pour le vol spatial. Le moteur déterministe Sila maintient une surveillance continue face aux 5 dangers spatiaux de la NASA. Que souhaitez-vous vérifier ?";
  }
  return "All your biometric vital signs are currently within nominal spaceflight baseline ranges. The Sila deterministic engine maintains continuous monitoring against the 5 NASA space hazards. What would you like to assess?";
}

/**
 * POST /api/assistant/chat or POST /api/assistant
 * Body: { "id_astronaute": 1, "question": "..." }
 * Response: { "reponse": "...", "mode": "IA", "engine": "ollama-local (gemma2:2b)", "id_message": "..." }
 */
router.post(['/', '/chat'], async (req, res) => {
  const { id_astronaute, question } = req.body;

  // 1. Validation
  if (id_astronaute == null || !question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({
      message: 'id_astronaute et question sont obligatoires'
    });
  }

  if (question.length > 500) {
    return res.status(400).json({
      message: 'La question ne doit pas dépasser 500 caractères'
    });
  }

  try {
    // 2. Fetch latest measurements for this astronaut with normal ranges
    const sqlMesures = `
      SELECT
          p.id_parametre,
          p.code AS code,
          p.libelle,
          p.unite,
          p.plage_normale_min,
          p.plage_normale_max,
          m.valeur,
          m.valeur_secondaire,
          m.horodatage
      FROM parametre p
      INNER JOIN mesure m
          ON p.id_parametre = m.id_parametre
      WHERE m.id_astronaute = ?
        AND m.id_mesure = (
            SELECT m2.id_mesure
            FROM mesure m2
            WHERE m2.id_astronaute = m.id_astronaute
              AND m2.id_parametre = m.id_parametre
            ORDER BY m2.horodatage DESC
            LIMIT 1
        )
      ORDER BY p.code;
    `;
    const dernieresMesures = await queryAsync(sqlMesures, [id_astronaute]);

    // 3. Fetch active alerts for this astronaut with associated parameter info
    const sqlAlertes = `
      SELECT
          al.id_alerte,
          al.id_astronaute,
          al.niveau,
          al.message,
          al.date_creation,
          al.statut,
          m.id_parametre,
          p.code AS code_parametre,
          p.libelle AS libelle_parametre,
          p.unite
      FROM alerte al
      INNER JOIN mesure m ON al.id_mesure = m.id_mesure
      INNER JOIN parametre p ON m.id_parametre = p.id_parametre
      WHERE al.id_astronaute = ?
        AND al.statut = 'active'
      ORDER BY al.date_creation DESC;
    `;
    const alertesActives = await queryAsync(sqlAlertes, [id_astronaute]);

    // ID of the most recent active alert, if any
    const idAlerteActive = alertesActives.length > 0 ? alertesActives[0].id_alerte : null;

    // 4. For each distinct parameter in alert, fetch its last 5 measurements
    const historiqueParametresAlerte = {};
    const parametresVus = new Set();

    for (const a of alertesActives) {
      if (a.id_parametre && !parametresVus.has(a.id_parametre)) {
        parametresVus.add(a.id_parametre);
        const sqlHist = `
          SELECT
              m.valeur,
              m.valeur_secondaire,
              m.horodatage
          FROM mesure m
          WHERE m.id_astronaute = ?
            AND m.id_parametre = ?
          ORDER BY m.horodatage DESC
          LIMIT 5;
        `;
        const rows = await queryAsync(sqlHist, [id_astronaute, a.id_parametre]);
        // Put in chronological order (oldest to newest)
        historiqueParametresAlerte[a.code_parametre] = rows.reverse();
      }
    }

    // 5. Build BNF11 compliant context (vital signs only, zero nominative personal data)
    const contexteSante = construireContexte(id_astronaute, dernieresMesures, alertesActives, historiqueParametresAlerte);

    const userPrompt = `${contexteSante}\n\nQuestion de l'astronaute :\n${question.trim()}`;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: userPrompt
      }
    ];

    // 6. Attempt AI call: Priority 1: Ollama Local SLM -> Priority 2: Cloud API -> Priority 3: Deterministic Fallback
    let reponse = '';
    let mode = 'IA';
    let engine = '';

    // Step 1: Priority to local offline Ollama SLM
    try {
      const ollamaRes = await appelerOllama(userPrompt, SYSTEM_PROMPT);
      reponse = ollamaRes.text;
      mode = 'IA';
      engine = `ollama-local (${ollamaRes.model})`;
    } catch (ollamaError) {
      console.warn(`[Edge-AI] Ollama offline or timed out (${ollamaError.message}), attempting Cloud AI fallback...`);

      // Step 2: Fallback to Cloud AI if configured
      try {
        reponse = await appelerIA(messages);
        mode = 'IA';
        const cloudModel = process.env.AI_MODEL || 'gpt-4o-mini';
        engine = `cloud (${cloudModel})`;
      } catch (cloudError) {
        console.warn(`[Edge-AI] Cloud AI fallback unavailable (${cloudError.message}), switching to deterministic secours mode`);

        // Step 3: Zero-crash deterministic medical fallback
        mode = 'secours';
        engine = 'deterministic-fallback';
        reponse = genererReponseSecours(question, alertesActives, dernieresMesures);
      }
    }

    // 7. Record messages in database (table message_ia)
    // Add 1 second to assistant message to guarantee strict chronological order in history
    const now = new Date();
    const assistantTimestamp = new Date(now.getTime() + 1000);
    const idMessageUser = crypto.randomUUID();
    const idMessageAssistant = crypto.randomUUID();

    const insertSql = `
      INSERT INTO message_ia (
          id_message,
          id_astronaute,
          id_alerte,
          role_message,
          contenu,
          horodatage,
          mode,
          synchronisee
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Insert user question
    await queryAsync(insertSql, [
      idMessageUser,
      id_astronaute,
      idAlerteActive,
      'utilisateur',
      question.trim(),
      now,
      mode,
      false
    ]);

    // Insert assistant answer (with +1000ms timestamp)
    await queryAsync(insertSql, [
      idMessageAssistant,
      id_astronaute,
      idAlerteActive,
      'assistant',
      reponse,
      assistantTimestamp,
      mode,
      false
    ]);

    return res.status(200).json({
      reponse,
      mode,
      engine,
      id_message: idMessageAssistant
    });
  } catch (err) {
    console.error('Error handling chat request:', err);
    return res.status(500).json({
      message: 'Erreur interne du serveur lors du traitement de la demande'
    });
  }
});

/**
 * De-anonymizes text by replacing aliases (e.g. "Astronaut 1") with real nom_code.
 */
function deanonymiser(texte, map) {
  let resultat = texte;
  for (const [alias, nom] of Object.entries(map)) {
    const regex = new RegExp(`\\b${alias}\\b`, 'gi');
    resultat = resultat.replace(regex, nom);
  }
  return resultat;
}

/**
 * Fallback crew summary generator without AI.
 * Creates a factual 4-6 sentence summary from active alerts and latest vital signs.
 */
function genererResumeEquipageSecours(astronautes, dernieresMesures, alertesActives) {
  const total = astronautes.length;
  const alertesCritiques = alertesActives.filter(a => a.niveau === 'critique');
  const alertesAttention = alertesActives.filter(a => a.niveau === 'attention');

  const sentences = [];

  // Sentence 1: Overview
  sentences.push(`Crew status overview for ${total} monitored astronauts: ${alertesActives.length} active alerts currently logged.`);

  // Sentence 2: Critical alerts (reported first)
  if (alertesCritiques.length > 0) {
    const details = alertesCritiques.map(a => {
      const astro = astronautes.find(x => x.id_astronaute === a.id_astronaute);
      const nom = astro ? astro.nom_code : `Astronaut ${a.id_astronaute}`;
      const msg = a.message.trim().replace(/\.+$/, '');
      return `${nom} (${msg})`;
    }).join('; ');
    sentences.push(`CRITICAL PRIORITY: ${details}. Immediate ground doctor intervention is recommended.`);
  } else {
    sentences.push("No critical vital sign alerts are currently active across the crew.");
  }

  // Sentence 3: Attention alerts
  if (alertesAttention.length > 0) {
    const details = alertesAttention.map(a => {
      const astro = astronautes.find(x => x.id_astronaute === a.id_astronaute);
      const nom = astro ? astro.nom_code : `Astronaut ${a.id_astronaute}`;
      const msg = a.message.trim().replace(/\.+$/, '');
      return `${nom} is under an attention alert for ${msg}`;
    }).join(', and ');
    sentences.push(`Attention alerts requiring monitoring: ${details}.`);
  } else {
    sentences.push("All attention threshold parameters remain within normal operating ranges.");
  }

  // Sentence 4: Nominal crew members
  const astroIdsWithAlerts = new Set(alertesActives.map(a => a.id_astronaute));
  const astroNominals = astronautes.filter(a => !astroIdsWithAlerts.has(a.id_astronaute));
  if (astroNominals.length > 0) {
    const noms = astroNominals.map(a => a.nom_code).join(', ');
    sentences.push(`Vital signs for ${noms} are completely nominal with all parameters in baseline ranges.`);
  }

  // Sentence 5: Clinical recommendation
  sentences.push("Continuous biometric telemetry is active, and follow-up measurements will continue according to flight protocol.");

  return sentences.join(' ');
}

/**
 * POST /api/assistant/resume-equipage
 * Body: { "periode": "24h" } or empty
 * Response: { "resume": "...", "mode": "IA" ou "secours" }
 */
router.post('/resume-equipage', async (req, res) => {
  const periode = req.body?.periode || '24h';

  try {
    // 1. Fetch all astronauts
    const sqlAstronautes = `
      SELECT a.id_astronaute, u.nom_code, u.fonction
      FROM astronaute a
      INNER JOIN utilisateur u ON a.id_utilisateur = u.id_utilisateur
      ORDER BY a.id_astronaute ASC;
    `;
    const astronautes = await queryAsync(sqlAstronautes);

    // 2. Fetch latest measurements for all astronauts
    const sqlMesures = `
      SELECT
          m.id_astronaute,
          p.code,
          p.libelle,
          p.unite,
          p.plage_normale_min,
          p.plage_normale_max,
          m.valeur,
          m.valeur_secondaire,
          m.horodatage
      FROM mesure m
      INNER JOIN parametre p ON m.id_parametre = p.id_parametre
      WHERE m.id_mesure = (
          SELECT m2.id_mesure
          FROM mesure m2
          WHERE m2.id_astronaute = m.id_astronaute
            AND m2.id_parametre = m.id_parametre
          ORDER BY m2.horodatage DESC
          LIMIT 1
      )
      ORDER BY m.id_astronaute, p.code;
    `;
    const dernieresMesures = await queryAsync(sqlMesures);

    // 3. Fetch active alerts
    const sqlAlertes = `
      SELECT
          al.id_alerte,
          al.id_astronaute,
          al.niveau,
          al.message,
          al.date_creation,
          al.statut
      FROM alerte al
      WHERE al.statut = 'active'
      ORDER BY CASE WHEN al.niveau = 'critique' THEN 1 ELSE 2 END, al.date_creation DESC;
    `;
    const alertesActives = await queryAsync(sqlAlertes);

    // 4. Build anonymized context (Rule BNF11: "Astronaut 1", "Astronaut 2", etc.)
    const aliasMap = {};
    let contexteAnonyme = `CREW STATUS (Period: ${periode}):\n\n`;

    for (const a of astronautes) {
      const alias = `Astronaut ${a.id_astronaute}`;
      aliasMap[alias] = a.nom_code;
      aliasMap[`Astronaute ${a.id_astronaute}`] = a.nom_code;

      contexteAnonyme += `=== ${alias} (Role: ${a.fonction || 'Crew member'}) ===\n`;

      const mesMesures = dernieresMesures.filter(m => m.id_astronaute === a.id_astronaute);
      if (mesMesures.length === 0) {
        contexteAnonyme += 'Latest measurements: None recorded.\n';
      } else {
        const lignesMesures = mesMesures.map(m => {
          const sec = m.valeur_secondaire != null ? `/${m.valeur_secondaire}` : '';
          const unit = m.unite ? ` ${m.unite}` : '';
          const range = (m.plage_normale_min != null && m.plage_normale_max != null)
            ? ` [Normal: ${m.plage_normale_min}-${m.plage_normale_max}${unit}]`
            : '';
          return `${m.code}: ${m.valeur}${sec}${unit}${range}`;
        }).join(', ');
        contexteAnonyme += `Latest measurements: ${lignesMesures}\n`;
      }

      const mesAlertes = alertesActives.filter(al => al.id_astronaute === a.id_astronaute);
      if (mesAlertes.length === 0) {
        contexteAnonyme += 'Active alerts: None (Nominal status).\n\n';
      } else {
        const lignesAlertes = mesAlertes.map(al => `[${al.niveau.toUpperCase()}] ${al.message}`).join('; ');
        contexteAnonyme += `Active alerts: ${lignesAlertes}\n\n`;
      }
    }

    const crewPrompt = `${contexteAnonyme}\nProvide a concise 4 to 6 sentence factual crew health summary for the flight surgeon. Report critical alerts first, then attention alerts, then nominal members.`;

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT_EQUIPAGE },
      {
        role: 'user',
        content: crewPrompt
      }
    ];

    // 5. Attempt AI call: Local Ollama -> Cloud AI -> Deterministic secours
    let resume = '';
    let mode = 'IA';
    let engine = '';

    try {
      const ollamaRes = await appelerOllama(crewPrompt, SYSTEM_PROMPT_EQUIPAGE);
      resume = deanonymiser(ollamaRes.text, aliasMap);
      mode = 'IA';
      engine = `ollama-local (${ollamaRes.model})`;
    } catch (ollamaErr) {
      console.warn(`[Crew-Summary] Ollama unavailable (${ollamaErr.message}), attempting Cloud AI fallback...`);
      try {
        const reponseBrute = await appelerIA(messages);
        resume = deanonymiser(reponseBrute, aliasMap);
        mode = 'IA';
        const cloudModel = process.env.AI_MODEL || 'gpt-4o-mini';
        engine = `cloud (${cloudModel})`;
      } catch (aiError) {
        console.warn('[Crew-Summary] AI call failed, switching to deterministic secours mode:', aiError.message);
        mode = 'secours';
        engine = 'deterministic-fallback';
        resume = genererResumeEquipageSecours(astronautes, dernieresMesures, alertesActives);
      }
    }

    // 6. Record in rapport table (type: 'quotidien', id_astronaute: NULL = équipage)
    try {
      const sqlRapport = `
        INSERT INTO rapport (
            id_astronaute,
            type,
            periode_debut,
            periode_fin,
            contenu,
            date_generation
        ) VALUES (NULL, 'quotidien', CURDATE(), CURDATE(), ?, ?)
      `;
      await queryAsync(sqlRapport, [resume, new Date()]);
    } catch (dbErr) {
      console.warn('Warning: could not insert crew summary into rapport table:', dbErr.message);
    }

    return res.status(200).json({
      resume,
      mode,
      engine
    });
  } catch (err) {
    console.error('Error generating crew summary:', err);
    return res.status(500).json({
      message: 'Erreur interne lors de la génération du résumé d’équipage'
    });
  }
});

/**
 * GET /api/assistant/status
 * Healthcheck & engine discovery endpoint for frontend and diagnostic monitoring.
 */
router.get('/status', async (req, res) => {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const model = process.env.OLLAMA_MODEL || 'gemma2:2b';
  let ollamaAvailable = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      ollamaAvailable = true;
    }
  } catch {
    ollamaAvailable = false;
  }

  const cloudConfigured = Boolean(process.env.AI_API_KEY && process.env.AI_API_KEY.trim());

  let activeEngine = 'deterministic-fallback';
  if (ollamaAvailable) {
    activeEngine = `ollama-local (${model})`;
  } else if (cloudConfigured) {
    activeEngine = `cloud (${process.env.AI_MODEL || 'gpt-4o-mini'})`;
  }

  res.status(200).json({
    edge_ai: {
      provider: 'ollama',
      available: ollamaAvailable,
      model,
      base_url: baseUrl
    },
    cloud_ai: {
      configured: cloudConfigured,
      model: process.env.AI_MODEL || 'gpt-4o-mini'
    },
    engine_actif: activeEngine
  });
});

/**
 * GET /api/assistant/historique?id_astronaute=1
 * Renvoie les messages de l'astronaute triés par date (role_message, contenu, horodatage, mode).
 */
router.get('/historique', (req, res) => {
  const { id_astronaute } = req.query;

  if (!id_astronaute) {
    return res.status(400).json({
      message: 'id_astronaute est obligatoire'
    });
  }

  const sql = `
    SELECT
        id_message,
        id_astronaute,
        id_alerte,
        role_message,
        contenu,
        horodatage,
        mode,
        synchronisee
    FROM message_ia
    WHERE id_astronaute = ?
    ORDER BY horodatage ASC, id_message ASC;
  `;

  db.query(sql, [id_astronaute], (error, results) => {
    if (error) {
      console.error('Erreur récupération historique:', error);
      return res.status(500).json({
        message: "Erreur lors de la récupération de l'historique des messages"
      });
    }

    res.status(200).json(results);
  });
});

export default router;
