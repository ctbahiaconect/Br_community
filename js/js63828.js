        window.NGC_CONFIG = window.NGC_CONFIG || {
    binId: '6aeca593ac6210605a6fa81f',
    masterKey: '$2a$10$B9j5yKhIwDysYmdTVdLh2eYE/2IIcd5inVVdA55qQnzO3Hm5aXkCm',
    whatsappNumber: '71981547408',
    whatsappMessage: 'Olá! Gostaria de comprar um ingresso para o próximo espetáculo.',
    defaultAdmin: {
        username: 'user83809q8wegb',
        password: 'ad027398729gb',
        name: 'Administrador'
    }
};

const DB_KEY = 'ngc_jsonbin_db_v1';
const DEFAULT_DB = {
    admins: [window.NGC_CONFIG.defaultAdmin],
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
        ? db.admins.map((admin) => (
                admin.username === 'admi' && admin.password === 'admin123'
                ? { ...admin, ...defaultAdmin }
                : admin
        ))
        : [defaultAdmin];

    return {
        admins,
        purchases: Array.isArray(db?.purchases) ? db.purchases : [],
        settings: {
            ...DEFAULT_DB.settings,
            ...(db?.settings || {}),
            whatsappNumber: config.whatsappNumber || DEFAULT_DB.settings.whatsappNumber
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
    const localDb = getDbFromStorage();
    const config = window.NGC_CONFIG || {};

    if (!config.binId || !config.masterKey || String(config.binId).includes('SEU_')) {
        return localDb;
    }

    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${config.binId}/latest`, {
            method: 'GET',
            headers: {
                'X-Master-Key': config.masterKey,
                'X-Bin-Meta': 'false'
            }
        });

        if (!response.ok) throw new Error('JSONBin indisponível');

        const result = await response.json();
        const remoteDb = normalizeDatabase(result.record || localDb);
        localStorage.setItem(DB_KEY, JSON.stringify(remoteDb));
        return remoteDb;
    } catch (error) {
        console.warn('JSONBin indisponível, usando localStorage.', error);
        return localDb;
    }
}

async function saveDatabase(db) {
    const config = window.NGC_CONFIG || {};

    if (!config.binId || !config.masterKey || String(config.binId).includes('SEU_')) {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return db;
    }

    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${config.binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': config.masterKey
            },
            body: JSON.stringify(db)
        });
        if (!response.ok) throw new Error(`JSONBin respondeu ${response.status}`);
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (error) {
        console.warn('Não foi possível sincronizar com o JSONBin.', error);
        throw new Error('Não foi possível salvar os dados no JSONBin.');
    }

    return db;
}

function ensureDefaultAdmin() {
    const db = getDbFromStorage();
    if (!db.admins || !db.admins.length) {
        db.admins = [window.NGC_CONFIG.defaultAdmin];
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    }
}

function generateTicketCode() {
    return `NGC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
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

function setCurrentAdmin(username) {
    localStorage.setItem('ngc_admin_user', username || '');
}

function isAdminLoggedIn() {
    return Boolean(localStorage.getItem('ngc_admin_user'));
}

function logoutAdmin() {
    localStorage.removeItem('ngc_admin_user');
    window.location.href = 'login.html';
}

async function initLoginPage() {
    const form = document.getElementById('admin-login-form');
    if (!form) return;

    ensureDefaultAdmin();
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const message = document.getElementById('login-message');
        const db = await loadDatabase();
        const admin = (db.admins || []).find((item) => item.username === username && item.password === password);

        if (!admin) {
            message.textContent = 'Usuário ou senha inválidos.';
            message.classList.add('error');
            return;
        }

        setCurrentAdmin(admin.username);
        window.location.href = 'painel.html';
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
            const db = await loadDatabase();
            adminPurchaseCache = Array.isArray(db.purchases) ? db.purchases : [];
            updateRaffleEvents();
            const search = document.getElementById('purchase-search');
            renderAdminRows(searchTerm ?? search?.value ?? '');
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
                window.location.href = 'login.html';
                return;
            }

            const form = document.getElementById('purchase-form');
            const table = document.getElementById('purchase-table');
            const logoutBtn = document.getElementById('logout-btn');

            document.getElementById('tab-add').addEventListener('click', () => setAdminTab('add'));
            document.getElementById('tab-search').addEventListener('click', () => setAdminTab('search'));
            document.getElementById('tab-raffle').addEventListener('click', () => setAdminTab('raffle'));
            document.getElementById('draw-winner-btn').addEventListener('click', drawRaffleWinner);
            document.getElementById('purchase-search').addEventListener('input', (event) => renderAdminRows(event.target.value));

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
                    try {
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

                if (!payload.customerName || !payload.phone || !payload.eventName) {
                    alert('Preencha nome, telefone e evento.');
                    return;
                }

                const db = await loadDatabase();
                db.purchases = Array.isArray(db.purchases) ? db.purchases : [];
                db.purchases.unshift(payload);
                try {
                    await saveDatabase(db);
                } catch (error) {
                    alert(error.message);
                    return;
                }

                form.reset();
                codeField.value = generateTicketCode();
                await renderAdminTable();
                alert('Ingresso cadastrado com sucesso.');
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
            <h2>${purchase.eventName}</h2>
            <p class="certificate-name">Cliente: <strong>${purchase.customerName}</strong></p>
            <div class="certificate-meta">
                <span><strong>Código:</strong> ${purchase.ticketCode}</span>
                <span><strong>Tipo:</strong> ${purchase.ticketType}</span>
                <span><strong>Data:</strong> ${formatDate(purchase.purchaseDate)}</span>
            </div>
            <div class="certificate-status">Status: ${purchase.status || 'confirmado'}</div>
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
