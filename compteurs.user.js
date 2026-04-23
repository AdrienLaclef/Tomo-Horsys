// ==UserScript==
// @name         Tomo'Horsys - Compteurs améliorés
// @namespace    So'Horsys
// @version      0.1
// @description  H-Board - Affichage amélioré des compteurs (CP, DC, récupérations...)
// @match        https://ankama.sohorsys.fr/*
// @icon         https://ankama.sohorsys.fr/SOHORSYSH12692P1_WEB//Images/Main/so_HORSYS_DIGITAL_ico.svg
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/compteurs.user.js
// @downloadURL  https://raw.githubusercontent.com/AdrienLaclef/Tomo-Horsys/main/compteurs.user.js
// ==/UserScript==

(() => {
'use strict';

if (window.top !== window) return;

// =======================================================
// ATTENTE DU CORE
// =======================================================
const waitCore = setInterval(() => {
    const core = window.TOMO_CORE;
    if (core && typeof core.registerModule === 'function') {
        clearInterval(waitCore);
        core.registerModule({
            name: 'tomo-compteurs',
            init(core) { startLoop(core); },
            run() {}
        });
    }
}, 50);

// =======================================================
// PRÉFÉRENCES (localStorage)
// =======================================================
const PREF_KEY = 'tomo_compteurs_prefs';

const DEFAULT_PREFS = {
    showDC:         true,
    showCEM:        true,
    showRECHS:      true,
    showRECS:       true,
    showDEL:        true,
    hideIfZero:     true,
};

function loadPrefs() {
    try {
        const saved = localStorage.getItem(PREF_KEY);
        return saved ? { ...DEFAULT_PREFS, ...JSON.parse(saved) } : { ...DEFAULT_PREFS };
    } catch { return { ...DEFAULT_PREFS }; }
}

function savePrefs(prefs) {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
}

// =======================================================
// MAPPING DES COMPTEURS
// =======================================================
// Formats de lignes :
//   - Ligne simple   : { display, src, isTime?, colorRule? }
//   - Ligne pairée   : { display, left, right, isTime?, colorRuleL?, colorRuleR? }
//   - Ligne calculée : { display, calc: fn(data, core) → number, isTime?, colorRule? }
//     → fn reçoit l'objet data brut et core, retourne une valeur numérique (ou null)
//
// colorRule : 'signed'  → vert si >0, rouge si <0 (défaut pour isTime)
//             'solde'   → vert uniquement (indique ce qu'il reste à prendre)
//             'neutral' → toujours neutre
//
// hint : tooltip affiché au survol du header de section

const COUNTER_DEFS = {

    CP_DET2: {
        prefKey: null,
        color: '#1A5C8A',
        label: 'Congés payés',
        hint: 'Congés payés : droits issus de vos périodes de travail.',
        rows: [
            {
                // Ligne pairée : Acquis - Pris / Droits
                display: 'Acquis - Pris / Droits',
                left: 'CP acquis pris', right: 'CP acquis droits',
                colorRuleL: 'neutral', colorRuleR: 'neutral',
                hint: `À poser avant le 31 mai.
Congés obtenus lors de la période précédente.`,
            },
            {
                // Ligne calculée : Solde réel = CP acquis solde - CP pris à venir
                display: 'Acquis - Solde réel',
                calc: data => {
                    const solde  = parseDecimal(data['CP acquis solde']);
                    const avenir = parseDecimal(data['CP pris à venir']);
                    if (solde === null) return null;
                    return solde - (avenir ?? 0);
                },
                colorRule: 'solde',
                hint: `Ce qu\'il vous reste réellement à poser.
Solde réel = solde acquis - congés posés à venir.`,
            },
            {
                // Ligne pairée : En cours — Pris / Droits
                display: 'En cours - Pris / Droits',
                left: 'CP en cours pris', right: 'CP en cours droits',
                colorRuleL: 'neutral', colorRuleR: 'neutral',
                striped: true,
                hint: `Congés en cours d\'acquisition (période 1er juin → 31 mai).
Deviendront \'Acquis\' dès le 1er juin.`,
            },
        ],
        soldeKey: 'CP acquis solde',
    },

    DC_SAL2: {
        prefKey: 'showDC',
        color: '#1A6B5A',
        label: 'Horaires variables',
        hint: 'Cumul des heures supplémentaires et déficits.',
        rows: [
            { display: 'Actuel',     src: 'DC actuel',     isTime: true, colorRule: 'signed', hint: 'Solde du temps variable. Mis à jour chaque dimanche.' },
            {
                // Crédit calculé de la semaine en cours (depuis l'iframe mouvements)
                // Affiché ici comme estimation des récupérations à venir
                display: 'Crédit semaine',
                calc: (_data, core) => core.data.weekCredit ?? null,
                isTime: true,
                colorRule: 'signed',
                hint: 'Crédit ou déficit cumulé des jours de la semaine visible dans Mes Mouvements.',
            },
        ],
        soldeKey: 'DC actuel',
    },

    CEM: {
        prefKey: 'showCEM',
        color: '#7B3A6B',
        label: 'Congés enfant malade',
        hint: 'Congés pour enfant malade.',
        rows: [
            { display: 'Pris / Acquis', left: 'Conges Pris', right: 'Conges acquis', colorRuleL: 'neutral', colorRuleR: 'neutral' },
            { display: 'Solde',         src: 'Solde',         colorRule: 'solde' },
            { display: 'En attente',    src: 'Demande en attente', colorRule: 'neutral' },
        ],
        soldeKey: 'Solde',
    },

    RECHS: {
        prefKey: 'showRECHS',
        color: '#7A5C1A',
        label: 'Récupérations Hors Salon',
        hint: 'Récupérations acquises hors périodes salon.',
        rows: [
            { display: 'Solde / Acquises', left: 'Réc hors salon solde', right: 'Réc hors salon acq', isTime: true, colorRuleL: 'solde', colorRuleR: 'neutral' },
            { display: 'À venir',       src: 'Hrs hors sal à venir',  isTime: true, colorRule: 'solde'   },
            { display: 'Travail en attente', src: 'Hrs trav. en attente',  isTime: true, colorRule: 'neutral', hint: 'Heures travaillées en attente de validation.' },
            { display: 'Récupération en attente', src: 'Dmd récup en attente',  isTime: true, colorRule: 'neutral', hint: 'Demande de récupération en attente de validation.' },
        ],
        soldeKey: 'Réc hors salon solde',
    },

    RECS: {
        prefKey: 'showRECS',
        color: '#5C3A1A',
        label: 'Récupérations Salons',
        hint: 'Récupérations acquises lors des périodes salon.',
        rows: [
            { display: 'Solde / Acquises', left: 'Récup solde', right: 'Récup salon acquise', isTime: true, colorRuleL: 'solde', colorRuleR: 'neutral' },
            { display: 'À venir',       src: 'Hrs salon à venir',    isTime: true, colorRule: 'solde'   },
            { display: 'Trav. en attente', src: 'Dmd Trav. en attente', isTime: true, colorRule: 'neutral' },
            { display: 'Récup en attente', src: 'Dmd récup en attente', isTime: true, colorRule: 'neutral' },
        ],
        soldeKey: 'Récup solde',
    },

    DEL: {
        prefKey: 'showDEL',
        color: '#1A3A6B',
        label: 'Délégations',
        hint: 'Heures de délégation syndicale (DEL DS) et CSE.',
        rows: [
            { display: 'DS — Pris / Acquis', left: 'H DEL DS prises',    right: 'H DEL DS acquises',  isTime: true, colorRuleL: 'neutral', colorRuleR: 'neutral' },
            { display: 'DS solde',          src: 'H DEL DS solde',       isTime: true, colorRule: 'solde'   },
            { display: 'CSE — Pris / Acquis',     left: 'H CSE mensuel pris',  right: 'H CSE mensuel acq', isTime: true, colorRuleL: 'neutral', colorRuleR: 'neutral' },
            { display: 'CSE solde',             src: 'H CSE Solde',           isTime: true, colorRule: 'solde'   },
        ],
        soldeKey: 'H DEL DS solde',
    },
};

const DISPLAY_ORDER = ['CP_DET2', 'DC_SAL2', 'CEM', 'RECHS', 'RECS', 'DEL'];

// =======================================================
// ÉTAT INTERNE
// =======================================================
let timer          = null;
let isLoading      = false;
let lastLoadTime   = 0;
const RELOAD_INTERVAL = 60_000;
let configPanelOpen   = false;
let firstLoadDone = false;
let loadLock = false;

// =======================================================
// HELPERS PARSING
// =======================================================
// Parse une valeur décimale SoHorsys (+8,50 → 8.5)
function parseDecimal(raw) {
    if (!raw) return null;
    const v = parseFloat(String(raw).replace(',', '.').replace('+', ''));
    return isNaN(v) ? null : v;
}

// =======================================================
// STYLES (injectés dans hbDoc)
// =======================================================
function injectStyles(hbDoc, core) {
    if (hbDoc.getElementById('tomo-compteurs-style')) return;

    const s = hbDoc.createElement('style');
    s.id = 'tomo-compteurs-style';
    s.textContent = `
        #tomo-compteurs-wrap {
            font-family: 'Segoe UI', sans-serif;
            font-size: 12px;
            color: ${core.colors.text};
            padding: 4px 8px 8px;
            overflow-y: auto;
            max-height: 100%;
            box-sizing: border-box;
        }

        .tomo-cpt-section {
            margin-bottom: 7px;
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid ${core.colors.border};
        }

        .tomo-cpt-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 8px;
            color: #fff;
            font-weight: 600;
            font-size: 11.5px;
            letter-spacing: 0.02em;
            cursor: default;
        }

        /* Tooltip hint sur le header */
        .tomo-cpt-header[title] { cursor: help; }

        .tomo-cpt-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 8px;
            background: ${core.colors.bg};
            border-top: 1px solid ${core.colors.border};
            gap: 6px;
        }

        /* Ligne hachurée — En cours CP */
        .tomo-cpt-row.striped {
            background: repeating-linear-gradient(
                45deg,
                #fcf0c0,
                #fcf0c0 4px,
                #ffffff 4px,
                #ffffff 8px
            );
        }

        .tomo-cpt-lbl {
            color: #555;
            font-size: 11px;
            flex-shrink: 0;
            cursor: default;
        }

        /* Cursor help uniquement si un hint est présent */
        .tomo-cpt-lbl.has-hint { cursor: help; }

        /* Badge valeur simple */
        .tomo-cpt-val {
            font-weight: 600;
            font-size: 12px;
            background: rgba(0, 88, 112, 0.10);
            padding: 2px 8px;
            border-radius: 4px;
            min-width: 56px;
            text-align: center;
            white-space: nowrap;
            color: ${core.colors.text};
        }

        /* Paire de badges */
        .tomo-cpt-pair {
            display: flex;
            gap: 3px;
            align-items: center;
        }

        .tomo-cpt-pair-sep {
            color: #aaa;
            font-size: 10px;
        }

        .tomo-cpt-badge {
            font-weight: 600;
            font-size: 11.5px;
            background: rgba(0, 88, 112, 0.10);
            padding: 2px 6px;
            border-radius: 4px;
            min-width: 44px;
            text-align: center;
            white-space: nowrap;
            color: ${core.colors.text};
        }

        /* Couleurs */
        .c-positive { color: ${core.colors.green}; }
        .c-negative  { color: ${core.colors.red};   }
        .c-neutral   { color: ${core.colors.text};  }
        .c-solde     { color: ${core.colors.green}; }

        /* Crédit semaine */
        #tomo-week-section {
            margin-bottom: 7px;
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid ${core.colors.border};
        }

        #tomo-week-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 8px;
            background: ${core.colors.dblue};
            color: #fff;
            font-weight: 600;
            font-size: 11.5px;
        }

        #tomo-week-val {
            font-size: 13px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            background: rgba(255,255,255,0.15);
        }

        #tomo-week-val.c-positive { color: #7EE8A2; }
        #tomo-week-val.c-negative  { color: #F1948A; }

        /* Panel config */
        #tomo-cpt-config-panel {
            background: #f7f9ff;
            border: 1px solid ${core.colors.border};
            border-radius: 6px;
            padding: 8px 10px 4px;
            margin-bottom: 7px;
        }

        #tomo-cpt-config-panel label {
            display: flex;
            align-items: center;
            gap: 7px;
            margin-bottom: 5px;
            cursor: pointer;
            color: ${core.colors.text};
            font-size: 11.5px;
            user-select: none;
        }

        #tomo-cpt-config-panel input[type=checkbox] {
            accent-color: ${core.colors.dblue};
            cursor: pointer;
        }

        .tomo-cpt-loading {
            padding: 12px 8px;
            color: ${core.colors.cblue};
            text-align: center;
            font-size: 11px;
        }
    `;
    hbDoc.documentElement.appendChild(s);
}

// =======================================================
// WRAPPER
// =======================================================
function ensureWrapper(hbDoc, core) {
    if (hbDoc.getElementById('tomo-compteurs-wrap')) return;

    const main = hbDoc.querySelector('#T101Main');
    if (!main) return;

    const select = main.querySelector('#T101cboListeCompteurs');
    const detail = main.querySelector('.T101Detail');
    if (select) select.style.display = 'none';
    if (detail) detail.style.display = 'none';

    const wrap = hbDoc.createElement('div');
    wrap.id = 'tomo-compteurs-wrap';
    wrap.innerHTML = '<div class="tomo-cpt-loading">Chargement des compteurs…</div>';
    main.appendChild(wrap);

    injectStyles(hbDoc, core);
}

// =======================================================
// BOUTON ⚙ DANS LE TOPSTD
// =======================================================
// Le .TopStd est un conteneur float:left de 18px.
// Ses enfants directs sont tous float:left avec largeurs fixes :
//   .Icone : 22px
//   label  : calc(100% - 44px) en inline style (44 = 22 + 20 + 2)
//   .Menu  : 20px
//
// Pour insérer notre bouton sans casser le layout, on réduit
// dynamiquement la largeur inline du label de 20px supplémentaires,
// puis on insère le bouton (20px) juste avant .Menu.
function ensureConfigButton(hbDoc, wrap) {
    if (hbDoc.getElementById('tomo-cpt-config-btn')) return;

    // Ancre sur le label "Mes compteurs" pour cibler la bonne tuile
    const titleLabel = Array.from(hbDoc.querySelectorAll('label'))
        .find(el => el.title === 'Mes compteurs' || el.textContent.trim() === 'Mes compteurs');
    if (!titleLabel) return;

    const topStd = titleLabel.closest('.TopStd');
    if (!topStd) return;

    const menuDiv = topStd.querySelector('.Menu');
    if (!menuDiv) return;

    // Réduit le label de 20px pour faire de la place au bouton
    // Le label a déjà width: calc(100% - 44px) en inline style
    titleLabel.style.width = 'calc(100% - 64px)';

    // Crée le bouton séparé (20px, float:left, même hauteur que TopStd)
    const btn = hbDoc.createElement('div');
    btn.id = 'tomo-cpt-config-btn';
    btn.title = 'Préférences des compteurs';
    btn.textContent = '⚙';
    btn.style.width = '20px';
    btn.style.height = '18px';
    btn.style.float = 'left';
    btn.style.marginTop = '-6px';
    btn.style.cursor = 'pointer';

    // mousedown + preventDefault pour court-circuiter les handlers
    // SoHorsys qui écoutent sur click/mouseup au niveau du .Main ou .TopStd
    btn.addEventListener('mousedown', e => {
        e.stopPropagation();
        e.preventDefault();
    });

    btn.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        configPanelOpen = !configPanelOpen;
        const panel = hbDoc.getElementById('tomo-cpt-config-panel');
        if (panel) panel.style.display = configPanelOpen ? '' : 'none';
    });

    // Inséré juste avant .Menu, dans le même flux float
    menuDiv.insertAdjacentElement('beforebegin', btn);
}

// =======================================================
// PANEL CONFIG
// =======================================================
function ensureConfigPanel(wrap, prefs) {
    if (wrap.querySelector('#tomo-cpt-config-panel')) return;

    const options = [
        { key: 'showDC',          label: 'Débit-Crédit horaire' },
        { key: 'showCEM',         label: 'Congés enfant malade' },
        { key: 'showRECHS',       label: 'Récup hors salon' },
        { key: 'showRECS',        label: 'Récup salon' },
        { key: 'showDEL',         label: 'Délégations' },
        { key: 'hideIfZero',      label: 'Masquer si solde à zéro' },
    ];

    const panel = wrap.ownerDocument.createElement('div');
    panel.id = 'tomo-cpt-config-panel';
    panel.style.display = 'none';

    panel.innerHTML = options.map(o => `
        <label>
            <input type="checkbox" data-pref="${o.key}" ${prefs[o.key] ? 'checked' : ''}>
            ${o.label}
        </label>
    `).join('');

    panel.addEventListener('change', e => {
        const cb = e.target;
        if (!cb.dataset.pref) return;
        prefs[cb.dataset.pref] = cb.checked;
        savePrefs(prefs);
    });

    wrap.prepend(panel);
}

// =======================================================
// COLORISATION
// =======================================================
// Résout la classe CSS selon la colorRule et la valeur brute
function resolveColorClass(raw, colorRule, core) {
    if (!colorRule || colorRule === 'neutral') return 'c-neutral';

    const v = core.parseCounterValue(raw);
    if (v === null) return 'c-neutral';

    if (colorRule === 'signed') {
        if (v > 0) return 'c-positive';
        if (v < 0) return 'c-negative';
        return 'c-neutral';
    }

    if (colorRule === 'solde') {
        // Vert si positif (reste à prendre), neutre sinon
        return v > 0 ? 'c-solde' : 'c-neutral';
    }

    return 'c-neutral';
}

// =======================================================
// FORMAT VALEUR
// =======================================================
function formatValue(raw, isTime, core) {
    if (raw === undefined || raw === null) return '—';
    if (isTime) {
        const min = core.parseCounterValue(raw);
        if (min === null) return String(raw);
        return (min > 0 ? '+' : '') + core.minutesToTime(min);
    }
    // Décimal : afficher tel quel avec signe
    return String(raw);
}

// Formate une valeur calculée (nombre en minutes ou décimal)
function formatCalcValue(val, isTime, core) {
    if (val === null) return '—';
    if (isTime) {
        return (val > 0 ? '+' : '') + core.minutesToTime(Math.round(val));
    }
    // Décimal (jours)
    // val < 0 : le signe '-' est inclus dans toFixed() ; val == 0 : on affiche '+'
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toFixed(2).replace('.', ',')}`;
}

// =======================================================
// HIDE IF ZERO
// =======================================================
function isAllZero(data, def) {
    if (!data || !def.soldeKey) return true;
    const raw = data[def.soldeKey];
    if (!raw) return true;
    const v = parseFloat(String(raw).replace(',', '.').replace('+', ''));
    return isNaN(v) || v === 0;
}

// =======================================================
// RENDU D'UNE LIGNE
// =======================================================
function renderRow(row, data, core) {
    const stripeClass = row.striped ? ' striped' : '';
    const hintAttr    = row.hint ? ` title="${row.hint}"` : '';

    // Ligne calculée
    if (row.calc) {
        const val = row.calc(data, core);
        if (val === null) return '';
        const formatted  = formatCalcValue(val, row.isTime, core);
        const colorClass = resolveColorClass(String(val), row.colorRule || 'solde', core);
        return `
            <div class="tomo-cpt-row${stripeClass}"${hintAttr}>
                <span class="tomo-cpt-lbl${row.hint ? ' has-hint' : ''}">${row.display}</span>
                <span class="tomo-cpt-val ${colorClass}">${formatted}</span>
            </div>`;
    }

    // Ligne pairée
    if (row.left !== undefined) {
        const rawL = data[row.left];
        const rawR = data[row.right];
        if (rawL === undefined && rawR === undefined) return '';

        const valL  = formatValue(rawL, row.isTime, core);
        const valR  = formatValue(rawR, row.isTime, core);
        const clsL  = resolveColorClass(rawL, row.colorRuleL ?? (row.isTime ? 'signed' : 'neutral'), core);
        const clsR  = resolveColorClass(rawR, row.colorRuleR ?? (row.isTime ? 'signed' : 'neutral'), core);

        return `
            <div class="tomo-cpt-row${stripeClass}"${hintAttr}>
                <span class="tomo-cpt-lbl${row.hint ? ' has-hint' : ''}">${row.display}</span>
                <div class="tomo-cpt-pair">
                    <span class="tomo-cpt-badge ${clsL}">${valL}</span>
                    <span class="tomo-cpt-pair-sep">/</span>
                    <span class="tomo-cpt-badge ${clsR}">${valR}</span>
                </div>
            </div>`;
    }

    // Ligne simple
    const raw = data[row.src];
    if (raw === undefined) return '';

    const val      = formatValue(raw, row.isTime, core);
    const cls      = resolveColorClass(raw, row.colorRule ?? (row.isTime ? 'signed' : 'neutral'), core);

    return `
        <div class="tomo-cpt-row${stripeClass}"${hintAttr}>
            <span class="tomo-cpt-lbl${row.hint ? ' has-hint' : ''}">${row.display}</span>
            <span class="tomo-cpt-val ${cls}">${val}</span>
        </div>`;
}

// =======================================================
// RENDU D'UNE SECTION
// =======================================================
function renderSection(key, data, def, core) {
    const rows = def.rows.map(r => renderRow(r, data, core)).join('');
    if (!rows.trim()) return '';

    const hintAttr = def.hint ? ` title="${def.hint}"` : '';

    return `
        <div class="tomo-cpt-section">
            <div class="tomo-cpt-header" style="background:${def.color};"${hintAttr}>
                <span>${def.label}</span>
            </div>
            ${rows}
        </div>`;
}

// =======================================================
// RENDU CRÉDIT SEMAINE
// =======================================================
function renderWeekCredit(core) {
    const wc = core.computeWeekCredit();
    if (wc === null) return '';

    core.data.weekCredit = wc;

    const cls = wc > 0 ? 'c-positive' : wc < 0 ? 'c-negative' : 'c-neutral';
    const val = (wc > 0 ? '+' : '') + core.minutesToTime(wc);

    return `
        <div id="tomo-week-section">
            <div id="tomo-week-header">
                <span>Crédit semaine</span>
                <span id="tomo-week-val" class="${cls}">${val}</span>
            </div>
        </div>`;
}

// =======================================================
// RENDU COMPLET
// =======================================================
function renderAll(hbDoc, wrap, prefs, core) {
    // Bouton ⚙ dans le TopStd (une seule fois)
    ensureConfigButton(hbDoc, wrap);

    // Panel config dans le wrap (une seule fois)
    ensureConfigPanel(wrap, prefs);

    // Contenu dynamique
    let contentEl = wrap.querySelector('#tomo-cpt-content');
    if (!contentEl) {
        contentEl = wrap.ownerDocument.createElement('div');
        contentEl.id = 'tomo-cpt-content';
        wrap.appendChild(contentEl);
    }

    // Nettoie le message "Chargement…" si encore présent
    const loading = wrap.querySelector('.tomo-cpt-loading');
    if (loading) loading.remove();

    let html = '';

    // ToDo : ajouter l'heure de la dernière MAJ
    /*if (lastLoadTime) {
        const last = new Date(lastLoadTime);
        html += `
        <div class="tomo-cpt-section">
            <div class="tomo-cpt-header" style="background:${core.colors.cblue};font-size:10px;">
                Dernière mise à jour : ${last.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
            </div>
        </div>
        `;
    }*/

    html += renderWeekCredit(core);

    for (const key of DISPLAY_ORDER) {
        const def  = COUNTER_DEFS[key];
        const data = core.data.counters[key];

        if (!data) continue;
        if (def.prefKey && !prefs[def.prefKey]) continue;
        if (def.prefKey && prefs.hideIfZero && isAllZero(data, def)) continue;

        html += renderSection(key, data, def, core);
    }

    contentEl.innerHTML = html;
}

// =======================================================
// CHARGEMENT SÉQUENTIEL
// =======================================================
async function loadAllCounters(hbDoc, core) {
    if (isLoading) return;
    isLoading = true;

    const keys = DISPLAY_ORDER;

    for (const key of keys) {
        try {
            const data = await core.loadCounter(hbDoc, key);
            core.data.counters[key] = data;
        } catch (e) {
            console.warn('[tomo-compteurs] error', key, e);
        }
    }

    isLoading = false;
    lastLoadTime = Date.now();
}

// =======================================================
// BOUCLE PRINCIPALE
// =======================================================
// Deux boucles séparées pour éviter que le chargement AJAX (lent)
// ne bloque le rendu (rapide) :
//
//   renderTimer : toutes les 1s — met à jour l'affichage
//                 (crédit semaine en temps réel, états visuels)
//
//   loadTimer   : toutes les 60s — déclenche le chargement AJAX
//                 des compteurs SoHorsys (6 appels séquentiels)
//
// Le premier chargement AJAX est lancé immédiatement au démarrage,
// sans attendre le premier tick de loadTimer.
function startLoop(core) {
    if (timer) return;

    const prefs = loadPrefs();

    // --- Boucle de rendu (synchrone, légère) ---
    const renderTick = () => {
        const hbDoc = core.getHbDoc();
        if (!hbDoc) return;

        // Crée le wrapper si l'iframe vient d'apparaître
        ensureWrapper(hbDoc, core);

        const wrap = hbDoc.getElementById('tomo-compteurs-wrap');
        if (!wrap) return;

        // Ne rend que si des données sont disponibles
        if (core.data.counters && Object.keys(core.data.counters).length) {
            renderAll(hbDoc, wrap, prefs, core);
        }
    };

    const loadTick = () => {
        const hbDoc = core.getHbDoc();
        if (!hbDoc) return;

        if (loadLock) return; // empêche empilement

        loadLock = true;

        loadAllCounters(hbDoc, core)
            .finally(() => {
            loadLock = false;
        });
    };

    const start = () => {
        // Premier chargement immédiat
        loadTick();

        // Rendu toutes les secondes
        timer = setInterval(renderTick, core.config.refreshRate);

        // Rechargement AJAX toutes les 60s
        //setInterval(loadTick, RELOAD_INTERVAL);
        setInterval(() => {
            loadTick();
        }, RELOAD_INTERVAL);

    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
}

})();