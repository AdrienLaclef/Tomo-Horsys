// ==UserScript==
// @name         Tomo'Horsys - Historique amélioré
// @namespace    So'Horsys
// @version      0.3
// @description  Mes - Mouvements - Affiche le temps travaillé et le crédit sur chaque jour historisé
// @match        https://ankama.sohorsys.fr/*
// @icon         https://ankama.sohorsys.fr/SOHORSYSH12692P1_WEB//Images/Main/so_HORSYS_DIGITAL_ico.svg
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/mouvements.user.js
// @downloadURL  https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/mouvements.user.js
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
	// Enregistrement du module
    if (core && typeof core.registerModule === 'function') {
        clearInterval(waitCore);
        core.registerModule({
            name: 'tomo-mouvements',

			// Initialisation du module
            init(core) {
				// Injection CSS
                injectStyle();
				// Lancement boucle principale
                startMouvementsLoop(core);
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
let mouvTimer = null;

// =======================================================
// STYLES
// =======================================================
// Injection du CSS dynamique pour améliorer l'affichage.
function injectStyle() {
    if (document.getElementById('tomo-mouvements-style')) return;

    const style = document.createElement('style');
    style.id = 'tomo-mouvements-style';
    style.textContent = `
        .StatutJour .tomo-mov-block {
            line-height: 1.4;
            font-size: 0.85em;
            padding: 4px 0;
        }
    `;
    document.documentElement.appendChild(style);
}

// =======================================================
// TRAITEMENT DES JOURNÉES
// =======================================================
// Parcourt toutes les lignes de l'historique et applique l'affichage
function processMouvements(core) {
    // Récupération de l’iframe "Mes mouvements"
	const doc = core.getMouvDoc();
    if (!doc) return;

    // Liste des jours affichés dans l’historique
	const days = doc.querySelectorAll('#CtnListGraphDay li');
    if (!days.length) return;

    // Traitement individuel de chaque jour
	days.forEach(day => renderDay(core, day));
}

// =======================================================
// NETTOYAGE VISUEL
// =======================================================
// Supprime les icônes inutiles et les redondantes
function removeNoise(day) {
    day.querySelectorAll('.IconStatutJour.imgStatutHistorise')
        .forEach(el => el.remove());
}

// =======================================================
// RENDU D'UN JOUR
// =======================================================
// Calcule et affiche les informations de temps pour un jour donné
function renderDay(core, day) {
    // Zone d'affichage principale du jour
	const label = day.querySelector('.StatutJour');
    if (!label) return;

    // Nettoyage visuel des éléments parasites
	removeNoise(day);

    // Extraction des pointages du jour
	const p = core.getPointages(day);
    if (!p.length) return;

    // Calcul centralisé (travail, crédit, état, etc.)
	const state = core.getTimeState(p, core.config.target);
    if (!state) return;

    // Affichage
	let html = `
        <div class="tomo-mov-block">
            <div><b>Travaillé :</b> ${core.minutesToTime(state.worked)}</div>
    `;

    // Cas 1 : journée avec suffisamment de données (>= 4 pointages) --> affichage du crédit réel
	if (p.length >= 4) {
        html += `
            <div style="color:${state.isOvertime ? core.colors.green : core.colors.red}">
                Crédit : ${core.minutesToTime(state.credit)}
            </div>
        `;
	// Cas 2 : estimation possible de fin de journée
    } else if (state.finish) {
        html += `
            <div style="color:${core.colors.yellow}; font-weight:600">
                Fin estimée : ${core.minutesToTime(state.finish)}
            </div>
        `;
    // Cas 3 : journée encore en cours --> affichage du crédit calculé
	} else {
        html += `
            <div style="color:${core.colors.green}">
                Crédit : ${core.minutesToTime(state.credit)}
            </div>
        `;
    }

    html += `</div>`;

    // Injection dans l’interface existante
	label.innerHTML = html;

    // Ajustements de la timeline du jour
	const timeline = day.querySelector('.gdTimeLineInfo.gdTimeLineInfoRight');
    if (timeline) {
		// Affichage simplifié du statut temps
        timeline.textContent = `${state.label} = ${state.value}`;
		// Ajustements du bloc
        timeline.style.marginTop = '23px';
        timeline.style.fontSize = '12px';
    }
}

// =======================================================
// BOUCLE PRINCIPALE
// =======================================================
// Récupère les pointages et met à jour l'historique périodiquement.
function startMouvementsLoop(core) {
	// Sécurité : empêche le double lancement
    if (mouvTimer) return;

	const tick = () => processMouvements(core);

    const start = () => {
		// Première exécution immédiate
        tick();
		// Rafraîchissement périodique
        mouvTimer = setInterval(tick, core.config.refreshRate);
    };

    // Attente du chargement complet du DOM
	if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
}

})();