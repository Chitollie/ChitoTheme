/**
 * @name ChitoThemePicker
 * @displayName Chito Theme Picker
 * @description Adds a settings button to Discord's top bar to switch between Beige, Blue and Purple themes.
 * @author chitollie
 * @version 1.2.0
 * @website https://chitollie.netlify.app
 * @source https://github.com/Chitollie/ChitoTheme
 */


const fs = require("fs");
const path = require("path");

const BASE_URL = "https://raw.githubusercontent.com/Chitollie/ChitoTheme/main";
const PLUGIN_URL = `${BASE_URL}/ChitoThemePicker.plugin.js`;
const PLUGIN_FILE = "ChitoThemePicker.plugin.js";
const THEME_URL = `${BASE_URL}/chito.theme.css`;
const THEME_FILE = "chito.theme.css";
const THEME_NAME = "Chito";

module.exports = class ChitoThemePicker {
    constructor() {
        this.pluginName = "ChitoThemePicker";
        this.theme = "beige";
        this.observer = null;
        this.button = null;
        this.modal = null;
        this.syncQueued = false;
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    start() {
        const stored = BdApi.Data.load(this.pluginName, "theme");
        this.theme = ["beige", "blue", "purple"].includes(stored) ? stored : "beige";
        this.applyTheme(this.theme, false);

        BdApi.DOM.addStyle(this.pluginName, `
            #chito-theme-button {
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: var(--interactive-normal, var(--text-4));
                width: 32px;
                height: 32px;
                border: 0;
                padding: 4px;
                background: transparent;
                border-radius: 6px;
                flex: 0 0 auto;
            }

            #chito-theme-button:hover {
                color: var(--interactive-hover, var(--text-1));
                background: var(--hover);
            }

            #chito-theme-button svg {
                width: 24px;
                height: 24px;
            }

            #chito-theme-overlay {
                position: fixed;
                inset: 0;
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(0, 0, 0, .55);
            }

            #chito-theme-modal {
                box-sizing: border-box;
                width: min(560px, calc(100vw - 32px));
                max-height: calc(100vh - 40px);
                overflow: auto;
                border-radius: 14px;
                padding: 22px;
                background: var(--bg-4, #f1ede3);
                color: var(--text-1, #302c22);
                border: 1px solid var(--border, #aaa);
                box-shadow: 0 16px 55px rgba(0, 0, 0, .25);
            }

            .chito-modal-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 6px;
            }

            .chito-modal-head h2 {
                font-size: 20px;
                margin: 0;
            }

            .chito-modal-close {
                border: 0;
                border-radius: 7px;
                padding: 5px 10px;
                cursor: pointer;
                color: inherit;
                background: var(--bg-2);
                font-size: 20px;
            }

            .chito-modal-subtitle {
                color: var(--text-3);
                margin: 0 0 18px;
                font-size: 13px;
            }

            .chito-theme-grid {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 12px;
            }

            .chito-theme-card {
                text-align: left;
                min-width: 0;
                cursor: pointer;
                background: var(--bg-3);
                color: inherit;
                border: 2px solid transparent;
                border-radius: 10px;
                padding: 8px;
                font: inherit;
            }

            .chito-theme-card:hover {
                border-color: var(--accent-2);
            }

            .chito-theme-card[aria-pressed="true"] {
                border-color: var(--accent-3);
            }

            .chito-theme-preview {
                display: block;
                width: 100%;
                aspect-ratio: 1.45;
                background-size: cover;
                background-position: center;
                border-radius: 7px;
                margin-bottom: 10px;
            }

            .chito-theme-name {
                display: block;
                font-size: 14px;
                font-weight: 700;
            }

            .chito-theme-desc {
                display: block;
                font-size: 11px;
                color: var(--text-3);
                line-height: 1.4;
                margin-top: 3px;
            }

            @media (max-width: 480px) {
                .chito-theme-grid {
                    grid-template-columns: 1fr;
                }

                .chito-theme-preview {
                    aspect-ratio: 3;
                }
            }
        `);

        this.observer = new MutationObserver(() => this.scheduleSync());
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        document.addEventListener("keydown", this.onKeyDown);
        this.syncButton();
        this.checkDependencies();
    }

    stop() {
        this.observer?.disconnect();
        this.observer = null;
        document.removeEventListener("keydown", this.onKeyDown);
        this.closeModal();
        this.button?.remove();
        this.button = null;
        BdApi.DOM.removeStyle(this.pluginName);
        document.documentElement.removeAttribute("data-chito-theme");
    }

    // ---------- Thème + mises à jour ----------

    async checkDependencies() {
        try {
            // Le thème d'abord, le plugin en dernier : mettre à jour le plugin le recharge,
            // donc on veut avoir fini tout le reste avant.
            await this.ensureTheme();
            await this.updateFile({
                label: "Chito Theme Picker",
                file: path.join(BdApi.Plugins.folder, PLUGIN_FILE),
                url: PLUGIN_URL,
                check: "@name ChitoThemePicker"
            });
        } catch (e) {
            console.warn(`${this.pluginName} : vérification impossible`, e);
        }
    }

    // Retrouve le thème Chito dans BetterDiscord (même si son fichier a un autre nom)
    findTheme() {
        try {
            return BdApi.Themes.getAll().find(t => t.name === THEME_NAME || t.id === THEME_NAME) || null;
        } catch (e) {
            return null;
        }
    }

    async ensureTheme() {
        const theme = this.findTheme();

        // 1. Thème absent -> on propose de l'installer
        if (!theme) {
            const code = await this.fetchText(THEME_URL);
            if (!code.includes(`@name ${THEME_NAME}`)) return;

            const ok = await this.ask(
                "Thème requis",
                "Chito Theme Picker a besoin du thème « Chito » pour fonctionner. Installer le thème maintenant ?",
                "Installer"
            );
            if (!ok) return;

            fs.writeFileSync(path.join(BdApi.Themes.folder, THEME_FILE), code);
            BdApi.UI.showToast("Thème Chito installé !", { type: "success" });
            // BetterDiscord met un instant à repérer le nouveau fichier avant qu'on puisse l'activer
            setTimeout(() => {
                try { BdApi.Themes.enable(THEME_NAME); } catch (e) {}
            }, 2000);
            return;
        }

        // 2. Thème présent mais désactivé -> on propose de l'activer
        if (!BdApi.Themes.isEnabled(THEME_NAME)) {
            const ok = await this.ask(
                "Thème désactivé",
                "Le thème « Chito » est installé mais désactivé : les couleurs ne changeront pas. L'activer ?",
                "Activer"
            );
            if (ok) BdApi.Themes.enable(THEME_NAME);
        }

        // 3. Thème présent -> on regarde s'il y a une mise à jour
        await this.updateFile({
            label: "Thème Chito",
            file: path.join(BdApi.Themes.folder, theme.filename || THEME_FILE),
            url: THEME_URL,
            check: `@name ${THEME_NAME}`
        });
    }

    // Compare le @version local et celui de GitHub, puis propose la mise à jour
    async updateFile({ label, file, url, check }) {
        const local = this.getVersion(fs.readFileSync(file, "utf8"));
        const code = await this.fetchText(url);
        const online = this.getVersion(code);

        // Sécurité : on n'écrase rien si le fichier téléchargé n'est pas le bon
        if (!local || !online || !code.includes(check)) return;
        if (!this.isNewer(online, local)) return;

        const ok = await this.ask(
            "Mise à jour disponible",
            `${label} ${online} est disponible (tu as la ${local}).`,
            "Mettre à jour"
        );
        if (!ok) return;

        fs.writeFileSync(file, code); // BetterDiscord recharge le fichier tout seul
        BdApi.UI.showToast(`${label} mis à jour !`, { type: "success" });
    }

    async fetchText(url) {
        const res = await fetch(`${url}?t=${Date.now()}`); // ?t= : évite une vieille copie en cache
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
    }

    getVersion(code) {
        return code.match(/@version\s+([\d.]+)/)?.[1];
    }

    // showConfirmationModal transformée en "await" : renvoie true (confirmé) ou false (plus tard)
    ask(title, content, confirmText) {
        return new Promise(resolve => {
            BdApi.UI.showConfirmationModal(title, content, {
                confirmText,
                cancelText: "Plus tard",
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });
        });
    }

    isNewer(a, b) {
        const pa = a.split(".").map(Number);
        const pb = b.split(".").map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            if ((pa[i] || 0) > (pb[i] || 0)) return true;
            if ((pa[i] || 0) < (pb[i] || 0)) return false;
        }
        return false;
    }

    applyTheme(theme, persist = true) {
        if (!["beige", "blue", "purple"].includes(theme)) return;

        this.theme = theme;
        document.documentElement.setAttribute("data-chito-theme", theme);

        if (persist) {
            BdApi.Data.save(this.pluginName, "theme", theme);
        }
    }

    scheduleSync() {
        if (this.syncQueued) return;

        this.syncQueued = true;

        requestAnimationFrame(() => {
            this.syncQueued = false;

            if (this.observer) {
                this.syncButton();
            }
        });
    }

    syncButton() {
        const inbox = document.querySelector(
            '[role="button"][aria-label="Inbox"], [role="button"][aria-label="Boîte de réception"]'
        );

        if (!inbox?.parentElement) return;

        if (
            this.button?.isConnected &&
            this.button.previousElementSibling === inbox
        ) return;

        if (!this.button) {
            this.button = document.createElement("button");
            this.button.id = "chito-theme-button";
            this.button.type = "button";
            this.button.setAttribute("aria-label", "Chito theme settings");
            this.button.title = "Thèmes Chito";

            this.button.innerHTML = `
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                >
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>
                </svg>
            `;

            this.button.addEventListener("click", () => this.openModal());
        }

        inbox.after(this.button);
    }

    onKeyDown(event) {
        if (event.key === "Escape" && this.modal) {
            this.closeModal();
        }
    }

    closeModal() {
        this.modal?.remove();
        this.modal = null;
    }

    openModal() {
        if (this.modal) return;

        const overlay = document.createElement("div");
        overlay.id = "chito-theme-overlay";

        overlay.addEventListener("click", event => {
            if (event.target === overlay) {
                this.closeModal();
            }
        });

        const modal = document.createElement("section");
        modal.id = "chito-theme-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-label", "Chito theme settings");

        const head = document.createElement("div");
        head.className = "chito-modal-head";

        const title = document.createElement("h2");
        title.textContent = "Chito theme";

        const close = document.createElement("button");
        close.className = "chito-modal-close";
        close.textContent = "×";
        close.setAttribute("aria-label", "Fermer");
        close.addEventListener("click", () => this.closeModal());

        head.append(title, close);

        const subtitle = document.createElement("p");
        subtitle.className = "chito-modal-subtitle";
        subtitle.textContent = "Choose your theme and wallpaper.";

        const grid = document.createElement("div");
        grid.className = "chito-theme-grid";

        const themes = [
            {
                id: "beige",
                name: "Beige",
                desc: "A floral beige theme",
                image: "https://i.pinimg.com/736x/d6/47/9c/d6479caf3fd026bfc1c158b3d829aac1.jpg",
                color: "#f1ede3"
            },
            {
                id: "blue",
                name: "Blue",
                desc: "A baby blue theme",
                image: "https://files.catbox.moe/hjqg5r.png",
                color: "#e0effb"
            },
            {
                id: "purple",
                name: "Purple",
                desc: "A purple with a touch of pink theme",
                image: "https://files.catbox.moe/0tf97j.png",
                color: "#efe2f7"
            }
        ];

        for (const item of themes) {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "chito-theme-card";
            card.setAttribute(
                "aria-pressed",
                String(this.theme === item.id)
            );

            const preview = document.createElement("span");
            preview.className = "chito-theme-preview";
            preview.style.backgroundColor = item.color;
            preview.style.backgroundImage =
                `linear-gradient(0deg, ${item.color}55, transparent), url("${item.image}")`;

            const name = document.createElement("span");
            name.className = "chito-theme-name";
            name.textContent = item.name;

            const desc = document.createElement("span");
            desc.className = "chito-theme-desc";
            desc.textContent = item.desc;

            card.append(preview, name, desc);

            card.addEventListener("click", () => {
                this.applyTheme(item.id);

                for (const other of grid.children) {
                    other.setAttribute(
                        "aria-pressed",
                        String(other === card)
                    );
                }
            });

            grid.append(card);
        }

        modal.append(head, subtitle, grid);
        overlay.append(modal);
        document.body.append(overlay);

        this.modal = overlay;
        close.focus();
    }
};
