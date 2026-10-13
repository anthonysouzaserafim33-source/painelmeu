document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // ==========================================
    // 1. ESTADO DA APLICAÇÃO E LOCALSTORAGE
    // ==========================================
    const STORAGE_KEY = 'app_estudos_data';

    const defaultState = {
        subjects: [
            { id: 'matematica', name: 'Matemática', color: '#27de80' },
            { id: 'fisica', name: 'Física', color: '#27de80bd' },
            { id: 'quimica', name: 'Química', color: '#37de7f71' },
            { id: 'portugues', name: 'Português', color: '#136637ad' }
        ],
        contents: [],
        history: [],
        reviews: [],
        revisionFilter: 'pending' // 'pending' | 'completed' | 'all'
    };

    let state = loadState();

    function loadState() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                return { ...defaultState, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Erro ao carregar dados do LocalStorage:', e);
            }
        }
        return defaultState;
    }

    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        
        // Disparar eventos de sincronização para outros módulos (Perfil, Calendário, etc.)[cite: 21, 25]
        window.dispatchEvent(new CustomEvent('painel:data-changed', {
            detail: { source: 'studies', key: STORAGE_KEY }
        }));
        window.dispatchEvent(new CustomEvent('painel:refresh-calendar'));

        renderApp();
    }

    // ==========================================
    // 2. REFERÊNCIAS DO DOM
    // ==========================================
    const DOM = {
        headerDate: document.getElementById('header-date'),
        overviewPeriod: document.getElementById('overview-period'),
        statHours: document.querySelector('[data-study-stat="hours"]'),
        statQuestions: document.querySelector('[data-study-stat="questions"]'),
        statAccuracy: document.querySelector('[data-study-stat="accuracy"]'),
        statRecords: document.querySelector('[data-study-stat="records"]'),
        statActive: document.querySelector('[data-study-stat="activeContents"]'),
        statCompleted: document.querySelector('[data-study-stat="completedContents"]'),
        continueCount: document.getElementById('continue-count'),
        continueList: document.getElementById('continue-list'),
        attentionCount: document.getElementById('attention-count'),
        attentionList: document.getElementById('attention-list'),
        contentSearch: document.getElementById('content-search'),
        contentSubjectFilter: document.getElementById('content-subject-filter'),
        contentStatusFilter: document.getElementById('content-status-filter'),
        contentProgressFilter: document.getElementById('content-progress-filter'),
        contentSort: document.getElementById('content-sort'),
        clearFiltersBtn: document.getElementById('clear-content-filters'),
        contentsResultCount: document.getElementById('contents-result-count'),
        subjectsList: document.getElementById('subjects-list'),
        historyTypeFilter: document.getElementById('history-type-filter'),
        historyVisibleCount: document.getElementById('history-visible-count'),
        globalHistory: document.getElementById('global-history'),
        revisionFilterBtn: document.getElementById('revision-filter-btn'),
        reviewsPendingCount: document.getElementById('reviews-pending-count'),
        reviewsNextDate: document.getElementById('reviews-next-date'),
        reviewsCompletedCount: document.getElementById('reviews-completed-count'),
        reviewsList: document.getElementById('reviews-list'),
        chartPeriod: document.getElementById('chart-period'),
        evolutionMetric: document.getElementById('evolution-metric'),

        // Modais e Botões de Ação
        subjectModal: document.getElementById('subject-modal'),
        subjectForm: document.getElementById('subject-form'),
        btnNewSubject: document.getElementById('new-subject-button'),

        contentModal: document.getElementById('content-modal'),
        contentForm: document.getElementById('content-form'),
        btnNewContent: document.getElementById('new-content-button'),
        btnContentsNew: document.getElementById('contents-new-button'),
        contentSubjectSelect: document.getElementById('content-subject'),

        recordModal: document.getElementById('record-modal'),
        recordForm: document.getElementById('record-form'),
        recordQuestionsInput: document.getElementById('record-questions'),
        recordCorrectInput: document.getElementById('record-correct'),
        recordLiveCorrect: document.getElementById('record-live-correct'),
        recordLiveIncorrect: document.getElementById('record-live-incorrect'),
        recordLiveAccuracy: document.getElementById('record-live-accuracy'),

        toast: document.getElementById('toast')
    };

    let charts = {};

    // ==========================================
    // 3. INICIALIZAÇÃO E EVENTOS
    // ==========================================
    function init() {
        setupHeaderDate();
        bindEvents();
        populateSubjectDropdowns();
        renderApp();
        setupCrossTabSync();
    }

    function setupHeaderDate() {
        if (DOM.headerDate) {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            let formatted = new Date().toLocaleDateString('pt-PT', options);
            DOM.headerDate.textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
        }
    }

    function bindEvents() {
        DOM.overviewPeriod?.addEventListener('change', renderOverview);
        DOM.contentSearch?.addEventListener('input', renderSubjectsAndContents);
        DOM.contentSubjectFilter?.addEventListener('change', renderSubjectsAndContents);
        DOM.contentStatusFilter?.addEventListener('change', renderSubjectsAndContents);
        DOM.contentProgressFilter?.addEventListener('change', renderSubjectsAndContents);
        DOM.contentSort?.addEventListener('change', renderSubjectsAndContents);

        DOM.clearFiltersBtn?.addEventListener('click', () => {
            if (DOM.contentSearch) DOM.contentSearch.value = '';
            if (DOM.contentSubjectFilter) DOM.contentSubjectFilter.value = 'all';
            if (DOM.contentStatusFilter) DOM.contentStatusFilter.value = 'all';
            if (DOM.contentProgressFilter) DOM.contentProgressFilter.value = 'all';
            if (DOM.contentSort) DOM.contentSort.value = 'recent';
            renderSubjectsAndContents();
        });

        DOM.revisionFilterBtn?.addEventListener('click', () => {
            if (state.revisionFilter === 'pending') {
                state.revisionFilter = 'completed';
            } else if (state.revisionFilter === 'completed') {
                state.revisionFilter = 'all';
            } else {
                state.revisionFilter = 'pending';
            }
            renderReviews();
        });

        document.getElementById('study-history-button')?.addEventListener('click', () => {
            document.getElementById('study-history')?.scrollIntoView({ behavior: 'smooth' });
        });

        DOM.historyTypeFilter?.addEventListener('change', renderHistory);
        DOM.chartPeriod?.addEventListener('change', renderCharts);
        DOM.evolutionMetric?.addEventListener('change', renderCharts);

        DOM.btnNewSubject?.addEventListener('click', () => toggleModal(DOM.subjectModal, true));
        
        const openContentModal = () => {
            if (DOM.contentForm) DOM.contentForm.reset();
            const contentIdEl = document.getElementById('content-id');
            if (contentIdEl) contentIdEl.value = '';
            toggleModal(DOM.contentModal, true);
        };

        DOM.btnNewContent?.addEventListener('click', openContentModal);
        DOM.btnContentsNew?.addEventListener('click', openContentModal);

        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalId = e.target.getAttribute('data-close-modal');
                const modal = document.getElementById(modalId);
                if (modal) toggleModal(modal, false);
            });
        });

        DOM.subjectForm?.addEventListener('submit', handleSubjectSubmit);
        DOM.contentForm?.addEventListener('submit', handleContentSubmit);
        DOM.recordForm?.addEventListener('submit', handleRecordSubmit);

        DOM.recordQuestionsInput?.addEventListener('input', calculateLiveStats);
        DOM.recordCorrectInput?.addEventListener('input', calculateLiveStats);
    }

    function setupCrossTabSync() {
        window.addEventListener('storage', (e) => {
            if (e.key === STORAGE_KEY) {
                state = loadState();
                renderApp();
            }
        });
    }

    function toggleModal(modal, show) {
        if (!modal) return;
        modal.hidden = !show;
    }

    function showToast(message) {
        if (!DOM.toast) return;
        DOM.toast.textContent = message;
        DOM.toast.classList.add('is-visible');
        setTimeout(() => {
            DOM.toast.classList.remove('is-visible');
        }, 3000);
    }

    function populateSubjectDropdowns() {
        if (DOM.contentSubjectFilter) {
            DOM.contentSubjectFilter.innerHTML = '<option value="all">Todas</option>';
            state.subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = subject.name;
                DOM.contentSubjectFilter.appendChild(option);
            });
        }

        if (DOM.contentSubjectSelect) {
            DOM.contentSubjectSelect.innerHTML = '';
            state.subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.id;
                option.textContent = subject.name;
                DOM.contentSubjectSelect.appendChild(option);
            });
        }
    }

    // ==========================================
    // 4. SUBMISSÃO DE FORMULÁRIOS
    // ==========================================
    function handleSubjectSubmit(e) {
        e.preventDefault();
        const inputName = document.getElementById('subject-name');
        if (!inputName || !inputName.value.trim()) return;

        const colors = ['#27de80', '#27de80d6', '#27de809f', '#27de807f', '#27de805c', '#0a3a21'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        const newSubject = {
            id: 'sub_' + Date.now(),
            name: inputName.value.trim(),
            color: randomColor
        };

        state.subjects.push(newSubject);
        saveState();
        populateSubjectDropdowns();
        toggleModal(DOM.subjectModal, false);
        inputName.value = '';
        showToast('Matéria adicionada com sucesso!');
    }

    function handleContentSubmit(e) {
        e.preventDefault();
        
        const contentId = document.getElementById('content-id').value;
        const subjectId = DOM.contentSubjectSelect.value;
        const name = document.getElementById('content-name').value.trim();
        const description = document.getElementById('content-description').value.trim();
        
        const targetCorrectInput = document.getElementById('content-target-correct');
        const targetCorrect = targetCorrectInput ? (parseInt(targetCorrectInput.value, 10) || 50) : 50;

        const targetTimeInput = document.getElementById('content-target-time');
        const targetTime = targetTimeInput ? (parseInt(targetTimeInput.value, 10) || 60) : 60;

        if (contentId) {
            const index = state.contents.findIndex(c => c.id === contentId);
            if (index !== -1) {
                const current = state.contents[index];
                
                const totalMinutesStudied = current.totalMinutes || 0;
                const timeProgress = Math.min(100, Math.round((totalMinutesStudied / targetTime) * 100));
                const correctProgress = Math.min(100, Math.round(((current.correct || 0) / targetCorrect) * 100));
                
                const progress = Math.min(timeProgress, correctProgress); 
                
                let status = 'not_started';
                if (progress > 0 && progress < 100) status = 'in_progress';
                if (progress >= 100) status = 'completed';

                state.contents[index] = { 
                    ...current, 
                    subjectId, 
                    name, 
                    description, 
                    targetCorrect,
                    targetTime,
                    progress, 
                    status 
                };
                
                showToast('Conteúdo atualizado com sucesso!');
            }
        } else {
            const newContent = {
                id: 'c_' + Date.now(),
                subjectId,
                name,
                description,
                targetCorrect,
                targetTime,
                questions: 0,
                correct: 0,
                totalMinutes: 0,
                progress: 0,
                status: 'not_started',
                lastStudied: new Date().toISOString().split('T')[0]
            };
            
            state.contents.push(newContent);
            showToast('Conteúdo criado com sucesso!');
        }

        saveState();
        toggleModal(DOM.contentModal, false);
        DOM.contentForm.reset();
    }

function handleRecordSubmit(e) {
        e.preventDefault();
        const contentId = document.getElementById('record-content-id').value;
        const content = state.contents.find(c => c.id === contentId);

        const duration = parseInt(document.getElementById('record-duration').value, 10) || 0;

        // Validação: Se colocar um número menor que 11 (10 ou menos), bloqueia e avisa
        if (duration < 11) {
            showToast('O tempo mínimo de estudo deve ser superior a 10 minutos!');
            return;
        }

        const questions = parseInt(document.getElementById('record-questions').value, 10) || 0;
        const correct = parseInt(document.getElementById('record-correct').value, 10) || 0;
        const date = document.getElementById('record-date').value || new Date().toISOString().split('T')[0];
        const type = document.getElementById('record-type').value;

        if (correct > questions) {
            showToast('O número de acertos não pode ser maior do que o total de questões!');
            return;
        }

        const record = {
            id: 'h_' + Date.now(),
            contentId,
            subjectId: content ? content.subjectId : '',
            type,
            durationMinutes: duration,
            questions,
            correct,
            date
        };

        state.history.unshift(record);

        if (content) {
            content.questions = (content.questions || 0) + questions;
            content.correct = (content.correct || 0) + correct;
            content.totalMinutes = (content.totalMinutes || 0) + duration;
            content.lastStudied = date;

            const targetCorrect = content.targetCorrect || 50;
            const targetTime = content.targetTime || 60;

            const timeProgress = Math.min(100, Math.round((content.totalMinutes / targetTime) * 100));
            const correctProgress = Math.min(100, Math.round((content.correct / targetCorrect) * 100));

            content.progress = Math.min(timeProgress, correctProgress);

            const wasCompleted = content.status === 'completed';
            if (content.progress >= 100) {
                content.status = 'completed';
                if (!wasCompleted) {
                    showToast(`Parabéns! Concluíste o conteúdo "${content.name}"! 🎉`);
                } else {
                    showToast('Estudo e revisão registados com sucesso!');
                }
            } else {
                content.status = content.progress > 0 ? 'in_progress' : 'not_started';
                showToast('Estudo e revisão registados com sucesso!');
            }

            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);

            state.reviews.push({
                id: 'rev_' + Date.now(),
                title: `Revisão: ${content.name}`,
                dueDate: dueDate.toISOString().split('T')[0],
                completed: false
            });
        }

        saveState();
        toggleModal(DOM.recordModal, false);
        DOM.recordForm.reset();
    }

    function calculateLiveStats() {
        const questions = parseInt(DOM.recordQuestionsInput.value, 10) || 0;
        const correct = parseInt(DOM.recordCorrectInput.value, 10) || 0;
        const incorrect = Math.max(0, questions - correct);
        const accuracy = questions > 0 ? Math.round((correct / questions) * 100) : 0;

        if (DOM.recordLiveCorrect) DOM.recordLiveCorrect.textContent = correct;
        if (DOM.recordLiveIncorrect) DOM.recordLiveIncorrect.textContent = incorrect;
        if (DOM.recordLiveAccuracy) DOM.recordLiveAccuracy.textContent = `${accuracy}%`;
    }

    // ==========================================
    // 5. RENDERIZAÇÃO GERAL
    // ==========================================
    function renderApp() {
        renderOverview();
        renderDecisions();
        renderSubjectsAndContents();
        renderHistory();
        renderReviews();
        renderCharts();
    }

    function renderOverview() {
        const periodDays = DOM.overviewPeriod?.value || '30';
        const now = new Date();
        
        let filteredHistory = state.history;
        if (periodDays !== 'all') {
            const limitDate = new Date();
            limitDate.setDate(now.getDate() - parseInt(periodDays, 10));
            filteredHistory = state.history.filter(h => new Date(h.date) >= limitDate);
        }

        const totalMinutes = filteredHistory.reduce((acc, h) => acc + (h.durationMinutes || 0), 0);
        const totalQuestions = filteredHistory.reduce((acc, h) => acc + (h.questions || 0), 0);
        const totalCorrect = filteredHistory.reduce((acc, h) => acc + (h.correct || 0), 0);
        const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        const timeFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins}min`;

        if (DOM.statHours) DOM.statHours.textContent = timeFormatted;
        if (DOM.statQuestions) DOM.statQuestions.textContent = totalQuestions;
        if (DOM.statAccuracy) DOM.statAccuracy.textContent = `${accuracy}%`;
        if (DOM.statRecords) DOM.statRecords.textContent = filteredHistory.length;

        const activeCount = state.contents.filter(c => c.status === 'in_progress').length;
        const completedCount = state.contents.filter(c => c.status === 'completed').length;

        if (DOM.statActive) DOM.statActive.textContent = activeCount;
        if (DOM.statCompleted) DOM.statCompleted.textContent = completedCount;
    }

    function renderDecisions() {
        const inProgress = state.contents.filter(c => c.status === 'in_progress' && c.progress < 100);

        const attention = state.contents.filter(c => {
            if (c.status === 'completed' || c.progress >= 100) return false;
            
            const totalQuestions = c.questions || 0;
            const totalCorrect = c.correct || 0;
            const accuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 100;

            return accuracy < 70 || c.progress < 40;
        });

        if (DOM.continueCount) DOM.continueCount.textContent = inProgress.length;
        if (DOM.attentionCount) DOM.attentionCount.textContent = attention.length;

        if (DOM.continueList) {
            DOM.continueList.innerHTML = inProgress.length ? inProgress.map(c => `
                <div class="decision-item">
                    <strong>${escapeHTML(c.name)}</strong>
                    <span>Progresso: ${c.progress}%</span>
                </div>
            `).join('') : '<p class="empty-state">Nenhum conteúdo em andamento.</p>';
        }

        if (DOM.attentionList) {
            DOM.attentionList.innerHTML = attention.length ? attention.map(c => `
                <div class="decision-item warning">
                    <strong>${escapeHTML(c.name)}</strong>
                    <span>Requer atenção</span>
                </div>
            `).join('') : '<p class="empty-state">Nenhum alerta pendente.</p>';
        }
    }

    function renderSubjectsAndContents() {
        if (!DOM.subjectsList) return;

        const search = DOM.contentSearch?.value.toLowerCase() || '';
        const subjectFilter = DOM.contentSubjectFilter?.value || 'all';
        const statusFilter = DOM.contentStatusFilter?.value || 'all';
        const progressFilter = DOM.contentProgressFilter?.value || 'all';
        const sort = DOM.contentSort?.value || 'recent';

        let filtered = state.contents.filter(content => {
            const matchesSearch = content.name.toLowerCase().includes(search);
            const matchesSubject = subjectFilter === 'all' || content.subjectId === subjectFilter;
            const matchesStatus = statusFilter === 'all' || content.status === statusFilter;
            
            let matchesProgress = true;
            if (progressFilter === '0') matchesProgress = content.progress === 0;
            else if (progressFilter === '1-49') matchesProgress = content.progress >= 1 && content.progress <= 49;
            else if (progressFilter === '50-99') matchesProgress = content.progress >= 50 && content.progress <= 99;
            else if (progressFilter === '100') matchesProgress = content.progress === 100;

            return matchesSearch && matchesSubject && matchesStatus && matchesProgress;
        });

        filtered.sort((a, b) => {
            if (sort === 'progress') return b.progress - a.progress;
            if (sort === 'progress-asc') return a.progress - b.progress;
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'questions') return (b.questions || 0) - (a.questions || 0);
            return new Date(b.lastStudied || 0) - new Date(a.lastStudied || 0);
        });

        if (DOM.contentsResultCount) {
            DOM.contentsResultCount.textContent = `${filtered.length} conteúdos encontrados`;
        }

        DOM.subjectsList.innerHTML = state.subjects.map(subject => {
            const subjectContents = filtered.filter(c => c.subjectId === subject.id);
            if (subjectFilter !== 'all' && subject.id !== subjectFilter) return '';
            if (subjectContents.length === 0 && search) return '';

            const contentsHtml = subjectContents.length 
                ? subjectContents.map(c => {
                    const correctCount = c.correct || 0;
                    const targetCount = c.targetCorrect || 50;
                    const minutesCount = c.totalMinutes || 0;
                    const targetTime = c.targetTime || 60;

                    return '<div class="content-card">' +
                        '<div class="content-card-info">' +
                            '<h4>' + escapeHTML(c.name) + '</h4>' +
                            '<div class="progress-bar-container">' +
                                '<div class="progress-bar-fill" style="width: ' + c.progress + '%"></div>' +
                            '</div>' +
                            '<small>' + correctCount + '/' + targetCount + ' acertos · ' + minutesCount + '/' + targetTime + ' min (' + c.progress + '%)</small>' +
                        '</div>' +
                        '<div class="content-card-actions">' +
                            '<button type="button" class="button button-small button-secondary" data-edit-content="' + c.id + '">Editar</button>' +
                            '<button type="button" class="button button-small button-secondary" data-delete-content="' + c.id + '">Eliminar</button>' +
                            '<button type="button" class="button button-small button-primary" data-record-content="' + c.id + '">Registrar</button>' +
                        '</div>' +
                    '</div>';
                }).join('')
                : '<p class="empty-text">Nenhum conteúdo correspondente.</p>';

            const colorStyle = subject.color || '#ccc';

            return '<details class="subject-accordion" open style="margin:10px">' +
                '<summary class="subject-accordion-header" style="border-left: 4px solid ' + colorStyle + '">' +
                    '<h3>' + escapeHTML(subject.name) + '</h3>' +
                    '<span style="position: relative; left: 9px">' + subjectContents.length + ' conteúdo(s)</span>' +
                '</summary>' +
                '<div class="subject-accordion-body" style="position: relative; left: 9px; margin:10px">' +
                    contentsHtml +
                '</div>' +
            '</details>';
        }).join('');

        DOM.subjectsList.querySelectorAll('[data-record-content]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-record-content');
                openRecordModal(id);
            });
        });

        DOM.subjectsList.querySelectorAll('[data-edit-content]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-edit-content');
                openEditContentModal(id);
            });
        });

        DOM.subjectsList.querySelectorAll('[data-delete-content]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-delete-content');
                deleteContent(id);
            });
        });
    }

    function openEditContentModal(contentId) {
        const content = state.contents.find(c => c.id === contentId);
        if (!content) return;

        document.getElementById('content-id').value = content.id;
        DOM.contentSubjectSelect.value = content.subjectId;
        document.getElementById('content-name').value = content.name;
        document.getElementById('content-description').value = content.description || '';
        
        const targetInput = document.getElementById('content-target-correct');
        if (targetInput) targetInput.value = content.targetCorrect || 50;

        const targetTimeInput = document.getElementById('content-target-time');
        if (targetTimeInput) targetTimeInput.value = content.targetTime || 60;

        toggleModal(DOM.contentModal, true);
    }

    function deleteContent(contentId) {
        if (confirm('Tem a certeza de que pretende eliminar este conteúdo e o seu histórico associado?')) {
            state.contents = state.contents.filter(c => c.id !== contentId);
            saveState();
            showToast('Conteúdo eliminado com sucesso!');
        }
    }

    function openRecordModal(contentId) {
        const content = state.contents.find(c => c.id === contentId);
        if (!content) return;

        const subject = state.subjects.find(s => s.id === content.subjectId);

        document.getElementById('record-content-id').value = content.id;
        document.getElementById('record-content-name-display').textContent = content.name;
        document.getElementById('record-subject-name-display').textContent = subject ? subject.name : '';
        document.getElementById('record-date').value = new Date().toISOString().split('T')[0];

        calculateLiveStats();
        toggleModal(DOM.recordModal, true);
    }

    function renderHistory() {
        if (!DOM.globalHistory) return;

        const typeFilter = DOM.historyTypeFilter?.value || 'all';
        let filtered = state.history;

        if (typeFilter !== 'all') {
            filtered = filtered.filter(h => h.type === typeFilter);
        }

        if (DOM.historyVisibleCount) {
            DOM.historyVisibleCount.textContent = `${filtered.length} registos`;
        }

        if (!filtered.length) {
            DOM.globalHistory.innerHTML = '<p class="empty-state">Nenhum histórico encontrado.</p>';
            return;
        }

        DOM.globalHistory.innerHTML = filtered.map(h => {
            const subject = state.subjects.find(s => s.id === h.subjectId);
            const subjectName = subject ? escapeHTML(subject.name) : 'Geral';
            
            return '<div class="history-item">' +
                '<div>' +
                    '<strong>' + subjectName + '</strong>' +
                    '<p>' + h.durationMinutes + ' min · ' + h.questions + ' questões (' + h.correct + ' acertos)</p>' +
                '</div>' +
                '<time>' + h.date + '</time>' +
            '</div>';
        }).join('');
    }

    function renderReviews() {
        if (!DOM.reviewsList || !DOM.revisionFilterBtn) return;

        const filterLabels = {
            pending: 'Pendentes',
            completed: 'Concluídas',
            all: 'Todas'
        };
        DOM.revisionFilterBtn.textContent = filterLabels[state.revisionFilter] || 'Pendentes';

        const pendingReviews = state.reviews.filter(r => !r.completed);
        const completedReviews = state.reviews.filter(r => r.completed);

        if (DOM.reviewsPendingCount) DOM.reviewsPendingCount.textContent = pendingReviews.length;
        if (DOM.reviewsCompletedCount) DOM.reviewsCompletedCount.textContent = completedReviews.length;

        if (DOM.reviewsNextDate) {
            if (pendingReviews.length > 0) {
                const sortedDates = pendingReviews
                    .map(r => new Date(r.dueDate))
                    .sort((a, b) => a - b);
                DOM.reviewsNextDate.textContent = sortedDates[0].toLocaleDateString('pt-PT');
            } else {
                DOM.reviewsNextDate.textContent = '—';
            }
        }

        let listToRender = state.reviews;
        if (state.revisionFilter === 'pending') {
            listToRender = pendingReviews;
        } else if (state.revisionFilter === 'completed') {
            listToRender = completedReviews;
        }

        if (listToRender.length === 0) {
            DOM.reviewsList.innerHTML = '<p class="empty-state">Nenhuma revisão encontrada para o filtro "' + filterLabels[state.revisionFilter] + '".</p>';
            return;
        }

        DOM.reviewsList.innerHTML = listToRender.map(r => {
            const actionHtml = !r.completed 
                ? '<button type="button" class="button button-small button-primary" data-complete-review="' + r.id + '">Concluir</button>' 
                : '<span class="status-badge-done">✓ Concluída</span>';

            return '<div class="revision-item ' + (r.completed ? 'completed' : '') + '">' +
                '<div class="revision-info">' +
                    '<strong>' + escapeHTML(r.title) + '</strong>' +
                    '<small>Vencimento: ' + r.dueDate + '</small>' +
                '</div>' +
                '<div class="revision-actions">' +
                    actionHtml +
                '</div>' +
            '</div>';
        }).join('');

        DOM.reviewsList.querySelectorAll('[data-complete-review]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-complete-review');
                const review = state.reviews.find(r => r.id === id);
                if (review) {
                    review.completed = true;
                    saveState();
                    showToast('Revisão marcada como concluída!');
                }
            });
        });
    }

    // ==========================================
    // 6. RENDERIZAÇÃO DE GRÁFICOS
    // ==========================================
    function getGroupedAndSortedHistory() {
        const validHistory = state.history.filter(h => h && h.date);
        validHistory.sort((a, b) => new Date(a.date) - new Date(b.date));

        const grouped = {};
        validHistory.forEach(h => {
            if (!grouped[h.date]) {
                grouped[h.date] = { date: h.date, questions: 0, correct: 0, durationMinutes: 0 };
            }
            grouped[h.date].questions += (h.questions || 0);
            grouped[h.date].correct += (h.correct || 0);
            grouped[h.date].durationMinutes += (h.durationMinutes || 0);
        });

        return Object.values(grouped);
    }

    function renderCharts() {
        if (typeof Chart === 'undefined') return;

        renderAccuracyChart();
        renderQuestionsChart();
        renderTimeChart();
        renderEvolutionChart();
    }

    function renderAccuracyChart() {
        const canvas = document.getElementById('accuracy-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (charts.accuracy) charts.accuracy.destroy();

        const dataList = getGroupedAndSortedHistory();
        const labels = dataList.map(h => h.date);
        const data = dataList.map(h => h.questions > 0 ? Math.round((h.correct / h.questions) * 100) : 0);

        charts.accuracy = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['Sem dados'],
                datasets: [{
                    label: 'Precisão (%)',
                    data: data.length ? data : [0],
                    borderColor: '#09a856',
                    tension: 0.3,
                    fill: false
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function renderQuestionsChart() {
        const canvas = document.getElementById('questions-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (charts.questions) charts.questions.destroy();

        const dataList = getGroupedAndSortedHistory();
        const labels = dataList.map(h => h.date);
        const data = dataList.map(h => h.questions || 0);

        charts.questions = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Sem dados'],
                datasets: [{
                    label: 'Questões',
                    data: data.length ? data : [0],
                    backgroundColor: '#10b981'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function renderTimeChart() {
        const canvas = document.getElementById('time-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (charts.time) charts.time.destroy();

        const dataList = getGroupedAndSortedHistory();
        const labels = dataList.map(h => h.date);
        const data = dataList.map(h => h.durationMinutes || 0);

        charts.time = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Sem dados'],
                datasets: [{
                    label: 'Minutos',
                    data: data.length ? data : [0],
                    backgroundColor: '#60f8a9'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function renderEvolutionChart() {
        const canvas = document.getElementById('evolution-chart');
        if (!canvas || typeof Chart === 'undefined') return;

        if (charts.evolution) charts.evolution.destroy();

        const metric = DOM.evolutionMetric?.value || 'accuracy';
        const dataList = getGroupedAndSortedHistory();
        const labels = dataList.map(h => h.date);
        
        let data = [];
        if (metric === 'accuracy') {
            data = dataList.map(h => h.questions > 0 ? Math.round((h.correct / h.questions) * 100) : 0);
        } else if (metric === 'questions') {
            data = dataList.map(h => h.questions || 0);
        } else if (metric === 'hours') {
            data = dataList.map(h => Number(((h.durationMinutes || 0) / 60).toFixed(1)));
        } else {
            data = dataList.map((_, idx) => idx + 1);
        }

        charts.evolution = new Chart(canvas, {
            type: 'line',
            data: {
                labels: labels.length ? labels : ['Sem dados'],
                datasets: [{
                    label: 'Evolução',
                    data: data.length ? data : [0],
                    borderColor: '#8b5cf6',
                    fill: true,
                    backgroundColor: 'rgba(139, 92, 246, 0.1)'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function escapeHTML(str) {
        return String(str || '').replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    init();
});