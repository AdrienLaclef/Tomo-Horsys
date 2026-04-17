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

if (window.top !== window) return;

const waitCore = setInterval(() => {
    const core = window.TOMO_CORE;
    if (core && core.registerModule) {
        clearInterval(waitCore);

        core.registerModule({
            name: 'tomo-badgeuse',
            init(core){
                start(core);
            },
            run(){}
        });
    }
},50);

let timer = null;

function start(core){
    if(timer) return;

    const tick = () => openBadgeuse(core);

    const startLoop = () => {
        tick();
        timer = setInterval(tick, core.config.refreshRate);
    };

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', startLoop, {once:true});
    }else{
        startLoop();
    }
}

function openBadgeuse(core){

    const doc = core.getHbDoc();
    if(!doc) return;

    const container = doc.querySelector('.gdLEnteteMicroCtn');
    if(!container) return;

    if(container.dataset.tomoOpened) return;

    container.dataset.tomoOpened = "1";

    container.classList.remove('Hidden','hidden');
    container.removeAttribute('hidden');

    container.style.display = '';
    container.style.visibility = 'visible';
    container.style.opacity = '1';

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

})();