// ==UserScript==
// @name         Tomo'Horsys - Core
// @namespace    So'Horsys
// @version      0.3
// @description  Constantes et fonctions communes
// @match        https://ankama.sohorsys.fr/*
// @icon         https://ankama.sohorsys.fr/SOHORSYSH12692P1_WEB//Images/Main/so_HORSYS_DIGITAL_ico.svg
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/core.user.js
// @downloadURL  https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/core.user.js
// ==/UserScript==

(() => {
'use strict';

// Empêche double chargement du Core
if (window.TOMO_CORE) return;

// =======================================================
// CONSTANTES DE CONFIGURATION
// =======================================================

const CONFIG = Object.freeze({
    target: 450, // Objectif quotidien de travail, en minutes. 450 min = 7h30.
    minPause: 60, // Temps de pause minimum, en min.
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
function computeWorked(pointages) {
    let worked = 0;

    // Somme des blocs entrée / sortie
    for (let i = 0; i < pointages.length - 1; i += 2) {
        worked += pointages[i + 1] - pointages[i];
    }

    // Journée encore ouverte : nombre impair de pointages.
    const openWork = (pointages.length % 2 === 1);

    // Cas particulier : deux pointages = pause en cours.
    const onBreak = (pointages.length === 2);

    // Si on travaille encore, on ajoute le temps entre la dernière entrée et maintenant.
    if (openWork && !onBreak) {
        worked += nowMinutes() - pointages[pointages.length - 1];
    }

    return { worked, openWork, onBreak };
}

// Calcule la pause réelle
// - 1 pointage : on force la pause minimale.
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
// On prend le 1er pointage, on ajoute l’objectif, puis la pause retenue par computePause().
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