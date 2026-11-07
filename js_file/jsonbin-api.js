window.NGC_API_CONFIG = Object.freeze({
    binId: '6aeca593ac6210605a6fa81f',
    masterKey: '$2a$10$B9j5yKhIwDysYmdTVdLh2eYE/2IIcd5inVVdA55qQnzO3Hm5aXkCm'
});

window.NGC_API = (() => {
    const config = window.NGC_API_CONFIG;
    const storageKey = 'ngc_jsonbin_db_v1';

    function isConfigured() {
        return Boolean(config.binId && config.masterKey && !String(config.binId).includes('SEU_'));
    }

    function getCachedDatabase() {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch (error) {
            console.error('O cache local do banco está inválido.', error);
            return null;
        }
    }

    async function loadDatabase() {
        if (!isConfigured()) {
            window.NGC_API.lastSource = 'local';
            return getCachedDatabase();
        }

        try {
            const response = await fetch(`https://api.jsonbin.io/v3/b/${config.binId}/latest`, {
                method: 'GET',
                headers: {
                    'X-Master-Key': config.masterKey,
                    'X-Bin-Meta': 'false'
                }
            });

            if (!response.ok) throw new Error(`JSONBin respondeu ${response.status}`);

            const result = await response.json();
            const database = result.record;
            if (!database || typeof database !== 'object') {
                throw new Error('O JSONBin retornou um registro inválido.');
            }

            localStorage.setItem(storageKey, JSON.stringify(database));
            window.NGC_API.lastSource = 'jsonbin';
            return database;
        } catch (error) {
            const cachedDatabase = getCachedDatabase();
            if (cachedDatabase) {
                console.warn('JSONBin indisponível; usando o último cache local.', error);
                window.NGC_API.lastSource = 'local';
                return cachedDatabase;
            }

            console.warn('JSONBin ainda não possui dados disponíveis.', error);
            window.NGC_API.lastSource = 'unavailable';
            return null;
        }
    }

    async function saveDatabase(database) {
        if (!isConfigured()) {
            throw new Error('JSONBin não está configurado. Configure o binId e a masterKey em js_file/jsonbin-api.js.');
        }

        const response = await fetch(`https://api.jsonbin.io/v3/b/${config.binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': config.masterKey
            },
            body: JSON.stringify(database)
        });

        if (!response.ok) {
            throw new Error(`Não foi possível salvar os dados no JSONBin (HTTP ${response.status}).`);
        }

        localStorage.setItem(storageKey, JSON.stringify(database));
        window.NGC_API.lastSource = 'jsonbin';
        return database;
    }

    return {
        isConfigured,
        loadDatabase,
        saveDatabase,
        lastSource: 'unknown'
    };
})();
