import { Component, DestroyRef, ElementRef, ViewChild, HostListener, AfterViewInit, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { Subject, forkJoin, merge, timer, of, switchMap, catchError } from 'rxjs';
import { SocketService } from '../../services/socket.service';
import { Urgence } from './urgence';
import { ApiService, Alerte, Astronaute, MesureRecente, Parametre } from '../../services/api.service';

Chart.register(...registerables);

export interface GuideMesure {
  protocole: string;
  plageNormale: string;
  pourquoi: string;
}

export interface CarteMesure {
  code: string;
  label: string;
  valeur: number | null;
  unite: string;
  etat: string;
  hazardBadge: string;
  pourcentageJauge?: number;
  guide: GuideMesure;
}

export interface TacheRoutine {
  id: string;
  libelle: string;
  fait: boolean;
  icone: string;
}

export interface EnvironnementMission {
  id: 'iss' | 'lune' | 'mars';
  nom: string;
  latence: string;
  statut: string;
  icone: string;
}

export interface OrganeScanner {
  id: 'cerveau' | 'coeur' | 'poumons' | 'cellules';
  nom: string;
  icone: string;
  constanteAssociee: string;
  valeurActuelle: string;
  unite: string;
  etat: 'normal' | 'attention' | 'critique';
  dangerNasa: string;
  rolePhysio: string;
  impactSpatial: string;
  recommandation: string;
  position3D: [number, number, number];
  screenX: number;
  screenY: number;
  visible: boolean;
}

@Component({
  selector: 'app-dashboard-astronaute',
  imports: [RouterLink, Urgence],
  templateUrl: './dashboard-astronaute.html',
  styleUrl: './dashboard-astronaute.scss'
})
export class DashboardAstronaute implements AfterViewInit {
  private api = inject(ApiService);
  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);
  private socket = inject(SocketService);
  private declencheur = new Subject<void>();
  idAstronaute = 1;
  mission = 'Artemis-X';
  jour = 42;

  readonly environnements: EnvironnementMission[] = [
    {
      id: 'iss',
      nom: 'ISS (Orbite Basse)',
      latence: '0.2 s',
      statut: 'Synchronisation Temps Réel avec la Terre',
      icone: '🛰️'
    },
    {
      id: 'lune',
      nom: 'Base Lunaire Artemis',
      latence: '2.6 s',
      statut: 'Relais Lunaire Actif',
      icone: '🌕'
    },
    {
      id: 'mars',
      nom: 'Transit / Base Mars',
      latence: '20 min (One-Way)',
      statut: 'Mode Autonome Embarqué Actif',
      icone: '🔴'
    }
  ];

  environnementActif = signal<EnvironnementMission>(this.environnements[0]);

  panneauDemoOuvert = signal(false);
  chargementScenario = signal(false);
  scenarioActif = signal<string>('');

  guideActif = signal<string | null>(null);

  isBrowser = signal(false);
  autoRotationActive = signal(true);

  organes = signal<OrganeScanner[]>([
    {
      id: 'cerveau',
      nom: 'Cerveau & Système Neuro-Cognitif',
      icone: '🧠',
      constanteAssociee: 'Sommeil / Humeur',
      valeurActuelle: '7.5 h',
      unite: 'heures',
      etat: 'normal',
      dangerNasa: 'Isolement & Confinement',
      rolePhysio: 'Coordination centrale, cognition, mémoire et régulation neuro-végétative circadienne.',
      impactSpatial: 'L’isolement et les 16 levers de soleil/sol dérèglent l’horloge circadienne. La redistribution liquidienne céphalique génère une hausse de pression intracrânienne (syndrome SANS).',
      recommandation: 'Maintenir 8h de repos nocturne avec masque occultant. Session de relaxation guidée avec l’Assistant Sila et luminothérapie bleue au réveil.',
      position3D: [0, 1.58, 0.08],
      screenX: 0,
      screenY: 0,
      visible: true
    },
    {
      id: 'coeur',
      nom: 'Système Cardiovasculaire & Hémodynamique',
      icone: '❤️',
      constanteAssociee: 'Fréquence Cardiaque & Pression Artérielle',
      valeurActuelle: '72 bpm',
      unite: 'bpm',
      etat: 'normal',
      dangerNasa: 'Gravité Altérée (Microgravité & G-Forces)',
      rolePhysio: 'Irrigation tissulaire systémique, oxygénation des organes vitaux et transport des nutriments.',
      impactSpatial: 'Suppression du gradient hydrostatique : déplacement céphalique des fluides (Puffy Face), baisse du volume plasmatique circulant (-15%) et atrophie myocardique sans contrainte gravitationnelle.',
      recommandation: '2h30 d’entraînement quotidien obligatoire (tapis roulant T2 avec harnais et ergocycle CEVIS). Protocole de réhydratation électrolytique avant rentrée atmosphérique.',
      position3D: [-0.10, 1.15, 0.16],
      screenX: 0,
      screenY: 0,
      visible: true
    },
    {
      id: 'poumons',
      nom: 'Système Respiratoire & Échanges Gazeux',
      icone: '🫁',
      constanteAssociee: 'Oxymétrie SpO2 & Fréquence Respiratoire',
      valeurActuelle: '98 %',
      unite: '%',
      etat: 'normal',
      dangerNasa: 'Environnement Clos & Hostile (Cabine Pressurisée)',
      rolePhysio: 'Hématose alvéolaire, absorption d’oxygène et élimination du dioxyde de carbone métabolique.',
      impactSpatial: 'L’absence de convection thermique naturelle favorise la formation de bulles stagnantes de CO2 toxiques autour de l’astronaute au repos. Risque d’hypoxie silencieuse si l’ECLSS dévie.',
      recommandation: 'Vérifier la ventilation forcée des sas. En cas de chute de SpO2 < 92 %, chausser immédiatement le masque O2 d’urgence et lancer le diagnostic environnemental Sila.',
      position3D: [0.10, 1.16, 0.15],
      screenX: 0,
      screenY: 0,
      visible: true
    },
    {
      id: 'cellules',
      nom: 'Cellules, Métabolisme & Intégrité ADN',
      icone: '☢️',
      constanteAssociee: 'Dosimétrie Rayonnement CSA & Biomarqueurs',
      valeurActuelle: '0.15 mSv/j',
      unite: 'mSv/jour',
      etat: 'normal',
      dangerNasa: 'Radiation Spatiale (Rayons Cosmiques GCR & Éruptions SPE)',
      rolePhysio: 'Préservation de l’intégrité du génome, renouvellement cellulaire et homéostasie immunitaire.',
      impactSpatial: 'Hors du bouclier géomagnétique terrestre, les ions lourds HZE et protons solaires provoquent des cassures double-brin de l’ADN, un stress oxydatif aigu et un risque oncologique accru.',
      recommandation: 'Si la dose dépasse 0.5 mSv/j, limiter les sorties EVA. Si alerte tempête solaire (> 1.5 mSv/j), rejoindre sans délai le sas central blindé (Storm Shelter) et ingérer les antioxydants.',
      position3D: [0, 0.72, 0.14],
      screenX: 0,
      screenY: 0,
      visible: true
    }
  ]);

  organeSelectionne = signal<OrganeScanner | null>(null);

  routineTaches = signal<TacheRoutine[]>([
    { id: 'cardio', libelle: 'Contrôle Cardiovasculaire (FC & TA)', fait: true, icone: '🫀' },
    { id: 'radiation', libelle: 'Dosimétrie Spatiale (Radiation CSA)', fait: true, icone: '☢️' },
    { id: 'spo2', libelle: 'Oxymétrie de Pouls (SpO2 & Fréquence)', fait: true, icone: '🫁' },
    { id: 'sommeil', libelle: 'Auto-évaluation Sommeil & Humeur', fait: false, icone: '😴' }
  ]);

  readonly progressionRoutine = computed(() => {
    const taches = this.routineTaches();
    if (taches.length === 0) {
      return 0;
    }
    const faites = taches.filter(t => t.fait).length;
    return Math.round((faites / taches.length) * 100);
  });

  nom = signal('');
  cartes = signal<CarteMesure[]>([]);
  alerteActive = signal<Alerte | null>(null);
  nombreAlertes = signal(0);
  niveauReco = signal('normal');
  recommandation = signal('');
  lienEnLigne = signal(true);
  derniereMaj = signal('');

  chatOuvert = false;
  enAttente = signal(false);
  messages = signal<{ auteur: string; texte: string; mode: string }[]>([
    { auteur: 'assistant', texte: 'Hello! I am the Sila assistant. Ask me about your vital signs or your alerts.', mode: '' }
  ]);

  private parametres: Parametre[] = [];
  private graphFc?: Chart;
  private graphSpo2?: Chart;

  private modeleCartes: {
    code: string;
    label: string;
    hazardBadge: string;
    guide: GuideMesure;
  }[] = [
    {
      code: 'FC',
      label: 'Heart rate',
      hazardBadge: '🪐 Danger NASA : Gravité Altérée (Cardio)',
      guide: {
        protocole: 'Position neutre au repos en microgravité. Évitez caféine et effort 15 min avant. Ajustez le capteur au poignet gauche et restez immobile 60s.',
        plageNormale: '60 – 100 bpm au repos (tendance à tachycardie modérée au réveil en impesanteur).',
        pourquoi: 'Gravité altérée : la migration des fluides vers le haut du corps (puffy face) modifie le débit cardiaque et cause un déconditionnement myocardique sans exercice régulier.'
      }
    },
    {
      code: 'SPO2',
      label: 'Blood oxygen (SpO2)',
      hazardBadge: '舱 Danger NASA : Environnement Clos & Hostile',
      guide: {
        protocole: 'Placez l’index propre et sec au centre de l’oxymètre optique à impulsions. Maintenez une respiration calme et continue pendant 30 secondes.',
        plageNormale: '95 % – 100 % (Seuil d’alerte critique d’hypoxie : < 90 %).',
        pourquoi: 'Environnement clos & hostile : identifie précocement les accumulations locales de CO2 ou une défaillance du système de recyclage d’air ECLSS.'
      }
    },
    {
      code: 'TEMP',
      label: 'Body temperature',
      hazardBadge: '舱 Danger NASA : Environnement Clos & Hostile',
      guide: {
        protocole: 'Utilisez le thermomètre infrarouge tympanique (conduit auditif) ou appliquez le patch temporal pendant 5 secondes au repos.',
        plageNormale: '36.1 °C – 37.2 °C (la température corporelle moyenne en orbite s’élève d’environ +1 °C : Space Fever).',
        pourquoi: 'Environnement clos : l’absence de convection thermique naturelle en apesanteur complique l’évacuation de chaleur corporelle et masque de potentielles infections.'
      }
    },
    {
      code: 'SOMMEIL',
      label: 'Sleep last night',
      hazardBadge: '🧠 Danger NASA : Isolement & Confinement',
      guide: {
        protocole: 'Relevez les heures enregistrées par l’actimètre de couchette ou déclarez vos heures réelles de sommeil réparateur au réveil.',
        plageNormale: '6.5 h – 8.5 h par période de repos de 24h.',
        pourquoi: 'Isolement & confinement : 16 levers de soleil par sol perturbent le rythme circadien, provoquant fatigue chronique et baisse de vigilance critique.'
      }
    },
    {
      code: 'RADIATION',
      label: 'Radiation daily dose',
      hazardBadge: '☢️ Danger NASA : Radiation Spatiale (CSA)',
      guide: {
        protocole: 'Lecture télémétrique automatique via le dosimètre actif personnel CSA attaché à la combinaison ou à la tenue de bord.',
        plageNormale: '< 0.5 mSv/jour (Attention : 0.5–1.5 mSv/j, Événement de particules solaires SPE : > 1.5 mSv/j).',
        pourquoi: 'Radiation spatiale : hors de la magnétosphère terrestre, les rayons cosmiques (GCR) et tempêtes solaires menacent les tissus biologiques et l’ADN.'
      }
    }
  ];

  @ViewChild('graphiqueFc') graphiqueFc!: ElementRef<HTMLCanvasElement>;
  @ViewChild('graphiqueSpo2') graphiqueSpo2!: ElementRef<HTMLCanvasElement>;
  @ViewChild(Urgence) composantUrgence?: Urgence;
  @ViewChild('scannerContainer') scannerContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('canvas3d') canvas3d?: ElementRef<HTMLCanvasElement>;

  private scene?: any;
  private camera?: any;
  private renderer?: any;
  private animFrameId?: number;
  private bodyGroup?: any;
  private scanRing?: any;
  private organMeshes: { [key: string]: any } = {};

  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  private targetRotationY = 0;
  private currentRotationY = 0;

  constructor() {
    this.isBrowser.set(isPlatformBrowser(this.platformId));
    this.organeSelectionne.set(this.organes()[1]);
    this.destroyRef.onDestroy(() => {
      this.nettoyerScanner3D();
    });
  }

  @HostListener('window:keydown', ['$event'])
  surToucheClavier(event: KeyboardEvent) {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const estAltU = event.altKey && (event.key === 'u' || event.key === 'U');
    const estShiftE = event.shiftKey && (event.key === 'e' || event.key === 'E') && !event.ctrlKey && !event.altKey;

    if (estAltU || estShiftE) {
      const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        return;
      }
      event.preventDefault();
      this.simulerUrgenceVocale();
    }
  }

  simulerUrgenceVocale(phrase = 'Emergency, I feel dizzy') {
    if (this.composantUrgence) {
      this.composantUrgence.simulerDeclenchementVocal(phrase);
    }
  }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    this.initialiserEnvironnement();
    this.initialiserRoutine();
    this.graphFc = this.creerGraphique(this.graphiqueFc, 'Heart rate (bpm)', 40, 120);
    this.graphSpo2 = this.creerGraphique(this.graphiqueSpo2, 'SpO2 (%)', 85, 100);
    this.demarrerChargement();

    if (this.isBrowser()) {
      setTimeout(() => {
        this.initialiserScanner3D();
      }, 80);
    }
  }

  toggleGuide(code: string) {
    this.guideActif.update(actuel => (actuel === code ? null : code));
  }

  initialiserRoutine() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const sauveg = localStorage.getItem('sila_routine_taches') || localStorage.getItem('sahthealth_routine_taches');
        if (sauveg) {
          const etats: { id: string; fait: boolean }[] = JSON.parse(sauveg);
          this.routineTaches.update(taches =>
            taches.map(t => {
              const trouve = etats.find(e => e.id === t.id);
              return trouve ? { ...t, fait: trouve.fait } : t;
            })
          );
        }
      } catch (e) {
        console.warn('Storage inaccessible:', e);
      }
    }
  }

  basculerTacheRoutine(id: string) {
    this.routineTaches.update(taches =>
      taches.map(t => (t.id === id ? { ...t, fait: !t.fait } : t))
    );
    if (isPlatformBrowser(this.platformId)) {
      try {
        const etats = this.routineTaches().map(t => ({ id: t.id, fait: t.fait }));
        localStorage.setItem('sila_routine_taches', JSON.stringify(etats));
      } catch (e) {
        console.warn('Storage inaccessible:', e);
      }
    }
  }

  initialiserEnvironnement() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const saved = localStorage.getItem('sila_mission_env') || localStorage.getItem('sahthealth_mission_env');
        if (saved) {
          const trouve = this.environnements.find(e => e.id === saved);
          if (trouve) {
            this.environnementActif.set(trouve);
          }
        }
      } catch (e) {
        console.warn('Storage inaccessible:', e);
      }
    }
  }

  changerEnvironnement(id: string) {
    const cible = this.environnements.find(e => e.id === id);
    if (cible) {
      this.environnementActif.set(cible);
      if (isPlatformBrowser(this.platformId)) {
        try {
          localStorage.setItem('sila_mission_env', cible.id);
        } catch (e) {
          console.warn('Storage inaccessible:', e);
        }
      }
    }
  }

  basculerPanneauDemo() {
    this.panneauDemoOuvert.update(ouvert => !ouvert);
  }

  declencherScenario(nom: 'nominal' | 'hypoxia' | 'solar_storm') {
    if (this.chargementScenario()) {
      return;
    }
    this.chargementScenario.set(true);
    this.scenarioActif.set(nom);

    this.api.lancerScenario(nom, this.idAstronaute).subscribe({
      next: () => {
        this.declencheur.next();
        setTimeout(() => {
          this.chargementScenario.set(false);
        }, 600);
      },
      error: (err) => {
        console.error('Erreur lancement scenario:', err);
        this.chargementScenario.set(false);
      }
    });
  }

    demarrerChargement() {
    this.socket.evenements$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(evenement => {
      if (evenement.id_astronaute === this.idAstronaute) {
        this.declencheur.next();
      }
    });

    this.api.getParametres().pipe(
      switchMap(liste => {
        this.parametres = liste;
        return merge(timer(0, 5000), this.declencheur);
      }),
      switchMap(() =>
        forkJoin({
          astronautes: this.api.getAstronautes(),
          dernieres: this.api.getDernieresMesures(this.idAstronaute),
          alertes: this.api.getAlertes('active'),
          serieFc: this.api.getSerie(this.idAstronaute, 'FC'),
          serieSpo2: this.api.getSerie(this.idAstronaute, 'SPO2')
        }).pipe(catchError(() => of(null)))
      ),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (donnees) => {
        if (donnees === null) {
          this.lienEnLigne.set(false);
          return;
        }
        this.lienEnLigne.set(true);
        this.afficher(donnees);
      },
      error: () => this.lienEnLigne.set(false)
    });
  }

  afficher(d: {
    astronautes: Astronaute[];
    dernieres: MesureRecente[];
    alertes: Alerte[];
    serieFc: MesureRecente[];
    serieSpo2: MesureRecente[];
  }) {
    const moi = d.astronautes.find(a => a.id_astronaute === this.idAstronaute);
    if (moi) {
      this.nom.set(moi.nom_code);
    }

    const cartes: CarteMesure[] = this.modeleCartes.map(m => {
      const mesure = d.dernieres.find(x => x.code === m.code);
      const valeur = mesure ? mesure.valeur : null;
      const p = this.parametres.find(x => x.code === m.code);
      const etat = this.calculerEtat(m.code, valeur);
      const pourcentageJauge = (m.code === 'RADIATION' && valeur !== null)
        ? Math.min(100, Math.max(0, Math.round((valeur / 2.0) * 100)))
        : undefined;

      return {
        code: m.code,
        label: m.label,
        valeur: valeur,
        unite: p ? p.unite : (m.code === 'RADIATION' ? 'mSv/jour' : ''),
        etat: etat,
        hazardBadge: m.hazardBadge,
        pourcentageJauge: pourcentageJauge,
        guide: m.guide
      };
    });
    this.cartes.set(cartes);
    this.actualiserOrganes();

    const mesAlertes = d.alertes.filter(a => a.id_astronaute === this.idAstronaute);
    const alerte = mesAlertes.length > 0 ? mesAlertes[0] : null;
    this.nombreAlertes.set(mesAlertes.length);
    this.alerteActive.set(alerte);

    const aCritique = cartes.some(c => c.etat === 'critique');
    const horsPlage = cartes.some(c => c.etat === 'attention');
    if (alerte && alerte.niveau === 'critique') {
      this.niveauReco.set('critique');
      this.recommandation.set('Contact the ground doctor immediately.');
    } else if (aCritique) {
      this.niveauReco.set('critique');
      this.recommandation.set('Critical threshold exceeded. Contact the ground doctor immediately.');
    } else if (alerte) {
      this.niveauReco.set('attention');
      this.recommandation.set('Re-measure in 10 minutes. If the value stays out of range, contact the ground doctor.');
    } else if (horsPlage) {
      this.niveauReco.set('attention');
      this.recommandation.set('Some values are outside the normal range. Rest and re-measure in 10 minutes.');
    } else {
      this.niveauReco.set('normal');
      this.recommandation.set('All vital signs are within normal range. Keep up your exercise routine and hydration.');
    }

    this.majGraphique(this.graphFc, d.serieFc, 'FC');
    this.majGraphique(this.graphSpo2, d.serieSpo2, 'SPO2');
    this.derniereMaj.set(new Date().toLocaleTimeString('en-GB'));
  }

  calculerEtat(code: string, valeur: number | null): string {
    if (valeur === null) {
      return 'aucune';
    }
    if (code === 'RADIATION') {
      if (valeur > 1.5) {
        return 'critique';
      }
      if (valeur >= 0.5) {
        return 'attention';
      }
      return 'normal';
    }
    const p = this.parametres.find(x => x.code === code);
    if (!p) {
      return 'normal';
    }
    if (valeur < p.plage_normale_min || valeur > p.plage_normale_max) {
      return 'attention';
    }
    return 'normal';
  }

  creerGraphique(canvas: ElementRef<HTMLCanvasElement>, titre: string, min: number, max: number): Chart {
    return new Chart(canvas.nativeElement, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: titre, data: [], borderColor: '#3B82F6', tension: 0.3, pointRadius: 3 },
          { label: 'Normal min', data: [], borderColor: '#22C55E', borderDash: [6, 6], pointRadius: 0 },
          { label: 'Normal max', data: [], borderColor: '#22C55E', borderDash: [6, 6], pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#94A3B8' }, grid: { color: '#22304A' } },
          y: { min: min, max: max, ticks: { color: '#94A3B8' }, grid: { color: '#22304A' } }
        },
        plugins: {
          legend: { labels: { color: '#94A3B8' } }
        }
      }
    });
  }

  majGraphique(graphique: Chart | undefined, serie: MesureRecente[], code: string) {
    if (!graphique) {
      return;
    }
    const points = serie.slice(-30);
    const labels = points.map(m => this.formaterDate(m.horodatage));
    const p = this.parametres.find(x => x.code === code);

    graphique.data.labels = labels;
    graphique.data.datasets[0].data = points.map(m => m.valeur);
    if (p) {
      graphique.data.datasets[1].data = labels.map(() => p.plage_normale_min);
      graphique.data.datasets[2].data = labels.map(() => p.plage_normale_max);
    }
    graphique.update();
  }

  formaterDate(horodatage: string): string {
    return new Date(horodatage).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  ouvrirFermerChat() {
    this.chatOuvert = !this.chatOuvert;
  }

    envoyer(champ: HTMLInputElement) {
    const question = champ.value.trim();
    if (question === '' || this.enAttente()) {
      return;
    }

    this.ajouterMessage('utilisateur', question, '');
    champ.value = '';
    this.enAttente.set(true);

    this.api.envoyerQuestion(this.idAstronaute, question).subscribe({
      next: (rep) => {
        this.ajouterMessage('assistant', rep.reponse, rep.mode);
        this.enAttente.set(false);
      },
      error: () => {
        this.ajouterMessage(
          'assistant',
          'The assistant is not reachable right now. Your latest values are shown on the dashboard. '
            + 'If an alert is active, rest, re-measure in 10 minutes and contact the ground doctor if it does not improve.',
          'secours'
        );
        this.enAttente.set(false);
      }
    });
  }

  ajouterMessage(auteur: string, texte: string, mode: string) {
    this.messages.update(liste => [...liste, { auteur: auteur, texte: texte, mode: mode }]);
  }

  selectionnerOrgane(org: OrganeScanner) {
    this.organeSelectionne.set(org);
    this.targetRotationY = 0;
  }

  fermerFicheOrgane() {
    this.organeSelectionne.set(null);
  }

  definirVue(angle: number) {
    this.autoRotationActive.set(false);
    this.targetRotationY = angle;
  }

  basculerAutoRotation() {
    this.autoRotationActive.update(v => !v);
  }

  actualiserOrganes() {
    const cartes = this.cartes();
    const cSommeil = cartes.find(c => c.code === 'SOMMEIL');
    const cFc = cartes.find(c => c.code === 'FC');
    const cSpo2 = cartes.find(c => c.code === 'SPO2');
    const cRad = cartes.find(c => c.code === 'RADIATION');

    this.organes.update(liste =>
      liste.map(org => {
        let etat: 'normal' | 'attention' | 'critique' = 'normal';
        let val = org.valeurActuelle;

        if (org.id === 'cerveau') {
          if (cSommeil) {
            etat = (cSommeil.etat === 'critique' ? 'critique' : (cSommeil.etat === 'attention' ? 'attention' : 'normal'));
            val = cSommeil.valeur !== null ? `${cSommeil.valeur} h` : '—';
          }
        } else if (org.id === 'coeur') {
          if (cFc) {
            etat = (cFc.etat === 'critique' ? 'critique' : (cFc.etat === 'attention' ? 'attention' : 'normal'));
            val = cFc.valeur !== null ? `${cFc.valeur} bpm` : '—';
          }
        } else if (org.id === 'poumons') {
          if (cSpo2) {
            etat = (cSpo2.etat === 'critique' ? 'critique' : (cSpo2.etat === 'attention' ? 'attention' : 'normal'));
            val = cSpo2.valeur !== null ? `${cSpo2.valeur} %` : '—';
          }
        } else if (org.id === 'cellules') {
          if (cRad) {
            etat = (cRad.etat === 'critique' ? 'critique' : (cRad.etat === 'attention' ? 'attention' : 'normal'));
            val = cRad.valeur !== null ? `${cRad.valeur} mSv/j` : '—';
          }
        }

        return {
          ...org,
          valeurActuelle: val,
          etat: etat
        };
      })
    );

    const actif = this.organeSelectionne();
    if (actif) {
      const maj = this.organes().find(o => o.id === actif.id);
      if (maj) {
        this.organeSelectionne.set(maj);
      }
    }

    this.mettreAJourCouleursHotspots3D();
  }

  mettreAJourCouleursHotspots3D() {
    const hexCouleurs = {
      normal: 0x22c55e,
      attention: 0xf59e0b,
      critique: 0xef4444
    };

    for (const org of this.organes()) {
      const mesh = this.organMeshes[org.id];
      if (mesh && mesh.material) {
        const col = hexCouleurs[org.etat] || 0x22c55e;
        mesh.material.color.setHex(col);
      }
    }
  }

  async initialiserScanner3D() {
    if (!this.isBrowser() || !this.canvas3d || !this.scannerContainer) {
      return;
    }
    const THREE = await import('three');
    const container = this.scannerContainer.nativeElement;
    const canvas = this.canvas3d.nativeElement;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 420;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    this.camera.position.set(0, 0.9, 3.8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambientLight = new THREE.AmbientLight(0x06b6d4, 1.2);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x38bdf8, 2.0);
    dirLight1.position.set(2, 4, 3);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x3b82f6, 1.5);
    dirLight2.position.set(-2, -1, -2);
    this.scene.add(dirLight2);

    this.bodyGroup = new THREE.Group();
    this.scene.add(this.bodyGroup);

    const gridHelper = new THREE.GridHelper(3.2, 12, 0x06b6d4, 0x1e293b);
    gridHelper.position.y = -0.75;
    this.scene.add(gridHelper);

    const ringGeo1 = new THREE.RingGeometry(0.8, 0.85, 48);
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x06b6d4, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = -0.74;
    this.scene.add(ring1);

    const scanRingGeo = new THREE.RingGeometry(0.7, 0.76, 48);
    const scanRingMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
    this.scanRing = new THREE.Mesh(scanRingGeo, scanRingMat);
    this.scanRing.rotation.x = Math.PI / 2;
    this.scene.add(this.scanRing);

    this.construireAstronaute3D(THREE);
    this.creerHotspots3D(THREE);
    this.attacherControles3D(canvas);

    const tempV = new THREE.Vector3();
    const animer = (temps: number) => {
      this.animFrameId = requestAnimationFrame(animer);

      if (this.autoRotationActive() && !this.isDragging) {
        this.currentRotationY += 0.008;
      } else {
        this.currentRotationY += (this.targetRotationY - this.currentRotationY) * 0.1;
      }
      if (this.bodyGroup) {
        this.bodyGroup.rotation.y = this.currentRotationY;
      }

      if (this.scanRing) {
        const scanY = 0.5 + 1.2 * Math.sin(temps * 0.0018);
        this.scanRing.position.y = scanY;
      }

      const pulse = 1 + 0.18 * Math.sin(temps * 0.006);
      for (const key in this.organMeshes) {
        const mesh = this.organMeshes[key];
        if (mesh) {
          mesh.scale.set(pulse, pulse, pulse);
        }
      }

      if (container && this.camera) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        for (const org of this.organes()) {
          const mesh = this.organMeshes[org.id];
          if (!mesh) continue;
          mesh.getWorldPosition(tempV);
          tempV.project(this.camera);
          const x = Math.round(((tempV.x + 1) * w) / 2);
          const y = Math.round(((-tempV.y + 1) * h) / 2);
          const el = document.getElementById('hotspot-' + org.id);
          if (el) {
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.style.display = tempV.z < 1 ? 'flex' : 'none';
          }
        }
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    this.animFrameId = requestAnimationFrame(animer);

    const redimensionner = () => {
      if (!container || !this.renderer || !this.camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', redimensionner);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('resize', redimensionner);
    });
  }

  private construireAstronaute3D(THREE: any) {
    const suitWireMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.7
    });

    const suitSolidMat = new THREE.MeshStandardMaterial({
      color: 0x091e3a,
      transparent: true,
      opacity: 0.82,
      roughness: 0.35,
      metalness: 0.7
    });

    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.92
    });

    const addSegment = (geo: any, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const meshSolid = new THREE.Mesh(geo, suitSolidMat);
      meshSolid.position.set(x, y, z);
      meshSolid.rotation.set(rx, ry, rz);
      this.bodyGroup.add(meshSolid);

      const meshWire = new THREE.Mesh(geo, suitWireMat);
      meshWire.position.set(x, y, z);
      meshWire.rotation.set(rx, ry, rz);
      meshWire.scale.set(1.02, 1.02, 1.02);
      this.bodyGroup.add(meshWire);
      return meshSolid;
    };

    // 1. Helmet & Visor
    const helmetGeo = new THREE.SphereGeometry(0.24, 20, 20);
    addSegment(helmetGeo, 0, 1.58, 0);

    const visorGeo = new THREE.SphereGeometry(0.21, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.45);
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.rotation.x = Math.PI * 0.4;
    visorMesh.position.set(0, 1.59, 0.08);
    this.bodyGroup.add(visorMesh);

    // 2. Torso
    const torsoGeo = new THREE.CylinderGeometry(0.27, 0.22, 0.65, 16);
    addSegment(torsoGeo, 0, 1.12, 0);

    // 3. Backpack PLSS
    const backpackGeo = new THREE.BoxGeometry(0.40, 0.55, 0.18);
    addSegment(backpackGeo, 0, 1.18, -0.22);

    // 4. Pelvis
    const pelvisGeo = new THREE.CylinderGeometry(0.22, 0.19, 0.22, 16);
    addSegment(pelvisGeo, 0, 0.72, 0);

    // 5. Shoulders
    const shoulderGeo = new THREE.SphereGeometry(0.09, 12, 12);
    addSegment(shoulderGeo, -0.34, 1.34, 0);
    addSegment(shoulderGeo, 0.34, 1.34, 0);

    // 6. Arms
    const armGeo = new THREE.CylinderGeometry(0.075, 0.07, 0.32, 12);
    addSegment(armGeo, -0.40, 1.05, 0, 0, 0, 0.15);
    addSegment(armGeo, 0.40, 1.05, 0, 0, 0, -0.15);

    const forearmGeo = new THREE.CylinderGeometry(0.068, 0.06, 0.30, 12);
    addSegment(forearmGeo, -0.43, 0.75, 0.04, 0.15, 0, 0.18);
    addSegment(forearmGeo, 0.43, 0.75, 0.04, 0.15, 0, -0.18);

    // 7. Thighs
    const thighGeo = new THREE.CylinderGeometry(0.105, 0.085, 0.42, 14);
    addSegment(thighGeo, -0.15, 0.38, 0);
    addSegment(thighGeo, 0.15, 0.38, 0);

    // 8. Knees
    const kneeGeo = new THREE.SphereGeometry(0.085, 12, 12);
    addSegment(kneeGeo, -0.15, 0.12, 0.02);
    addSegment(kneeGeo, 0.15, 0.12, 0.02);

    // 9. Shins
    const shinGeo = new THREE.CylinderGeometry(0.085, 0.075, 0.40, 14);
    addSegment(shinGeo, -0.15, -0.18, 0);
    addSegment(shinGeo, 0.15, -0.18, 0);

    // 10. Boots
    const bootGeo = new THREE.BoxGeometry(0.15, 0.14, 0.25);
    addSegment(bootGeo, -0.15, -0.45, 0.05);
    addSegment(bootGeo, 0.15, -0.45, 0.05);
  }

  private creerHotspots3D(THREE: any) {
    const hexCouleurs = {
      normal: 0x22c55e,
      attention: 0xf59e0b,
      critique: 0xef4444
    };

    for (const org of this.organes()) {
      const sphereGeo = new THREE.SphereGeometry(0.065, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: hexCouleurs[org.etat] || 0x22c55e,
        wireframe: false
      });
      const mesh = new THREE.Mesh(sphereGeo, sphereMat);
      mesh.position.set(org.position3D[0], org.position3D[1], org.position3D[2]);

      const haloGeo = new THREE.RingGeometry(0.08, 0.11, 24);
      const haloMat = new THREE.MeshBasicMaterial({
        color: hexCouleurs[org.etat] || 0x22c55e,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      haloMesh.rotation.x = Math.PI / 4;
      mesh.add(haloMesh);

      this.bodyGroup.add(mesh);
      this.organMeshes[org.id] = mesh;
    }
  }

  private attacherControles3D(canvas: HTMLCanvasElement) {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      this.isDragging = true;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      this.previousMousePosition = { x: clientX, y: clientY };
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!this.isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
      const deltaX = clientX - this.previousMousePosition.x;
      this.targetRotationY += deltaX * 0.012;
      this.previousMousePosition = { x: clientX, y: clientY };
    };

    const onPointerUp = () => {
      this.isDragging = false;
    };

    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    canvas.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    this.destroyRef.onDestroy(() => {
      canvas.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      canvas.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    });
  }

  private nettoyerScanner3D() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
    this.scene = undefined;
    this.camera = undefined;
    this.renderer = undefined;
    this.bodyGroup = undefined;
  }
}