importScripts("../shared/settings.js");

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

function sendStatus(port, message) {
    try {
        port.postMessage(message);
    } catch {
        // The operation should continue if the user closes the popup.
    }
}

// Esta função será injetada e executada diretamente dentro da página do Maestra
function selecionarPortuguesNoMaestra() {
    const interval = setInterval(() => {
        const seletores = Array.from(document.querySelectorAll('button, div, span'));
        const botaoIdioma = seletores.find(el => 
            el.textContent.includes("Detect Language") || 
            el.textContent.includes("Language") ||
            el.textContent.includes("Spanish")
        );

        if (botaoIdioma) {
            botaoIdioma.click(); // Abre o menu de idiomas

            setTimeout(() => {
                const opcoes = Array.from(document.querySelectorAll('li, button, div, span'));
                const opcaoPortugues = opcoes.find(el => el.textContent.trim() === "Portuguese");

                if (opcaoPortugues) {
                    opcaoPortugues.click(); // Seleciona o Português
                    clearInterval(interval);
                }
            }, 300);
        }
    }, 500);

    setTimeout(() => clearInterval(interval), 10000); // Segurança de 10s
}

async function clearBrowsingData(port, tab) {
    try {
        if (!Number.isInteger(tab?.id) || !tab.url) {
            throw new Error("The active tab is unavailable.");
        }

        const url = new URL(tab.url);

        if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
            throw new Error("Browsing data cannot be cleared for this page.");
        }

        sendStatus(port, {
            state: "step-active",
            step: "preferences"
        });

        const { dataTypes = DEFAULT_DATA_TYPES } = await chrome.storage.sync.get({
            dataTypes: DEFAULT_DATA_TYPES
        });
        const selections = Object.fromEntries(
            DATA_TYPE_OPTIONS.map(({ key }) => [key, dataTypes[key] !== false])
        );
        const selectedKeys = DATA_TYPE_OPTIONS
            .map(({ key }) => key)
            .filter((key) => selections[key]);

        sendStatus(port, {
            state: "step-complete",
            step: "preferences"
        });

        if (selectedKeys.length === 0) {
            throw new Error("Select at least one data type in the extension options.");
        }

        sendStatus(port, {
            state: "step-active",
            step: "clearing"
        });

        await chrome.browsingData.remove(
            { origins: [url.origin] },
            selections
        );

        sendStatus(port, {
            state: "step-complete",
            step: "clearing"
        });

        sendStatus(port, {
            state: "step-active",
            step: "reload"
        });

        // Configura o ouvinte ANTES de recarregar a página para capturar o momento exato do carregamento
        chrome.tabs.onUpdated.addListener(function listenReload(tabId, changeInfo) {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listenReload);

                // Dispara o injetor automático se o domínio for o Maestra
                if (url.hostname.includes("maestra.ai")) {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: selecionarPortuguesNoMaestra
                    }).catch(err => console.error("Erro ao injetar script:", err));
                }
            }
        });

        await chrome.tabs.reload(tab.id);

        sendStatus(port, {
            state: "step-complete",
            step: "reload"
        });

        sendStatus(port, {
            state: "done"
        });
    } catch (error) {
        sendStatus(port, {
            state: "error",
            message: error instanceof Error ? error.message : "The operation failed."
        });
    }
}

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "clear-browsing-data") {
        return;
    }

    let started = false;

    port.onMessage.addListener((message) => {
        if (started || message?.type !== "clear") {
            return;
        }

        started = true;
        void clearBrowsingData(port, message.tab);
    });
});
