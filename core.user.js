// ==UserScript==
// @name         Tomo'Horsys - Core
// @namespace    So'Horsys
// @version      0.4
// @description  Constantes et fonctions communes
// @author       Tomo
// @match        https://ankama.sohorsys.fr/*
// @icon         https://ankama.sohorsys.fr/SOHORSYSH12692P1_WEB//Images/Main/so_HORSYS_DIGITAL_ico.svg
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/core.user.js
// @downloadURL  https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/core.user.js
// ==/UserScript==

(() => {
'use strict';

// Empêche le double chargement du Core
if (window.TOMO_CORE) return;

// =======================================================
// CONSTANTES DE CONFIGURATION
// =======================================================

const CONFIG = Object.freeze({
    target: 450,       // Objectif quotidien de travail, en minutes. 450 min = 7h30.
    minPause: 60,      // Temps de pause minimum, en min.
    refreshRate: 1000, // Intervalle d'actualisation, en ms.
});

const COLORS = Object.freeze({
    red: '#E74C3C',    // Déficit / alerte
    yellow: '#F39C12', // Estimation / en cours
    green: '#27AE60',  // Crédit / objectif atteint
    dblue: '#2F4F6B',  // Bleu foncé UI
    cblue: '#8896B3',  // Bleu clair UI
    text: '#1A2744',   // Texte principal
    border: '#DDE3EF', // Bordures
    bg: '#FFF',        // Fond principal
    shadow: '0 4px 18px rgba(15,43,110,0.13)',
});

// =======================================================
// FONCTIONS DE TEMPS
// =======================================================
// Convertit une heure "HH:MM" en minutes depuis minuit.
// Exemple : "08:30" → 510
function timeToMinutes(t) {
    const [h, m] = String(t).split(':').map(Number);
    return h * 60 + m;
}

// Convertit des minutes en format lisible "HHhMM".
// Gère les valeurs positives et négatives (crédit/déficit).
// Exemples : 450 --> "07h30", -30 --> "-00h30"
function minutesToTime(min) {
    const sign = min < 0 ? '-' : '';
    min = Math.abs(min);
    return `${sign}${String(Math.floor(min / 60)).padStart(2, '0')}h${String(min % 60).padStart(2, '0')}`;
}

// Retourne l’heure actuelle en minutes depuis minuit.
// Utilisé pour calculer le temps travaillé en cours et l'estimation de fin de journée.
function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

// =======================================================
// IFRAMES
// =======================================================
// Récupère le document de l’iframe HBOARD
function getHbDoc() {
    const iframe = document.querySelector('iframe#IFRAME_HBOARD');
    return iframe?.contentDocument || iframe?.contentWindow?.document || null;
}

// Récupère le document de l’iframe "MES_MOUVEMENTS"
function getMouvDoc() {
    const iframe = document.querySelector('iframe[id*=IFRAME_MES_MOUVEMENTS]');
    return iframe?.contentDocument || iframe?.contentWindow?.document || null;
}

// =======================================================
// POINTAGES
// =======================================================
// Extrait les heures de pointage d’un jour et retourne un tableau trié des minutes.
// Exemple : ["08:00", "12:00", "13:00", "17:00"] --> [480, 720, 780, 1020]
// Chaque paire représente une entrée/sortie.
function getPointages(day) {
    const line = day?.querySelector?.('.gdPointageCorrigeMicro');
    if (!line) return [];

    const spans = line.querySelectorAll(
        '.gdPointageMarker.gdPointageMarkerCorrige.gdPointageMarkerInfosCorrigeLeft span'
    );

    const raw = [];

    spans.forEach(s => {
        // On filtre uniquement les horaires valides HH:MM
        const match = (s.textContent || '').trim().match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
        if (match) raw.push(timeToMinutes(match[0]));
    });

    // Nettoyage des doublons
    const cleaned = [];
    for (let i = 0; i < raw.length; i++) {
        if (raw[i] !== raw[i - 1]) cleaned.push(raw[i]);
    }

    return cleaned.sort((a, b) => a - b);
}

// =======================================================
// CALCULS DES TEMPS
// =======================================================
// Calcule le temps total travaillé sur une journée.
// On additionne les blocs entrée/sortie, puis on ajoute le temps courant si la journée est encore en cours.
// Exemple : Entrées --> 08:00 / 12:00 / 13:00 / 17:00. Calcul --> (12:00-08:00) + (17:00-13:00).
// Applique la pause minimale obligatoire si la pause réelle est < CONFIG.minPause. Le travail n'est pas compté pendant la pause.
function computeWorked(pointages) {
    let worked = 0;

    // 0 pointage
    if (!pointages || pointages.length === 0) {
        return { worked: 0, openWork: false, onBreak: false };
    }

    // 1 pointage : entrée du matin, journée en cours
    // On accumule le temps depuis l'entrée jusqu'à maintenant
    if (pointages.length === 1) {
        return {
            worked: nowMinutes() - pointages[0],
            openWork: true,
            onBreak: false,
        };
    }

    // 2+ pointages
    // Travail du matin = sortie - entrée
    worked += pointages[1] - pointages[0];

    // Journée encore ouverte = nombre impair de pointages
    const openWork = (pointages.length % 2 === 1);

    // Cas particulier : exactement 2 pointages = pause en cours
    const onBreak = (pointages.length === 2);

    // =======================================================
    // GESTION PAUSE + APRÈS-MIDI
    // =======================================================
    if (pointages.length >= 3) {
        const pauseStart  = pointages[1];
        const pauseEnd    = pointages[2];
        const realPause   = pauseEnd - pauseStart;

        // Heure de reprise effective (pause minimum de CONFIG.minPause)
        const effectiveResume = realPause < CONFIG.minPause
            ? pauseStart + CONFIG.minPause
            : pauseEnd;

        // Travail de l'après-midi si la journée est terminée
        if (pointages.length >= 4) {
            worked += pointages[3] - effectiveResume;
        }

        // Journée en cours après la reprise
        if (openWork) {
            worked += nowMinutes() - effectiveResume;
        }
    }

    return { worked, openWork, onBreak };
}

// Calcule la pause réelle
// - 1 pointage : on estime avec la pause avec la durée minimale.
// - 2 pointages : pause en cours, clampée au minimum si <60min depuis le dernier pointage.
// - 3+ pointages : pause réelle entre le 2e et le 3e pointage, aussi clampée au minimum.
function computePause(pointages) {
    // matin uniquement
    if (pointages.length === 1) return CONFIG.minPause;

    // pause en cours
    if (pointages.length === 2) {
        const pause = nowMinutes() - pointages[1];
        return Math.max(CONFIG.minPause, pause);
    }

    // pause terminée
    if (pointages.length >= 3) {
        const pause = pointages[2] - pointages[1];
        return Math.max(CONFIG.minPause, pause);
    }

    return CONFIG.minPause;
}

// Estime l’heure de fin de journée.
// On prend le 1er pointage, on ajoute l’objectif, puis la pause retournée par computePause().
// Pas de calcul si l’objectif est déjà atteint.
function estimateFinish(pointages, target = CONFIG.target) {
    if (!pointages || !pointages.length) return null;

    const { worked } = computeWorked(pointages);
    const remaining = target - worked;

    // Journée déjà terminée
    if (remaining <= 0) return null;

    const pause = computePause(pointages);
    const firstIn = pointages[0];

    return firstIn + target + pause;
}

// =======================================================
// ÉTATS DE LA JOURNÉE
// =======================================================
// Centralise différents états de la journée pour l'affichage des modules :
// - worked : temps déjà travaillé
// - remaining : reste à faire
// - credit : dépassement éventuel
// - finish : fin estimée si la journée n’est pas terminée
// - pct : progression du jour
// - label / value : libellés prêts pour l’UI
function getTimeState(pointages, target = CONFIG.target) {
    if (!pointages || !pointages.length) return null;

    const { worked, openWork, onBreak } = computeWorked(pointages);
    const remaining = target - worked;
    const credit = worked - target;
    const isOvertime = remaining <= 0;
    const pct = Math.min(100, Math.round((worked / target) * 100));
    const finish = remaining > 0 ? estimateFinish(pointages, target) : null;

    return {
        worked,
        remaining,
        credit,
        openWork,
        onBreak,
        isOvertime,
        pct,
        finish,
        remainingClass: isOvertime ? 'done' : (remaining < 30 ? 'warning' : ''),
        barColor: pct >= 100 ? COLORS.green : (pct >= 60 ? COLORS.yellow : COLORS.red),
        label: isOvertime ? 'Crédit' : 'Reste',
        value: isOvertime ? `+${minutesToTime(credit)}` : minutesToTime(remaining),
    };
}


// =======================================================
// CACHE LOCAL
// =======================================================
// Cache utilisable par les modules.
// Les données sont stockées sous forme JSON avec le préfixe "tomo_cache_".
// Usage :
//   core.cache.set('compteurs', data);           // sauvegarde
//   const d = core.cache.get('compteurs');       // lecture (null si absent/expiré)
//   core.cache.clear('compteurs');               // suppression
// options.ttl : durée de vie en ms (défaut : aucune expiration)
const CACHE_PREFIX = 'tomo_cache_';

const cache = {
    // Sauvegarde une valeur dans le cache
    set(key, value, options = {}) {
        try {
            const entry = {
                value,
                ts: Date.now(),
                ttl: options.ttl ?? null,
            };
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
        } catch (e) {
            console.warn('[TOMO_CORE] cache.set error:', e);
        }
    },

    // Lit une valeur du cache. Retourne null si absente ou expirée.
    get(key) {
        try {
            const raw = localStorage.getItem(CACHE_PREFIX + key);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (entry.ttl && Date.now() - entry.ts > entry.ttl) {
                localStorage.removeItem(CACHE_PREFIX + key);
                return null;
            }
            return entry.value;
        } catch {
            return null;
        }
    },

    // Supprime une entrée du cache
    clear(key) {
        localStorage.removeItem(CACHE_PREFIX + key);
    },

    // Retourne "l'âge" en ms de l'entrée (null si absente)
    age(key) {
        try {
            const raw = localStorage.getItem(CACHE_PREFIX + key);
            if (!raw) return null;
            return Date.now() - JSON.parse(raw).ts;
        } catch {
            return null;
        }
    },
};

// =======================================================
// PRÉFÉRENCES
// =======================================================
// Préférences utilisables par les modules.
// Chaque module passe sa clé et ses valeurs par défaut.
// Usage :
//   const prefs = core.prefs.load('monModule', { show: true });
//   core.prefs.save('monModule', prefs);
const PREFS_PREFIX = 'tomo_prefs_';

const prefs = {
    // Charge les préférences d'un module, fusionnées avec les défauts
    load(moduleKey, defaults = {}) {
        try {
            const raw = localStorage.getItem(PREFS_PREFIX + moduleKey);
            return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
        } catch {
            return { ...defaults };
        }
    },

    // Sauvegarde les préférences d'un module
    save(moduleKey, data) {
        try {
            localStorage.setItem(PREFS_PREFIX + moduleKey, JSON.stringify(data));
        } catch (e) {
            console.warn('[TOMO_CORE] prefs.save error:', e);
        }
    },

    // Supprime les préférences d'un module
    clear(moduleKey) {
        localStorage.removeItem(PREFS_PREFIX + moduleKey);
    },
};

// =======================================================
// COMPTEURS
// =======================================================
// Parse une valeur de compteur SoHorsys en minutes.
// Gère deux formats :
//   - Heures décimales : "+8,50" ou "-2,00" (jours/heures en décimal)
//   - Heures:minutes   : "+7:36" ou "-1:20"
// Retourne des minutes (entier), ou null si non parseable.
function parseCounterValue(raw) {
    if (!raw) return null;
    const str = String(raw).trim().replace(',', '.');

    // Format HH:MM (récupérations, DC)
    const matchTime = str.match(/^([+-]?)(\d+):(\d{2})$/);
    if (matchTime) {
        const sign = matchTime[1] === '-' ? -1 : 1;
        return sign * (parseInt(matchTime[2], 10) * 60 + parseInt(matchTime[3], 10));
    }

    // Format décimal (congés)
    const matchDec = str.match(/^([+-]?)(\d+(?:\.\d+)?)$/);
    if (matchDec) {
        const sign = matchDec[1] === '-' ? -1 : 1;
        return sign * parseFloat(matchDec[2]);
    }

    return null;
}

// Lit le contenu actuel de .T101Detail et retourne { label: valeurBrute }
function readDetail(hbDoc) {
    const detail = hbDoc.querySelector('.T101Detail');
    if (!detail) return {};
    const result = {};
    detail.querySelectorAll('.UnCpt').forEach(cpt => {
        const label  = cpt.querySelector('label')?.textContent?.trim();
        const valeur = cpt.querySelector('.Valeur')?.textContent?.trim();
        if (label && valeur !== undefined) result[label] = valeur;
    });
    return result;
}

// Charge un compteur So'Horsys et retourne une Promise résolue avec { label: valeurBrute }.
// Stratégie :
//   1. Change select.value et dispatch 'change'
//   2. Observe .T101Detail avec MutationObserver
//   3. Résout dès que le contenu change (timeout 3s en sécurité)
function loadCounter(hbDoc, key) {
    return new Promise(resolve => {
        const select = hbDoc.querySelector('#T101cboListeCompteurs');
        const detail = hbDoc.querySelector('.T101Detail');

        if (!select || !detail) return resolve({});

        const before = detail.innerHTML;
        select.value = key;
        select.dispatchEvent(new Event('change', { bubbles: true }));

        let resolved = false;

        const done = () => {
            if (resolved) return;
            resolved = true;
            observer.disconnect();
            clearTimeout(timeout);
            // Petit délai pour laisser So'Horsys finir l'injection
            setTimeout(() => resolve(readDetail(hbDoc)), 50);
        };

        const timeout = setTimeout(done, 3000);

        const observer = new MutationObserver(() => {
            if (detail.innerHTML !== before) done();
        });

        observer.observe(detail, { childList: true, subtree: true, characterData: true });
    });
}

// =======================================================
// CRÉDIT SEMAINE
// =======================================================
// Calcule le crédit/déficit cumulé des jours visibles dans l'iframe mouvements, en minutes.
function computeWeekCredit(target = CONFIG.target) {
    const mouvDoc = getMouvDoc();
    if (!mouvDoc) return null;

    const days = mouvDoc.querySelectorAll('#CtnListGraphDay li');
    if (!days.length) return null;

    let total = 0;
    let found = false;

    days.forEach(day => {
        const p = getPointages(day);
        if (!p.length) return;
        const { worked } = computeWorked(p);
        total += worked - target;
        found = true;
    });

    return found ? total : null;
}


// =======================================================
// BUS DE DONNÉES PARTAGÉ
// =======================================================
// Stockage en mémoire partagé entre modules.
// Chaque module écrit dans sa clé, les autres peuvent lire.
const DATA = {
    counters:   {},   // { CP_DET2: { label: valeurBrute }, ... }
    weekCredit: null, // minutes (calculé par computeWeekCredit)
};

// =======================================================
// SYSTÈME MODULAIRE
// =======================================================
// Registre des modules. Permet d'avoir des scripts indépendants et une architecture extensible. Permet aux utilisateurs de choisir leurs modules.
// Ajouter à chaque module :
/** const waitCore = setInterval(() => {
    const core = window.TOMO_CORE;
    if(core && core.registerModule){
        clearInterval(waitCore);

        core.registerModule({
            name: 'nom_du_module',
            init(core){
                start(core);
            },
            run(){}
        });
    }
},50);
 */
window.TOMO_CORE = {
    config: CONFIG,
    colors: COLORS,

    timeToMinutes,
    minutesToTime,
    nowMinutes,

    getHbDoc,
    getMouvDoc,
    getPointages,

    computeWorked,
    computePause,
    estimateFinish,
    getTimeState,

    parseCounterValue,
    loadCounter,
    readDetail,
    computeWeekCredit,

    cache,
    prefs,
    data: DATA,

    // Registre des modules.
    // Chaque module s’enregistre ici et gère son propre affichage / comportement.
    modules: [],
    registerModule(module) {
        if (!module || !module.name || typeof module.run !== 'function') return;
        if (this.modules.some(m => m.name === module.name)) return;

        this.modules.push(module);

        if (typeof module.init === 'function') {
            try {
                module.init(this);
            } catch (err) {
                console.warn('[TOMO_CORE] init error in module:', module.name, err);
            }
        }
    }
};

window.TOMO = window.TOMO_CORE;

})();