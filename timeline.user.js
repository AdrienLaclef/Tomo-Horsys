// ==UserScript==
// @name         Tomo'Horsys - Timeline améliorée
// @namespace    So'Horsys
// @version      0.3
// @description  H-Board - Indique le bon temps sur la timeline et l'améliore graphiquement
// @match        https://ankama.sohorsys.fr/*
// @icon         https://ankama.sohorsys.fr/SOHORSYSH12692P1_WEB//Images/Main/so_HORSYS_DIGITAL_ico.svg
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/timeline.user.js
// @downloadURL  https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/timeline.user.js
// ==/UserScript==

(() => {
'use strict';

// On évite l'exécution dans certaines iframes. Le panel doit être unique et global. So'Horsys utilisant plusieurs iframes, cela évite les doublons.
if (window.top !== window) return;

// =======================================================
// ATTENTE DU CORE
// =======================================================
// Le module attend que TOMO_CORE soit chargé, puis s'enregistre dans l'architecture modulaire.
const waitCore = setInterval(() => {
    const core = window.TOMO_CORE;
    if (core && typeof core.registerModule === 'function') {
        clearInterval(waitCore);
        // Enregistrement du module
        core.registerModule({
            name: 'tomo-timeline',

            // Initialisation du module
            init(core) {
                startTimelineLoop(core);
            },
            // run non utilisé ici : le panel possède sa propre boucle interne
            run() {}
        });
    }
}, 50);

// =======================================================
// CONSTANTES
// =======================================================
// Timer de rafraîchissement
let timelineTimer = null;

// =======================================================
// BOUCLE PRINCIPALE
// =======================================================
// Met à jour la timeline périodiquement.
function startTimelineLoop(core) {
    // Evite plusieurs timers
    if (timelineTimer) return;

    const tick = () => {
        updateTimeline(core);
    };

    // Exécution immédiate
    tick();
    // Rafraîchissement périodique
    timelineTimer = setInterval(tick, core.config.refreshRate);
}

// =======================================================
// UPDATE TIMELINE
// =======================================================
// Met à jour l'affichage de la timeline. Remplace le reste So'Horsys par le calcul fiable du Core.
function updateTimeline(core) {
    // Récupération iframe HBoard
    const doc = core.getHbDoc();
    if (!doc) return;

    // Container principal HBoard
    const container = doc.querySelector('.gdLEnteteMicroCtn');
    if (!container) return;

    // Récupération pointages
    const p = core.getPointages(container);
    if (!p.length) return;

    // Etat temps centralisé
    const state = core.getTimeState(p, core.config.target);
    if (!state) return;

    // Texte de la timeline
    const timeline = container.querySelector('.gdTimeLineInfo.gdTimeLineInfoRight');
    // Barre graphique
    const bar = container.querySelector('.gdTimeLineBar');

    if (!timeline) return;

    // Remplacement du texte So'Horsys par :
    // - "Reste" si objectif non atteint
    // - "Crédit" si objectif dépassé
    timeline.innerHTML = `<div style="text-align:left; line-height:1.3;">${state.label} : ${state.value}</div>`;
    // Alignement du texte
    timeline.style.textAlign = 'left';
    // Ajustement du bloc pour l'aligner avec la timeline
    timeline.style.marginTop = '23px';
    timeline.style.marginLeft = '1px';

    // Correction de la barre qui passe sous certains éléments.
    if (bar) {
        bar.style.zIndex = '9999';
    }
}

})();