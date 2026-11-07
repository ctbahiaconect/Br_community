window.NGC_CONFIG = window.NGC_CONFIG || {
    whatsappNumber: '71981547408',
    whatsappMessage: 'Olá! Gostaria de comprar um ingresso para o próximo espetáculo.',
    defaultAdmin: {
        username: 'user83809q8wed',
        passwordHash: 'pbkdf2$310000$d946c713e6d7de2d6ca9d306939cf3cc$7ee1716e8d0806893ae159733e63e2ea440c4e31b16cf856f7006b9092bf0b98',
        name: 'Administrador'
    }
};

const DB_KEY = 'ngc_jsonbin_db_v1';
const DEFAULT_DB = {
    admins: [window.NGC_CONFIG.defaultAdmin],
    customers: [],
    purchases: [],
    settings: {
        whatsappNumber: '71981547408',
        whatsappMessage: 'Olá! Gostaria de comprar um ingresso para o próximo espetáculo.'
    }
};

function normalizeDatabase(db) {
    const config = window.NGC_CONFIG || {};
    const defaultAdmin = config.defaultAdmin;
    const admins = Array.isArray(db?.admins) && db.admins.length
        ? db.admins
        : [defaultAdmin];
    const purchases = Array.isArray(db?.purchases) ? db.purchases : [];
    const customers = Array.isArray(db?.customers) ? db.customers.filter((customer) => (
        customer && typeof customer === 'object'
    )) : [];

    purchases.forEach((purchase) => {
        const phone = String(purchase.phone || '').replace(/\D/g, '');
        const email = String(purchase.email || '').trim().toLocaleLowerCase('pt-BR');
        const existingCustomer = customers.find((customer) => (
            (phone && String(customer.phone || '').replace(/\D/g, '') === phone)
            || (email && String(customer.email || '').trim().toLocaleLowerCase('pt-BR') === email)
        ));
        if (existingCustomer) {
            if (!purchase.customerId) purchase.customerId = existingCustomer.id;
            return;
        }

        const customer = {
            id: purchase.customerId || `legacy-${purchase.ticketCode || purchase.id || customers.length + 1}`,
            name: String(purchase.customerName || '').trim(),
            phone: String(purchase.phone || '').trim(),
            email: String(purchase.email || '').trim(),
            createdAt: purchase.purchaseDate || new Date().toISOString()
        };
        purchase.customerId = customer.id;
        customers.push(customer);
    });

    return {
        admins,
        customers,
        purchases,
        settings: {
            ...DEFAULT_DB.settings,
            ...(db?.settings || {}),
            whatsappNumber: config.whatsappNumber || DEFAULT_DB.settings.whatsappNumber,
            whatsappMessage: config.whatsappMessage || DEFAULT_DB.settings.whatsappMessage
        }
    };
}

function getDbFromStorage() {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return normalizeDatabase(DEFAULT_DB);

    try {
        return normalizeDatabase(JSON.parse(raw));
    } catch (error) {
        return normalizeDatabase(DEFAULT_DB);
    }
}

async function loadDatabase() {
    const storedDatabase = await window.NGC_API.loadDatabase();
    return normalizeDatabase(storedDatabase || getDbFromStorage());
}

async function saveDatabase(db) {
    return window.NGC_API.saveDatabase(db);
}

function generateTicketCode() {
    const randomBytes = crypto.getRandomValues(new Uint8Array(4));
    const suffix = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `NGC-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

function generateCustomerId() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return `CLI-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function formatDate(dateString) {
    if (!dateString) return 'Data não informada';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

const ADMIN_SESSION_KEY = 'ngc_admin_session';
const ADMIN_SESSION_DURATION = 30 * 60 * 1000;

function setCurrentAdmin(username) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
        username: username || '',
        expiresAt: Date.now() + ADMIN_SESSION_DURATION
    }));
}

function refreshAdminSession() {
    try {
        const session = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || 'null');
        if (session?.username) {
            session.expiresAt = Date.now() + ADMIN_SESSION_DURATION;
            sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
        }
    } catch (error) {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
    }
}

function isAdminLoggedIn() {
    try {
        const session = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || 'null');
        if (!session?.username || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
            sessionStorage.removeItem(ADMIN_SESSION_KEY);
            return false;
        }
        return true;
    } catch (error) {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        return false;
    }
}

function logoutAdmin() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.location.href = 'lo_89723.html';
}

async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt,
        iterations: 310000,
        hash: 'SHA-256'
    }, key, 256);
    const saltHex = Array.from(salt, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const hashHex = Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `pbkdf2$310000$${saltHex}$${hashHex}`;
}

async function verifyPassword(password, passwordHash) {
    if (typeof passwordHash !== 'string') return false;
    const [algorithm, iterationText, saltHex, expectedHash] = passwordHash.split('$');
    const iterations = Number(iterationText);
    if (algorithm !== 'pbkdf2' || !Number.isSafeInteger(iterations) || iterations < 100000 || iterations > 1000000
        || !/^[a-f0-9]{32}$/i.test(saltHex || '') || !/^[a-f0-9]{64}$/i.test(expectedHash || '')) {
        return false;
    }

    const salt = new Uint8Array(saltHex.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
    }, key, 256);
    const actualHash = Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('');
    let difference = 0;
    for (let index = 0; index < expectedHash.length; index += 1) {
        difference |= expectedHash.charCodeAt(index) ^ actualHash.charCodeAt(index);
    }
    return difference === 0;
}

async function initLoginPage() {
    const form = document.getElementById('admin-login-form');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const message = document.getElementById('login-message');
        const submitButton = form.querySelector('[type="submit"]');
        message.textContent = '';
        message.classList.remove('error');
        submitButton.disabled = true;

        try {
            if (!crypto?.subtle) throw new Error('Este navegador não oferece suporte à validação segura da senha. Acesse o site por HTTPS.');
            const db = await loadDatabase();
            const admin = (db.admins || []).find((item) => item.username === username);
            const isValidPassword = admin?.passwordHash
                ? await verifyPassword(password, admin.passwordHash)
                : Boolean(admin?.password && admin.password === password);

            if (!admin || !isValidPassword) {
                message.textContent = 'Usuário ou senha inválidos.';
                message.classList.add('error');
                return;
            }

            let needsMigration = false;
            if (!admin.passwordHash) {
                admin.passwordHash = await hashPassword(password);
                needsMigration = true;
            }
            if (Object.hasOwn(admin, 'password')) {
                delete admin.password;
                needsMigration = true;
            }
            if (needsMigration || window.NGC_API.lastSource !== 'jsonbin') {
                await saveDatabase(db);
            }

            setCurrentAdmin(admin.username);
            window.location.href = 'dat_99328.html';
        } catch (error) {
            console.error('Falha ao autenticar o administrador.', error);
            message.textContent = error.message || 'Não foi possível validar o acesso. Tente novamente.';
            message.classList.add('error');
        } finally {
            submitButton.disabled = false;
        }
    });

    const togglePassword = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');
    togglePassword?.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        togglePassword.setAttribute('aria-label', isPassword ? 'Ocultar senha' : 'Mostrar senha');
        togglePassword.innerHTML = `<i class="fas ${isPassword ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
    });
}

let adminPurchaseCache = [];

function renderAdminRows(searchTerm = '') {
    const table = document.getElementById('purchase-table');
    const emptyState = document.getElementById('purchase-empty');
    const noResults = document.getElementById('purchase-no-results');
    const resultCount = document.getElementById('search-result-count');
    if (!table) return;

    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const purchases = adminPurchaseCache.filter((purchase) => {
        const searchable = [purchase.ticketCode, purchase.id, purchase.customerName, purchase.phone]
            .map((value) => String(value || '').toLocaleLowerCase('pt-BR'));
        return searchable.some((value) => value.includes(query));
    });

    if (!adminPurchaseCache.length) {
        table.innerHTML = '';
        emptyState.style.display = 'block';
        noResults.style.display = 'none';
        resultCount.textContent = '';
        return;
    }
            emptyState.style.display = 'none';
            noResults.style.display = purchases.length ? 'none' : 'block';
            resultCount.textContent = `${purchases.length} ingresso${purchases.length === 1 ? '' : 's'} encontrado${purchases.length === 1 ? '' : 's'}.`;
            if (!purchases.length) {
                table.innerHTML = '';
                return;
            }

            table.innerHTML = purchases.map((purchase) => `
                <tr>
                    <td>${escapeHtml(purchase.customerName)}</td>
                    <td>${escapeHtml(purchase.phone)}</td>
                    <td>${escapeHtml(purchase.eventName)}</td>
                    <td>${escapeHtml(purchase.ticketType)}</td>
                    <td>${escapeHtml(purchase.ticketCode || purchase.id)}</td>
                    <td><a href="ingresso.html?code=${encodeURIComponent(purchase.ticketCode || '')}" target="_blank" rel="noreferrer">Abrir</a></td>
                    <td><button type="button" class="admin-receipt" data-receipt-code="${escapeHtml(purchase.ticketCode || purchase.id)}">Baixar PDF</button></td>
                    <td><button type="button" class="admin-delete" data-ticket-code="${escapeHtml(purchase.ticketCode || purchase.id)}" aria-label="Excluir ingresso de ${escapeHtml(purchase.customerName)}">Excluir</button></td>
                </tr>
            `).join('');
        }

        async function renderAdminTable(searchTerm) {
            try {
                const db = await loadDatabase();
                adminPurchaseCache = Array.isArray(db.purchases) ? db.purchases : [];
                updateRaffleEvents();
                updateAdminSummary(db);
                updateDatabaseStatus();
                const search = document.getElementById('purchase-search');
                renderAdminRows(searchTerm ?? search?.value ?? '');
            } catch (error) {
                console.error('Não foi possível carregar o painel administrativo.', error);
                const statusText = document.getElementById('database-status-text');
                if (statusText) statusText.textContent = 'Falha ao carregar os dados';
                document.getElementById('database-status')?.classList.add('is-error');
            }
        }

        function updateAdminSummary(database) {
            const purchases = database.purchases;
            const quantityFor = (purchase) => {
                const quantity = Number(purchase.quantity);
                return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
            };
            const total = purchases.reduce((sum, purchase) => sum + quantityFor(purchase), 0);
            const confirmed = purchases
                .filter((purchase) => (purchase.status || 'confirmado') === 'confirmado')
                .reduce((sum, purchase) => sum + quantityFor(purchase), 0);
            const pending = purchases
                .filter((purchase) => purchase.status === 'pendente')
                .reduce((sum, purchase) => sum + quantityFor(purchase), 0);
            document.getElementById('summary-total').textContent = String(total);
            document.getElementById('summary-confirmed').textContent = String(confirmed);
            document.getElementById('summary-pending').textContent = String(pending);
            document.getElementById('summary-customers').textContent = String(database.customers.length);
        }

        function updateDatabaseStatus() {
            const status = document.getElementById('database-status');
            const statusText = document.getElementById('database-status-text');
            if (!status || !statusText) return;

            status.classList.remove('is-error', 'is-local');
            if (window.NGC_API.lastSource === 'jsonbin') {
                statusText.textContent = 'Sincronizado com JSONBin';
            } else if (window.NGC_API.lastSource === 'unavailable') {
                status.classList.add('is-error');
                statusText.textContent = 'JSONBin indisponível';
            } else {
                status.classList.add('is-local');
                statusText.textContent = 'Usando dados locais';
            }
        }

        function updateRaffleEvents() {
            const eventSelect = document.getElementById('raffle-event');
            if (!eventSelect) return;

            const selectedEvent = eventSelect.value;
            const events = [...new Set(adminPurchaseCache
                .map((purchase) => String(purchase.eventName || '').trim())
                .filter(Boolean))]
                .sort((first, second) => first.localeCompare(second, 'pt-BR'));

            eventSelect.innerHTML = '<option value="">Todos os eventos</option>' + events
                .map((eventName) => `<option value="${escapeHtml(eventName)}">${escapeHtml(eventName)}</option>`)
                .join('');

            if (events.includes(selectedEvent)) eventSelect.value = selectedEvent;
        }

        function drawRaffleWinner() {
            const eventSelect = document.getElementById('raffle-event');
            const result = document.getElementById('raffle-result');
            const selectedEvent = eventSelect?.value || '';
            const eligiblePurchases = adminPurchaseCache
                .filter((purchase) => (purchase.status || 'confirmado') === 'confirmado'
                    && (!selectedEvent || String(purchase.eventName || '').trim() === selectedEvent))
                .map((purchase) => {
                    const quantity = Number(purchase.quantity);
                    return {
                        purchase,
                        quantity: Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1
                    };
                });
            const totalEntries = eligiblePurchases.reduce((total, entry) => total + entry.quantity, 0);

            if (!totalEntries) {
                result.textContent = 'Não há ingressos confirmados para este sorteio.';
                result.classList.add('raffle-result-empty');
                return;
            }

            const winningNumber = Math.floor(Math.random() * totalEntries) + 1;
            let remainingNumber = winningNumber;
            let winner;

            for (const entry of eligiblePurchases) {
                if (remainingNumber <= entry.quantity) {
                    winner = entry.purchase;
                    break;
                }
                remainingNumber -= entry.quantity;
            }

            result.classList.remove('raffle-result-empty');
            result.innerHTML = `
                <p class="raffle-number">Número sorteado <strong>${winningNumber}</strong> de ${totalEntries}</p>
                <p class="raffle-winner-label">Cliente sorteado</p>
                <h3>${escapeHtml(winner.customerName || 'Cliente sem nome')}</h3>
                <p>${escapeHtml(winner.eventName || 'Evento')} · ${escapeHtml(winner.ticketType || 'Ingresso')}</p>
            `;
        }

        function downloadPurchaseReceipt(purchase) {
            const PdfDocument = window.jspdf?.jsPDF;
            if (!PdfDocument) {
                alert('Não foi possível carregar o gerador de PDF. Verifique sua conexão e tente novamente.');
                return;
            }

            const pdf = new PdfDocument();
            const pageWidth = pdf.internal.pageSize.getWidth();
            pdf.setFillColor(20, 20, 20);
            pdf.rect(0, 0, pageWidth, 42, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(18);
            pdf.text('NOVA GERACAO EM CENA', 18, 20);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            pdf.text('Comprovante de ingresso', 18, 31);

            pdf.setDrawColor(193, 0, 0);
            pdf.setLineWidth(1.2);
            pdf.roundedRect(18, 56, pageWidth - 36, 165, 3, 3, 'S');
            pdf.setTextColor(30, 30, 30);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(16);
            pdf.text(String(purchase.eventName || 'Evento'), 28, 72, { maxWidth: pageWidth - 56 });

            const fields = [
                ['Cliente', purchase.customerName],
                ['Telefone', purchase.phone],
                ['E-mail', purchase.email || 'Nao informado'],
                ['Tipo', purchase.ticketType || 'Inteira'],
                ['Quantidade', purchase.quantity || 1],
                ['Data', formatDate(purchase.purchaseDate)],
                ['Status', purchase.status || 'confirmado']
            ];
            let y = 91;
            pdf.setFontSize(11);
            fields.forEach(([label, value]) => {
                pdf.setFont('helvetica', 'bold');
                pdf.text(`${label}:`, 28, y);
                pdf.setFont('helvetica', 'normal');
                pdf.text(String(value), 65, y, { maxWidth: pageWidth - 93 });
                y += 16;
            });

            pdf.setFillColor(248, 245, 238);
            pdf.roundedRect(28, 194, pageWidth - 56, 17, 2, 2, 'F');
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(12);
            pdf.setTextColor(120, 0, 0);
            pdf.text(`ID DO INGRESSO: ${String(purchase.ticketCode || purchase.id || '')}`, 34, 205);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(100, 100, 100);
            pdf.text('Apresente este comprovante na entrada do evento.', 18, 240);

            const filename = String(purchase.ticketCode || purchase.id || 'ingresso').replace(/[^a-z0-9_-]/gi, '-');
            pdf.save(`comprovante-${filename}.pdf`);
        }

        function setAdminTab(tabName) {
            const isSearch = tabName === 'search';
            const isRaffle = tabName === 'raffle';
            const addTab = document.getElementById('tab-add');
            const searchTab = document.getElementById('tab-search');
            const raffleTab = document.getElementById('tab-raffle');
            const addPanel = document.getElementById('panel-add');
            const searchPanel = document.getElementById('panel-search');
            const rafflePanel = document.getElementById('panel-raffle');

            addTab.classList.toggle('active', !isSearch && !isRaffle);
            addTab.setAttribute('aria-selected', String(!isSearch && !isRaffle));
            addPanel.hidden = isSearch || isRaffle;
            searchTab.classList.toggle('active', isSearch);
            searchTab.setAttribute('aria-selected', String(isSearch));
            searchPanel.hidden = !isSearch;
            raffleTab.classList.toggle('active', isRaffle);
            raffleTab.setAttribute('aria-selected', String(isRaffle));
            rafflePanel.hidden = !isRaffle;
        }

        async function initAdminPage() {
            if (!isAdminLoggedIn()) {
                        window.location.href = 'lo_89723.html';
                return;
            }

                    ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
                        document.addEventListener(eventName, refreshAdminSession, { passive: true });
                    });

            const form = document.getElementById('purchase-form');
            const table = document.getElementById('purchase-table');
            const logoutBtn = document.getElementById('logout-btn');

            document.getElementById('tab-add').addEventListener('click', () => setAdminTab('add'));
            document.getElementById('tab-search').addEventListener('click', () => setAdminTab('search'));
            document.getElementById('tab-raffle').addEventListener('click', () => setAdminTab('raffle'));
            document.getElementById('draw-winner-btn').addEventListener('click', drawRaffleWinner);
            document.getElementById('purchase-search').addEventListener('input', (event) => renderAdminRows(event.target.value));

            window.setInterval(() => {
                if (!isAdminLoggedIn()) logoutAdmin();
            }, 15000);

            if (logoutBtn) {
                logoutBtn.addEventListener('click', logoutAdmin);
            }

            if (table) {
                table.addEventListener('click', async (event) => {
                    const receiptButton = event.target.closest('[data-receipt-code]');
                    if (receiptButton) {
                        const purchase = adminPurchaseCache.find((item) => String(item.ticketCode || item.id) === receiptButton.dataset.receiptCode);
                        if (purchase) downloadPurchaseReceipt(purchase);
                        return;
                    }

                    const button = event.target.closest('[data-ticket-code]');
                    if (!button) return;

                    try {
                        const db = await loadDatabase();
                        db.purchases = Array.isArray(db.purchases) ? db.purchases : [];
                        const purchaseIndex = db.purchases.findIndex((purchase) => String(purchase.ticketCode || purchase.id) === button.dataset.ticketCode);
                        if (purchaseIndex < 0) {
                            await renderAdminTable();
                            return;
                        }

                        const purchase = db.purchases[purchaseIndex];
                        if (!window.confirm(`Excluir o ingresso de ${purchase.customerName}? Esta ação não pode ser desfeita.`)) return;

                        db.purchases.splice(purchaseIndex, 1);
                        await saveDatabase(db);
                        await renderAdminTable();
                        alert('Ingresso excluído com sucesso.');
                    } catch (error) {
                        alert(error.message);
                        await renderAdminTable();
                    }
                });
            }

            if (!form) return;

            const codeField = document.getElementById('ticket-code');
            codeField.value = generateTicketCode();

            form.addEventListener('submit', async (event) => {
                event.preventDefault();
                const submitButton = form.querySelector('[type="submit"]');
                const feedback = document.getElementById('purchase-message');
                submitButton.disabled = true;
                feedback.textContent = '';

                const formData = new FormData(form);
                const payload = {
                    customerName: String(formData.get('customerName') || '').trim(),
                    phone: String(formData.get('phone') || '').trim(),
                    email: String(formData.get('email') || '').trim(),
                    eventName: String(formData.get('eventName') || '').trim(),
                    ticketType: String(formData.get('ticketType') || 'Inteira'),
                    quantity: Number(formData.get('quantity') || 1),
                    purchaseDate: String(formData.get('purchaseDate') || new Date().toISOString()),
                    ticketCode: String(formData.get('ticketCode') || generateTicketCode()),
                    status: String(formData.get('status') || 'confirmado')
                };

                if (!payload.customerName || !payload.phone || !payload.eventName
                    || !Number.isSafeInteger(payload.quantity) || payload.quantity < 1) {
                    feedback.textContent = 'Confira os dados obrigatórios e informe uma quantidade válida.';
                    submitButton.disabled = false;
                    return;
                }

                try {
                    feedback.textContent = 'Salvando ingresso...';
                    const db = await loadDatabase();
                    db.customers = Array.isArray(db.customers) ? db.customers : [];
                    db.purchases = Array.isArray(db.purchases) ? db.purchases : [];
                    const phoneKey = payload.phone.replace(/\D/g, '');
                    const emailKey = payload.email.toLocaleLowerCase('pt-BR');
                    let customer = db.customers.find((item) => (
                        (phoneKey && String(item.phone || '').replace(/\D/g, '') === phoneKey)
                        || (emailKey && String(item.email || '').trim().toLocaleLowerCase('pt-BR') === emailKey)
                    ));

                    if (customer) {
                        customer.name = payload.customerName;
                        customer.phone = payload.phone;
                        customer.email = payload.email;
                        customer.updatedAt = new Date().toISOString();
                    } else {
                        customer = {
                            id: generateCustomerId(),
                            name: payload.customerName,
                            phone: payload.phone,
                            email: payload.email,
                            createdAt: new Date().toISOString()
                        };
                        db.customers.push(customer);
                    }

                    payload.customerId = customer.id;
                    db.purchases.unshift(payload);
                    await saveDatabase(db);
                    form.reset();
                    codeField.value = generateTicketCode();
                    await renderAdminTable();
                    feedback.textContent = 'Ingresso cadastrado com sucesso.';
                } catch (error) {
                    console.error('Não foi possível cadastrar o ingresso.', error);
                    feedback.textContent = error.message || 'Não foi possível salvar o ingresso.';
                } finally {
                    submitButton.disabled = false;
                }
            });

            await renderAdminTable();
        }

async function initPurchasePage() {
    const link = document.getElementById('whatsapp-link');
    if (!link) return;

    const db = await loadDatabase();
    const config = window.NGC_CONFIG || {};
    const number = config.whatsappNumber || db.settings?.whatsappNumber || '5511999999999';
    const message = encodeURIComponent(db.settings?.whatsappMessage || config.whatsappMessage || 'Olá! Gostaria de comprar um ingresso para o próximo espetáculo.');
    link.href = `https://wa.me/${number}?text=${message}`;
}

async function initTicketPage() {
    const container = document.getElementById('certificate-content');
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const ticketCode = params.get('code');

    const db = await loadDatabase();
    const purchase = (db.purchases || []).find((item) => String(item.ticketCode).toUpperCase() === String(ticketCode || '').toUpperCase());

    if (!purchase) {
        container.innerHTML = `
            <div class="certificate-empty">
                <h2>Ingresso não encontrado</h2>
                <p>Este certificado ainda não foi liberado ou o código informado está incorreto.</p>
                <a href="index.html" class="btn-principal">Voltar para a home</a>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="certificate-card">
            <div class="certificate-badge">Certificado de ingresso</div>
            <h2>${escapeHtml(purchase.eventName)}</h2>
            <p class="certificate-name">Cliente: <strong>${escapeHtml(purchase.customerName)}</strong></p>
            <div class="certificate-meta">
                <span><strong>Código:</strong> ${escapeHtml(purchase.ticketCode)}</span>
                <span><strong>Tipo:</strong> ${escapeHtml(purchase.ticketType)}</span>
                <span><strong>Data:</strong> ${formatDate(purchase.purchaseDate)}</span>
            </div>
            <div class="certificate-status">Status: ${escapeHtml(purchase.status || 'confirmado')}</div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        const menuIcon = menuToggle.querySelector('i');
        const closeMenu = () => {
            navLinks.classList.remove('active');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.setAttribute('aria-label', 'Abrir menu');
            menuIcon?.classList.replace('fa-xmark', 'fa-bars');
        };

        menuToggle.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('active');
            menuToggle.setAttribute('aria-expanded', String(isOpen));
            menuToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
            if (menuIcon) {
                menuIcon.classList.toggle('fa-bars', !isOpen);
                menuIcon.classList.toggle('fa-xmark', isOpen);
            }
        });

        navLinks.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', closeMenu);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeMenu();
        });

        document.addEventListener('click', (event) => {
            if (!navLinks.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
        });
    }

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach((link) => {
        const href = link.getAttribute('href');
        if (href === currentPage) {
            link.classList.add('active');
        }
    });

    const revealItems = document.querySelectorAll('.reveal, .post-card, .feature-item, .doacao-card');
    if ('IntersectionObserver' in window && revealItems.length) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });

        revealItems.forEach((item) => observer.observe(item));
    } else {
        revealItems.forEach((item) => item.classList.add('visible'));
    }

    const progressBar = document.getElementById('scroll-progress-bar');
    const backToTop = document.querySelector('.back-to-top');
    if (progressBar || backToTop) {
        let scrollUpdateScheduled = false;
        const updateScrollControls = () => {
            const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollProgress = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;

            if (progressBar) {
                progressBar.style.width = `${Math.min(scrollProgress * 100, 100)}%`;
            }
            if (backToTop) {
                backToTop.classList.toggle('visible', window.scrollY > 500);
            }
            scrollUpdateScheduled = false;
        };

        window.addEventListener('scroll', () => {
            if (scrollUpdateScheduled) return;
            scrollUpdateScheduled = true;
            window.requestAnimationFrame(updateScrollControls);
        }, { passive: true });

        updateScrollControls();
    }

    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    const yearNode = document.getElementById('year');
    if (yearNode) {
        yearNode.textContent = new Date().getFullYear();
    }

    const copyBtn = document.getElementById('copyPixBtn');
    const pixKey = document.getElementById('pixKey');
    const feedback = document.getElementById('pixFeedback');

    if (copyBtn && pixKey && feedback) {
        copyBtn.addEventListener('click', async () => {
            const keyText = pixKey.innerText.trim();
            try {
                await navigator.clipboard.writeText(keyText);
            } catch (error) {
                const textArea = document.createElement('textarea');
                textArea.value = keyText;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }

            feedback.style.opacity = '1';
            feedback.style.transform = 'translateY(0)';
            setTimeout(() => {
                feedback.style.opacity = '0';
                feedback.style.transform = 'translateY(8px)';
            }, 2200);
        });
    }

    const page = document.body?.dataset?.page;
    if (page === 'login') initLoginPage();
    if (page === 'admin') initAdminPage();
    if (page === 'purchase') initPurchasePage();
    if (page === 'ticket') initTicketPage();
});
