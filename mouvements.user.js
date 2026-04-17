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

if (window.top !== window) return;

const waitCore = setInterval(() => {
    const core = window.TOMO_CORE;
    if (core && typeof core.registerModule === 'function') {
        clearInterval(waitCore);
        core.registerModule({
            name: 'tomo-mouvements',
            init(core) {
                injectStyle();
                startMouvementsLoop(core);
            },
            run() {}
        });
    }
}, 50);

let mouvTimer = null;

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

function startMouvementsLoop(core) {
    if (mouvTimer) return;

    const tick = () => processMouvements(core);

    const start = () => {
        tick();
        mouvTimer = setInterval(tick, core.config.refreshRate);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
}

function processMouvements(core) {
    const doc = core.getMouvDoc();
    if (!doc) return;

    const days = doc.querySelectorAll('#CtnListGraphDay li');
    if (!days.length) return;

    days.forEach(day => renderDay(core, day));
}

function removeNoise(day) {
    day.querySelectorAll('.IconStatutJour.imgStatutHistorise')
        .forEach(el => el.remove());
}

function renderDay(core, day) {
    const label = day.querySelector('.StatutJour');
    if (!label) return;

    removeNoise(day);

    const p = core.getPointages(day);
    if (!p.length) return;

    const state = core.getTimeState(p, core.config.target);
    if (!state) return;

    let html = `
        <div class="tomo-mov-block">
            <div><b>Travaillé :</b> ${core.minutesToTime(state.worked)}</div>
    `;

    if (p.length >= 4) {
        html += `
            <div style="color:${state.isOvertime ? core.colors.green : core.colors.red}">
                Crédit : ${core.minutesToTime(state.credit)}
            </div>
        `;
    } else if (state.finish) {
        html += `
            <div style="color:${core.colors.yellow}; font-weight:600">
                Fin estimée : ${core.minutesToTime(state.finish)}
            </div>
        `;
    } else {
        html += `
            <div style="color:${core.colors.green}">
                Crédit : ${core.minutesToTime(state.credit)}
            </div>
        `;
    }

    html += `</div>`;

    label.innerHTML = html;

    const timeline = day.querySelector('.gdTimeLineInfo.gdTimeLineInfoRight');
    if (timeline) {
        timeline.textContent = `${state.label} = ${state.value}`;
        timeline.style.marginTop = '23px';
        timeline.style.fontSize = '12px';
    }
}

})();