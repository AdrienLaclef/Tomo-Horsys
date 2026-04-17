// ==UserScript==
// @name         Tomo'Horsys - Menu amélioré
// @namespace    So'Horsys
// @version      0.3
// @description  H-Board - Menu simplifié et actif
// @match        https://ankama.sohorsys.fr/*
// @icon         https://ankama.sohorsys.fr/SOHORSYSH12692P1_WEB//Images/Main/so_HORSYS_DIGITAL_ico.svg
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/menu.user.js
// @downloadURL  https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/menu.user.js
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
    if(core && core.registerModule){
        clearInterval(waitCore);

        core.registerModule({
            name: 'tomo-menu',

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
// SIMPLIFICATION DU MENU
// =======================================================
// Transforme le menu natif en menu simplifié et interactif.
// - Supprime les flèches
// - Cache les sous-menus
// - Rend les entrées directement cliquables
// TODO : Rendre l'état visuel activé/désactivé
function simplifyMenu(){

    const menu = document.querySelector('#mn_ListMenu');
    if(!menu) return;

    // Parcours de chaque entrée du menu
	menu.querySelectorAll('li').forEach(li => {

        const parent = li.querySelector('.UnMenuGen');
        const sub = li.querySelector('ul');
        const child = sub?.querySelector('.UnMenu');

        // On ignore les structures incomplètes
		if(!parent || !sub || !child) return;
        // Empêche de retraiter un élément déjà transformé
		if(parent.dataset.tomoMenu) return;

        parent.dataset.tomoMenu = "1";

        parent.style.cursor = 'pointer';

        // Gestion du clic sur le menu
		parent.addEventListener('click', e => {

            e.stopPropagation();

            // Retire l'état actif sur les autres entrées
			menu.querySelectorAll('.tomo-active')
            .forEach(el=>el.classList.remove('tomo-active'));

            parent.classList.add('tomo-active');

            // Déclenche le vrai clic du sous-menu
			child.click();

        });

        // Suppression de la flèche visuelle
		const arrow = parent.querySelector('.arrowMenu');
        if(arrow) arrow.style.display = 'none';

        // Masquage du sous-menu (navigation simplifiée)
		sub.style.display = 'none';

    });

}

// =======================================================
// BOUCLE PRINCIPALE
// =======================================================
// Initialise la boucle de simplification du menu
function start(core){
    // Sécurité : empêche le lancement multiple du module
	if(timer) return;

    const tick = () => simplifyMenu();

    const startLoop = () => {
        tick();
        timer = setInterval(tick, core.config.refreshRate);
    };

    // Attente du chargement complet du DOM
	if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', startLoop,{once:true});
    }else{
        startLoop();
    }
}

})();