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

if (window.top !== window) return;

const waitCore = setInterval(() => {
    const core = window.TOMO_CORE;
    if(core && core.registerModule){
        clearInterval(waitCore);

        core.registerModule({
            name: 'tomo-menu',
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

    const tick = () => simplifyMenu();

    const startLoop = () => {
        tick();
        timer = setInterval(tick, 2000);
    };

    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', startLoop,{once:true});
    }else{
        startLoop();
    }
}

function simplifyMenu(){

    const menu = document.querySelector('#mn_ListMenu');
    if(!menu) return;

    menu.querySelectorAll('li').forEach(li => {

        const parent = li.querySelector('.UnMenuGen');
        const sub = li.querySelector('ul');
        const child = sub?.querySelector('.UnMenu');

        if(!parent || !sub || !child) return;
        if(parent.dataset.tomoMenu) return;

        parent.dataset.tomoMenu = "1";

        parent.style.cursor = 'pointer';

        parent.addEventListener('click', e => {

            e.stopPropagation();

            menu.querySelectorAll('.tomo-active')
            .forEach(el=>el.classList.remove('tomo-active'));

            parent.classList.add('tomo-active');

            child.click();

        });

        const arrow = parent.querySelector('.arrowMenu');
        if(arrow) arrow.style.display = 'none';

        sub.style.display = 'none';

    });

}

})();