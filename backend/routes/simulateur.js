import express from 'express';
import db from '../config/db.js';
import { randomUUID } from 'node:crypto';
import { verifierEtCreerAlerte } from '../services/alertesService.js';

const router = express.Router();
const ID_ASTRONAUTE = 1;

const scenarios = {
    nominal: [
        { spo2: 98, fc: 72, radiation: 0.15, temp: 36.6 },
        { spo2: 98, fc: 74, radiation: 0.16, temp: 36.7 },
        { spo2: 97, fc: 71, radiation: 0.14, temp: 36.6 },
        { spo2: 98, fc: 72, radiation: 0.15, temp: 36.6 }
    ],

    hypoxia: [
        { spo2: 95, fc: 80, radiation: 0.20, temp: 36.7 },
        { spo2: 92, fc: 92, radiation: 0.20, temp: 36.8 },
        { spo2: 89, fc: 104, radiation: 0.20, temp: 36.9 },
        { spo2: 86, fc: 118, radiation: 0.20, temp: 37.0 }
    ],

    solar_storm: [
        { spo2: 97, fc: 76, radiation: 0.40, temp: 36.7 },
        { spo2: 96, fc: 86, radiation: 0.95, temp: 36.8 },
        { spo2: 95, fc: 98, radiation: 1.80, temp: 36.9 },
        { spo2: 95, fc: 106, radiation: 2.80, temp: 37.1 }
    ]
};

// Alias de rétrocompatibilité
scenarios.normal = scenarios.nominal;
scenarios.baisse_oxygene = scenarios.hypoxia;

router.post('/scenario', async (req, res) => {
    const { nom } = req.body;
    const idAstronaute = req.body.id_astronaute ? Number(req.body.id_astronaute) : ID_ASTRONAUTE;

    if (!scenarios[nom]) {
        return res.status(400).json({
            message: 'Scénario invalide. Utilisez nominal, hypoxia ou solar_storm.'
        });
    }

    const connection = db.promise();

    try {
        await connection.beginTransaction();

        // Si scénario nominal, résoudre les alertes actives pour réinitialiser l'état au vert
        if (nom === 'nominal' || nom === 'normal') {
            await connection.execute(
                `UPDATE Alerte
                 SET statut = 'resolue', date_resolution = NOW()
                 WHERE id_astronaute = ? AND statut = 'active'`,
                [idAstronaute]
            );
        }

        // 1. Récupérer les IDs des paramètres
        const [parametres] = await connection.execute(
            `SELECT id_parametre, code
             FROM Parametre
             WHERE code IN ('SPO2', 'FC', 'RADIATION', 'TEMP')`
        );

        const ids = Object.fromEntries(
            parametres.map(p => [p.code, p.id_parametre])
        );

        if (!ids.SPO2 || !ids.FC) {
            throw new Error('Paramètres SPO2 ou FC introuvables');
        }

        // 2. Récupérer le nom de code de l'astronaute
        const [astronautes] = await connection.execute(
            `SELECT u.nom_code
             FROM Astronaute a
             JOIN Utilisateur u ON u.id_utilisateur = a.id_utilisateur
             WHERE a.id_astronaute = ?`,
            [idAstronaute]
        );

        if (astronautes.length === 0) {
            throw new Error('Astronaute introuvable');
        }

        const nom_code = astronautes[0].nom_code;
        const mesuresGenerees = [];
        const alertesGenerees = [];
        const evenements = [];
        const serie = scenarios[nom];

        // 3. Générer et enregistrer les mesures
        const debut = Date.now() - (serie.length - 1) * 1000;
        for (let i = 0; i < serie.length; i++) {
            const horodatage = new Date(debut + i * 1000)
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ');

            const mesures = [];
            if (serie[i].spo2 != null && ids.SPO2) {
                mesures.push({ code: 'SPO2', id_parametre: ids.SPO2, valeur: serie[i].spo2 });
            }
            if (serie[i].fc != null && ids.FC) {
                mesures.push({ code: 'FC', id_parametre: ids.FC, valeur: serie[i].fc });
            }
            if (serie[i].radiation != null && ids.RADIATION) {
                mesures.push({ code: 'RADIATION', id_parametre: ids.RADIATION, valeur: serie[i].radiation });
            }
            if (serie[i].temp != null && ids.TEMP) {
                mesures.push({ code: 'TEMP', id_parametre: ids.TEMP, valeur: serie[i].temp });
            }

            for (const mesure of mesures) {
                const id_mesure = randomUUID();

                // Enregistrer la mesure
                await connection.execute(
                    `INSERT INTO Mesure (
                        id_mesure,
                        id_astronaute,
                        id_parametre,
                        valeur,
                        valeur_secondaire,
                        horodatage,
                        source
                    ) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
                    [
                        id_mesure,
                        idAstronaute,
                        mesure.id_parametre,
                        mesure.valeur,
                        horodatage,
                        'simulateur'
                    ]
                );

                // Vérifier les seuils et créer une alerte
                const alerte = await verifierEtCreerAlerte(
                    connection,
                    {
                        id_mesure,
                        id_astronaute: idAstronaute,
                        id_parametre: mesure.id_parametre,
                        valeur: mesure.valeur,
                        valeur_secondaire: null
                    }
                );

                mesuresGenerees.push({
                    id_mesure,
                    code: mesure.code,
                    valeur: mesure.valeur,
                    horodatage
                });

                evenements.push({
                    event: 'nouvelle_mesure',
                    payload: {
                        id_astronaute: idAstronaute,
                        code: mesure.code,
                        valeur: mesure.valeur,
                        horodatage
                    }
                });

                // Préparer l'événement d'alerte
                if (alerte) {
                    const [infosAlerte] = await connection.execute(
                        `SELECT date_creation
                         FROM Alerte
                         WHERE id_alerte = ?`,
                        [alerte.id_alerte]
                    );

                    const date_creation = infosAlerte[0]?.date_creation || horodatage;

                    const payload = {
                        id_alerte: alerte.id_alerte,
                        id_astronaute: idAstronaute,
                        nom_code,
                        niveau: alerte.niveau,
                        message: alerte.message,
                        date_creation
                    };

                    alertesGenerees.push(payload);
                    evenements.push({
                        event: 'nouvelle_alerte',
                        payload
                    });
                }
            }
        }

        // 4. Confirmer toutes les opérations
        await connection.commit();

        // 5. Envoyer les événements Socket.IO
        const io = req.app.get('io');

        if (io) {
            for (const evenement of evenements) {
                io.emit(evenement.event, evenement.payload);
            }
        }

        return res.status(201).json({
            message: `Scénario ${nom} exécuté avec succès`,
            nom,
            id_astronaute: idAstronaute,
            nombre_mesures: mesuresGenerees.length,
            mesures: mesuresGenerees,
            alertes: alertesGenerees
        });

    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Erreur rollback:', rollbackError);
        }
        console.error(error);
        return res.status(500).json({
            message: 'Erreur lors de l’exécution du scénario'
        });
    }
});



export default router;