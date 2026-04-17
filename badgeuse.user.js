// ==UserScript==
// @name         Tomo'Horsys - Badgeuse améliorée
// @namespace    So'Horsys
// @version      0.3
// @description  H-Board - Dépliage automatique de la badgeuse et des pointages
// @match        https://ankama.sohorsys.fr/*
// @icon         https://ankama.sohorsys.fr/SOHORSYSH12692P1_WEB//Images/Main/so_HORSYS_DIGITAL_ico.svg
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/badgeuse.user.js
// @downloadURL  https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/badgeuse.user.js
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
    if (core && core.registerModule) {
        clearInterval(waitCore);

        core.registerModule({
            name: 'tomo-badgeuse',

            // Initialisation du module
			init(core){
				// Lancement boucle principale
                start(core);
            },
			// run non utilisé ici : le panel possède sa propre boucle interne
            run(){}
        });
    }
},50);

// =======================================================
// CONSTANTES
// =======================================================
// Timer de rafraîchissement
let timer = null;

// =======================================================
// OUVERTURE FORCÉE DE LA BADGEUSE
// =======================================================
// Déplie automatiquement la zone de pointage.
function openBadgeuse(core){

    // Récupération iframe HBoard
	const doc = core.getHbDoc();
    if(!doc) return;

    // Conteneur principal de la badgeuse
	const container = doc.querySelector('.gdLEnteteMicroCtn');
    if(!container) return;

    if(container.dataset.tomoOpened) return;

    // exécution unique
	container.dataset.tomoOpened = "1";

    // DÉVERROUILLAGE DU CONTENEUR PRINCIPAL
	container.classList.remove('Hidden','hidden');
    container.removeAttribute('hidden');

    container.style.display = '';
    container.style.visibility = 'visible';
    container.style.opacity = '1';

    // DÉVERROUILLAGE DES LIGNES DE POINTAGE
	doc.querySelectorAll('.UneLigne.Hidden, .UneLigne.hidden, .UneLigne[hidden]')
    .forEach(el=>{
        el.classList.remove('Hidden','hidden');
        el.removeAttribute('hidden');
        el.hidden = false;

        el.style.display = 'block';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
    });

}

// =======================================================
// BOUCLE PRINCIPALE
// =======================================================
// Force l’ouverture de la badgeuse
function start(core){
	// Sécurité : empêche le lancement multiple du module
    if(timer) return;

    const tick = () => openBadgeuse(core);

    const startLoop = () => {
		// Exécution immédiate au démarrage
        tick();
		// Rafraîchissement périodique pour gérer les rechargements dynamiques
        timer = setInterval(tick, core.config.refreshRate);
    };

    // Attente du chargement complet du DOM
	if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', startLoop, {once:true});
    }else{
        startLoop();
    }
}

})();