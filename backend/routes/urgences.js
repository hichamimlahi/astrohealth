import express from 'express';
import crypto from 'node:crypto';
import db from '../config/db.js';

const router = express.Router();
const LONGUEUR_MAX = 1000;

/**
 * POST /api/urgences
 * Body: { id_astronaute: 1, texte: "I feel dizzy and cannot breathe" }
 * Records an emergency voice report from an astronaut and notifies the ground doctor
 * in real time (Socket.IO event "nouvelle_urgence").
 * The report is stored in the table message_ia with role_message = 'urgence' and mode = 'urgence'
 * (no change to the database schema is needed).
 */
router.post('/', (req, res) => {
    const id_astronaute = Number(req.body.id_astronaute);
    const texte = typeof req.body.texte === 'string'
        ? req.body.texte.trim().slice(0, LONGUEUR_MAX)
        : '';

    if (!Number.isInteger(id_astronaute) || id_astronaute <= 0) {
        return res.status(400).json({ message: 'id_astronaute invalide' });
    }
    if (texte === '') {
        return res.status(400).json({ message: 'texte obligatoire' });
    }

    const sqlAstronaute = `
        SELECT a.id_astronaute, u.nom_code
        FROM astronaute a
        INNER JOIN utilisateur u ON a.id_utilisateur = u.id_utilisateur
        WHERE a.id_astronaute = ?
    `;

    db.query(sqlAstronaute, [id_astronaute], (erreur, lignes) => {
        if (erreur) {
            console.error(erreur);
            return res.status(500).json({ message: "Erreur lors de l'enregistrement de l'urgence" });
        }
        if (lignes.length === 0) {
            return res.status(404).json({ message: 'Astronaute introuvable' });
        }

        const nom_code = lignes[0].nom_code;
        const id_message = crypto.randomUUID();
        const horodatage = new Date();

        const sqlInsert = `
            INSERT INTO message_ia
                (id_message, id_astronaute, id_alerte, role_message, contenu, horodatage, mode, synchronisee)
            VALUES (?, ?, NULL, 'urgence', ?, ?, 'urgence', false)
        `;

        db.query(sqlInsert, [id_message, id_astronaute, texte, horodatage], (erreurInsert) => {
            if (erreurInsert) {
                console.error(erreurInsert);
                return res.status(500).json({ message: "Erreur lors de l'enregistrement de l'urgence" });
            }

            const io = req.app.get('io');
            if (io) {
                io.emit('nouvelle_urgence', {
                    id_message,
                    id_astronaute,
                    nom_code,
                    texte,
                    horodatage
                });
            }

            return res.status(201).json({ id_message, id_astronaute, nom_code, horodatage });
        });
    });
});

/**
 * GET /api/urgences?minutes=60
 * Emergency reports of the last N minutes (default 60, max 1440), newest first.
 */
router.get('/', (req, res) => {
    let minutes = Number(req.query.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
        minutes = 60;
    }
    minutes = Math.min(minutes, 1440);
    const depuis = new Date(Date.now() - minutes * 60000);

    const sql = `
        SELECT
            m.id_message,
            m.id_astronaute,
            u.nom_code,
            m.contenu,
            m.horodatage
        FROM message_ia m
        INNER JOIN astronaute a ON m.id_astronaute = a.id_astronaute
        INNER JOIN utilisateur u ON a.id_utilisateur = u.id_utilisateur
        WHERE m.mode = 'urgence' AND m.horodatage >= ?
        ORDER BY m.horodatage DESC
        LIMIT 20
    `;

    db.query(sql, [depuis], (erreur, resultats) => {
        if (erreur) {
            console.error(erreur);
            return res.status(500).json({ message: 'Erreur lors de la récupération des urgences' });
        }
        res.status(200).json(resultats);
    });
});

export default router;
