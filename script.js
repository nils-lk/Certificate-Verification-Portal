document.addEventListener('DOMContentLoaded', () => {
    const form        = document.getElementById('verification-form');
    const input       = document.getElementById('certificate-input');
    const verifyBtn   = document.getElementById('verify-btn');
    const errorMessage = document.getElementById('error-message');
    const resultSection = document.getElementById('result-section');
    const yearSelect  = document.getElementById('year-select');

    // Result elements
    const resCertNo      = document.getElementById('res-cert-no');
    const resName        = document.getElementById('res-name');
    const resProgramme   = document.getElementById('res-programme');
    const resDate        = document.getElementById('res-date');
    const resWorkplace   = document.getElementById('res-workplace');
    const resSerial      = document.getElementById('res-serial');
    const resPrintDate   = document.getElementById('res-print-date');
    const resYear        = document.getElementById('res-year');

    // ── Apps Script API ──────────────────────────────────────────────────────
    const API_BASE =
        'https://script.google.com/macros/s/' +
        'AKfycbzvcIzZre4powiF7F4FyJszBQxl_4kD69NlnnJvq_VR1sX6fOQ_Lw8djhHovbtKrqBLDQ/exec';

    // ── Fetch with timeout ────────────────────────────────────────────────────
    async function fetchWithTimeout(url, timeoutMs = 15000) {
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            return res;
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }

    // ── Fetch with retry (exponential back-off) ───────────────────────────────
    async function fetchWithRetry(url, retries = 3, baseDelay = 1500) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const res = await fetchWithTimeout(url, 15000);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res;
            } catch (err) {
                const isLastAttempt = attempt === retries;
                if (isLastAttempt) throw err;

                const delay = baseDelay * Math.pow(2, attempt - 1); // 1.5s, 3s, …
                setLoading(true, `Retrying… (${attempt}/${retries - 1})`);
                await new Promise(r => setTimeout(r, delay));
                setLoading(true, 'Searching…');
            }
        }
    }

    // ── Load available years into the dropdown ─────────────────────────────────
    async function loadYears() {
        if (!yearSelect) return;
        try {
            const res  = await fetchWithTimeout(`${API_BASE}?action=years`, 10000);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            // Expected: { years: [2024, 2025, 2026] }  OR  [2024, 2025, 2026]
            const years = Array.isArray(data) ? data :
                          (data.years && Array.isArray(data.years) ? data.years : null);

            if (years && years.length > 0) {
                // Remove any placeholder options except the first (All Years)
                while (yearSelect.options.length > 1) yearSelect.remove(1);

                years
                    .map(y => parseInt(y, 10))
                    .filter(y => !isNaN(y))
                    .sort((a, b) => b - a)           // newest first
                    .forEach(y => {
                        const opt = document.createElement('option');
                        opt.value = y;
                        opt.textContent = y;
                        yearSelect.appendChild(opt);
                    });
            }
        } catch (err) {
            // Silently fall back to default options already in HTML
            console.warn('Could not load year list from API:', err.message);
        }
    }

    // ── Init: load years on page load ─────────────────────────────────────────
    loadYears();

    // ── Submit ────────────────────────────────────────────────────────────────
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const certNumber = input.value.trim();
        if (!certNumber) return;

        const selectedYear = yearSelect ? yearSelect.value : '';

        hideError();
        hideResult();
        setLoading(true, 'Searching…');

        try {
            let url = `${API_BASE}?q=${encodeURIComponent(certNumber)}`;
            if (selectedYear) url += `&year=${encodeURIComponent(selectedYear)}`;

            const res  = await fetchWithRetry(url, 3, 1500);
            const data = await res.json();

            // Handle error object returned by the API
            if (data && data.status === 'error') {
                showError(
                    'Certificate not found. Please check the number and try again. ' +
                    'For assistance, contact NILS.'
                );
                return;
            }

            const record = Array.isArray(data) && data.length > 0 ? data[0] : null;

            if (!record) {
                showError(
                    'Certificate not found. Please check the number and try again. ' +
                    'For assistance, contact NILS.'
                );
                return;
            }

            // ── Populate result card ──────────────────────────────────────────
            const safe = (v) => (v !== undefined && v !== null && v !== '') ? v : 'N/A';

            resCertNo.textContent    = safe(record['Certificate No']);
            resName.textContent      = safe(record['Name with initial'] || record['Name']);
            resProgramme.textContent = safe(record['Programme Name']    || record['Course']);
            resDate.textContent      = safe(record['Date']              || record['Effective Date']);
            resWorkplace.textContent = safe(record['Working Place']);
            resSerial.textContent    = safe(record['Serial No']);
            resPrintDate.textContent = safe(record['Date of Printing']);

            // Show the year badge if SourceSheet is present
            if (resYear) {
                const src = record['SourceSheet'] || '';
                const yr  = src.match(/\d{4}/)?.[0] || '';
                resYear.textContent = yr ? yr : '';
                resYear.style.display = yr ? 'inline-block' : 'none';
            }

            // ── Populate print/PDF document ────────────────────────────────────
            const now      = new Date();
            const refDate  = now.toISOString().replace('T',' ').substring(0, 19);
            const refSerial = String(record['Serial No'] || certNumber).replace(/\s/g, '');

            document.getElementById('print-reference').textContent =
                `${refDate.replace(/-/g,'').replace(/:/g,'').replace(' ','-')}-${refSerial}`;
            document.getElementById('print-name').textContent       = safe(record['Name with initial'] || record['Name']);
            document.getElementById('print-programme').textContent  = safe(record['Programme Name']   || record['Course']);
            document.getElementById('print-award-date').textContent = safe(record['Date']             || record['Effective Date']);
            document.getElementById('print-cert-no').textContent    = safe(record['Certificate No']);
            document.getElementById('print-serial').textContent     = safe(record['Serial No']);
            document.getElementById('print-workplace').textContent  = safe(record['Working Place']);
            document.getElementById('print-generated-date').textContent =
                now.toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' }) +
                '  ' +
                now.toLocaleTimeString('en-GB',  { hour:'2-digit', minute:'2-digit', second:'2-digit' });

            showResult();

        } catch (err) {
            console.error('Verification error:', err);
            if (err.name === 'AbortError') {
                showError('Connection timed out. Please check your internet connection and try again.');
            } else {
                showError(`Error connecting to database: ${err.message}. If this persists, the API deployment may require 'Anyone' access.`);
            }
        } finally {
            setLoading(false);
        }
    });

    // ── UI helpers ───────────────────────────────────────────────────────────
    function setLoading(on, text = 'Verifying…') {
        const btnText = verifyBtn.querySelector('.btn-text');
        if (on) {
            verifyBtn.classList.add('loading');
            if (btnText) btnText.textContent = text;
            input.disabled = true;
            if (yearSelect) yearSelect.disabled = true;
        } else {
            verifyBtn.classList.remove('loading');
            if (btnText) btnText.textContent = 'Verify';
            input.disabled = false;
            if (yearSelect) yearSelect.disabled = false;
        }
    }

    function showError(msg) {
        document.getElementById('error-text').textContent = msg;
        errorMessage.classList.remove('hidden');
    }
    function hideError()  { errorMessage.classList.add('hidden'); }
    function showResult() {
        resultSection.classList.remove('hidden');
        setTimeout(() => resultSection.scrollIntoView({ behavior:'smooth', block:'nearest' }), 100);
    }
    function hideResult() { resultSection.classList.add('hidden'); }
});

// ── Print / Download PDF ──────────────────────────────────────────────────────
function printVerificationDoc() { window.print(); }
