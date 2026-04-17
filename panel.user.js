// ==UserScript==
// @name         Tomo'Horsys - Panel flottant
// @namespace    So'Horsys
// @version      0.3
// @description  H-Board - Ajout d'un panel flottant indiquant le temps travaillé, restant et l'heure de fin.
// @match        https://ankama.sohorsys.fr/*
// @icon         https://ankama.sohorsys.fr/SOHORSYSH12692P1_WEB//Images/Main/so_HORSYS_DIGITAL_ico.svg
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/panel.user.js
// @downloadURL  https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/panel.user.js
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
            name: 'tomo-panel',

            // Initialisation du module
            init(core) {
                // Injection CSS
                injectPanelStyles(core);
                // Lancement boucle principale
                startPanelLoop(core);
            },
            // run non utilisé ici : le panel possède sa propre boucle interne
            run() {}
        });
    }
}, 50);

// =======================================================
// CONSTANTES
// =======================================================
// ID principal du panel. Permet un accès rapide DOM + évite doublons.
const PANEL_ID = 'tomo-hboard-panel';
// Timer de rafraîchissement
let panelTimer = null;

// =======================================================
// STYLES
// =======================================================
// Injection du CSS dynamique basé sur les couleurs du Core. Injecté une seule fois pour éviter la duplication et surcharge DOM.
function injectPanelStyles(core) {
    if (document.getElementById('tomo-panel-style')) return;

    const css = document.createElement('style');
    css.id = 'tomo-panel-style';
    css.textContent = `
        #tomo-hboard-panel {
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 99999;
            background: ${core.colors.bg};
            border: 1px solid ${core.colors.border};
            border-radius: 10px;
            box-shadow: ${core.colors.shadow};
            width: 210px;
            font-family: 'Segoe UI', sans-serif;
            font-size: 13px;
            color: ${core.colors.text};
            user-select: none;
            overflow: hidden;
        }

        /* Header draggable */
        #tomo-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: ${core.colors.dblue};
            color: #fff;
            padding: 7px 10px;
            font-weight: 600;
            cursor: move;
            line-height: 1.2;
        }

        #tomo-panel-title {
            display: inline-block;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
        }

        #tomo-panel-body { padding: 10px 12px 12px; }

        /* Barre de progression */
        #tomo-progress-wrap {
            position: relative;
            background: #eef1f8;
            height: 18px;
            border-radius: 6px;
            overflow: hidden;
        }

        #tomo-progress-bar {
            height: 100%;
            width: 0%;
            transition: width .5s ease, background-color .5s ease;
        }

        #tomo-progress-label {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 600;
            color: ${core.colors.text};
            mix-blend-mode: multiply;
        }

        /* Stats */
        #tomo-panel-stats .tomo-row {
            display: flex;
            justify-content: space-between;
            margin-top: 4px;
        }

        #tomo-panel-stats .tomo-label { color: ${core.colors.cblue}; }
        #tomo-panel-stats .tomo-val { font-weight: 600; }
        #tomo-panel-stats .tomo-val.done { color: ${core.colors.green}; }
        #tomo-panel-stats .tomo-val.warning { color: ${core.colors.yellow}; }

        /* Etat sans données */
        #tomo-hboard-panel.tomo-no-data #tomo-panel-body { display: none; }

        #tomo-no-data-msg {
            padding: 8px 12px 10px;
            color: #aaa;
            font-size: 11px;
            text-align: center;
        }
    `;
    document.documentElement.appendChild(css);
}

// =======================================================
// CREATION DU PANEL
// =======================================================
// Crée le panel si inexistant. Il est créé dynamiquement pour éviter les erreurs si le DOM n'est pas encore prêt.
function ensurePanel() {
    if (document.getElementById(PANEL_ID)) return;
    if (!document.body) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
        <div id="tomo-panel-header">
            <span id="tomo-panel-title">⏱ H-Board</span>
        </div>
        <div id="tomo-panel-body">
            <div id="tomo-progress-wrap">
                <div id="tomo-progress-bar"></div>
                <span id="tomo-progress-label"></span>
            </div>
            <div id="tomo-panel-stats"></div>
        </div>
    `;

    document.body.appendChild(panel);
    // On rend le panel déplaçable
    makeDraggable(panel, panel.querySelector('#tomo-panel-header'));
}

// =======================================================
// DRAG PANEL
// =======================================================
// Rend le panel déplaçable.
function makeDraggable(el, handle) {
    let ox = 0, oy = 0;

    handle.addEventListener('mousedown', e => {
        e.preventDefault();
        ox = e.clientX - el.getBoundingClientRect().left;
        oy = e.clientY - el.getBoundingClientRect().top;

        function move(ev) {
            el.style.left = (ev.clientX - ox) + 'px';
            el.style.top = (ev.clientY - oy) + 'px';
            el.style.bottom = 'auto';
            el.style.right = 'auto';
        }

        function up() {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
        }

        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    });
}

// =======================================================
// ETAT SANS DONNEES
// =======================================================
function showNoData() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    panel.classList.add('tomo-no-data');
    const body = panel.querySelector('#tomo-panel-body');
    if (body) body.style.display = 'none';

    let msg = document.getElementById('tomo-no-data-msg');
    if (!msg) {
        msg = document.createElement('div');
        msg.id = 'tomo-no-data-msg';
        msg.textContent = 'En attente du H-Board…';
        panel.appendChild(msg);
    }

    const titleEl = document.getElementById('tomo-panel-title');
    if (titleEl) titleEl.textContent = '⏱ H-Board';
}

function hideNoData() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    panel.classList.remove('tomo-no-data');
    const body = panel.querySelector('#tomo-panel-body');
    if (body) body.style.display = '';

    const msg = document.getElementById('tomo-no-data-msg');
    if (msg) msg.remove();
}

// =======================================================
// UPDATE PANEL
// =======================================================
// Met à jour l'affichage du panel avec les données du Core.
function updatePanel(core, p) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    // Récupération état temps centralisé
    const state = core.getTimeState(p, core.config.target);
    if (!state) return;

    // Progress bar
    const bar = panel.querySelector('#tomo-progress-bar');
    const label = panel.querySelector('#tomo-progress-label');

    if (bar) {
        bar.style.width = state.pct + '%';
        bar.style.background = state.barColor;
    }
    if (label) label.textContent = state.pct + '%';

    // Stats
    const stats = panel.querySelector('#tomo-panel-stats');
    if (stats) {
        stats.innerHTML = `
            <div class="tomo-row">
                <span class="tomo-label">Travaillé</span>
                <span class="tomo-val">${core.minutesToTime(state.worked)}</span>
            </div>
            <div class="tomo-row">
                <span class="tomo-label">${state.label}</span>
                <span class="tomo-val ${state.remainingClass}">
                    ${state.value}
                </span>
            </div>
        `;
    }

    // Titre dynamique
    const titleEl = document.getElementById('tomo-panel-title');
    if (titleEl) {
        if (state.finish) {
            titleEl.innerHTML = `🏁 Fin estimée : <span>${core.minutesToTime(state.finish)}</span>`;
        } else if (state.isOvertime) {
            titleEl.textContent = '✅ Journée complétée !';
        } else {
            titleEl.textContent = '⏱ H-Board';
        }
    }
}

// =======================================================
// BOUCLE PRINCIPALE
// =======================================================
// Récupère les pointages et met à jour le panel périodiquement.
function startPanelLoop(core) {
    // Sécurité : empêche le lancement multiple du module
	if (panelTimer) return;

    const tick = () => {
        ensurePanel();

        // Récupération iframe HBoard
        const doc = core.getHbDoc();
        if (!doc) return showNoData();

        // Container pointages
        const container = doc.querySelector('.gdLEnteteMicroCtn');
        if (!container) return showNoData();

        // Récupération des pointages
        const p = core.getPointages(container);
        if (!p.length) return showNoData();

        hideNoData();
        updatePanel(core, p);
    };

    const start = () => {
        tick();
        panelTimer = setInterval(tick, core.config.refreshRate);
    };

    // Attente du chargement complet du DOM
	if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
}

})();