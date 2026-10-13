'use strict';

/* =========================================================
   ESTRUTURA E CONTROLADOR DO MÓDULO PERFIL — MEU PAINEL
   ========================================================= */

const ProfileApp = {
    STORAGE_KEYS: {
        TASKS: 'painel_tarefas_v1',
        STUDIES: 'app_estudos_data',
        HABITS: 'habitos',
        HABIT_RECORDS: 'habitos_registros',
        GOALS: 'metas',
        PLANNING: 'painel_planejamento_v1',
        CALENDAR: 'painel_calendario_eventos_v1'
    },

    state: {
        timeframe: 30, // dias padrão
        activeMetric: 'study', // 'study', 'tasks', 'accuracy'
        rawData: {
            tasks: [],
            studies: { contents: [], history: [] },
            habits: [],
            habitRecords: [],
            goals: [],
            planning: [],
            calendar: []
        },
        chartInstance: null
    },

    init() {
        this.loadHeaderDateTime();
        this.loadAllData();
        this.bindEvents();
        this.renderAll();
        this.setupCrossTabSync();
    },

    /* =========================================================
       1. CARREGAMENTO DE DADOS REAIS (LOCALSTORAGE)
       ========================================================= */

    loadHeaderDateTime() {
        const headerDate = document.getElementById('header-date');
        if (!headerDate) return;

        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        let formatted = now.toLocaleDateString('pt-PT', options);
        formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);

        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        headerDate.setAttribute('datetime', now.toISOString());
        headerDate.textContent = `${formatted} — ${hours}:${minutes}`;
    },

    loadAllData() {
        try {
            // Tarefas
            const tasksRaw = localStorage.getItem(this.STORAGE_KEYS.TASKS);
            const parsedTasks = tasksRaw ? JSON.parse(tasksRaw) : [];
            this.state.rawData.tasks = Array.isArray(parsedTasks) ? parsedTasks : (parsedTasks.items || parsedTasks.tasks || []);

            // Estudos
            const studiesRaw = localStorage.getItem(this.STORAGE_KEYS.STUDIES);
            if (studiesRaw) {
                const studyData = JSON.parse(studiesRaw);
                this.state.rawData.studies = {
                    contents: Array.isArray(studyData.contents) ? studyData.contents : [],
                    history: Array.isArray(studyData.history) ? studyData.history : (Array.isArray(studyData.studyHistory) ? studyData.studyHistory : [])
                };
            } else {
                this.state.rawData.studies = { contents: [], history: [] };
            }

            // Hábitos e Registros
            const habitsRaw = localStorage.getItem(this.STORAGE_KEYS.HABITS);
            this.state.rawData.habits = habitsRaw ? JSON.parse(habitsRaw) : [];

            const recordsRaw = localStorage.getItem(this.STORAGE_KEYS.HABIT_RECORDS);
            this.state.rawData.habitRecords = recordsRaw ? JSON.parse(recordsRaw) : [];

            // Metas
            const goalsRaw = localStorage.getItem(this.STORAGE_KEYS.GOALS);
            const parsedGoals = goalsRaw ? JSON.parse(goalsRaw) : [];
            this.state.rawData.goals = Array.isArray(parsedGoals) ? parsedGoals : (parsedGoals.items || parsedGoals.goals || []);

            // Planejamento
            const planningRaw = localStorage.getItem(this.STORAGE_KEYS.PLANNING);
            const parsedPlanning = planningRaw ? JSON.parse(planningRaw) : [];
            this.state.rawData.planning = Array.isArray(parsedPlanning) ? parsedPlanning : (parsedPlanning.activities || parsedPlanning.items || []);

            // Calendário
            const calendarRaw = localStorage.getItem(this.STORAGE_KEYS.CALENDAR);
            const parsedCalendar = calendarRaw ? JSON.parse(calendarRaw) : [];
            this.state.rawData.calendar = Array.isArray(parsedCalendar) ? parsedCalendar : (parsedCalendar.items || parsedCalendar.events || []);

        } catch (error) {
            console.error('Erro ao carregar dados para o módulo Perfil:', error);
            this.showToast('Erro ao ler dados dos módulos.', 'error');
        }
    },

    /* =========================================================
       2. EVENTOS E FILTROS
       ========================================================= */

    bindEvents() {
        const timeframeSelect = document.getElementById('timeframe-select');
        if (timeframeSelect) {
            timeframeSelect.addEventListener('change', (e) => {
                this.state.timeframe = e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10);
                this.renderAll();
            });
        }

        const refreshBtn = document.getElementById('refresh-profile-data');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadAllData();
                this.renderAll();
                this.showToast('Dados de desempenho atualizados.');
            });
        }

        document.querySelectorAll('.metric-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.state.activeMetric = e.target.dataset.metric;
                this.renderMainChart();
            });
        });
    },

    setupCrossTabSync() {
        window.addEventListener('storage', (event) => {
            if (event.key && Object.values(this.STORAGE_KEYS).includes(event.key)) {
                this.loadAllData();
                this.renderAll();
            }
        });

        const refreshHandler = () => {
            this.loadAllData();
            this.renderAll();
        };

        window.addEventListener('tasks:updated', refreshHandler);
        window.addEventListener('planning:updated', refreshHandler);
        window.addEventListener('painel:data-changed', refreshHandler);
        window.addEventListener('painel:refresh-calendar', refreshHandler);
    },

    /* =========================================================
       3. FILTRAGEM TEMPORAL DE REGISTROS
       ========================================================= */

    isDateWithinTimeframe(dateString) {
        if (!dateString) return false;
        if (this.state.timeframe === 'all') return true;

        const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00');
        if (isNaN(date.getTime())) return false;

        const now = new Date();
        const diffTime = now.getTime() - date.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);

        if (this.state.timeframe === 365) {
            return date.getFullYear() === now.getFullYear();
        }

        return diffDays >= 0 && diffDays <= this.state.timeframe;
    },

    /* =========================================================
       4. CÁLCULOS E RENDERIZAÇÃO COMPLETA
       ========================================================= */

    renderAll() {
        this.renderKPIs();
        this.renderModuleCards();
        this.renderMainChart();
        this.renderComparison();
        this.renderUnifiedHistory();
    },

    renderKPIs() {
        const tasks = this.state.rawData.tasks;
        const studies = this.state.rawData.studies.history;
        const habits = this.state.rawData.habits;
        const records = this.state.rawData.habitRecords;
        const goals = this.state.rawData.goals;

        // Tarefas Concluídas no período
        const filteredTasks = tasks.filter(t => this.isDateWithinTimeframe(t.completedAt || t.dueDate));
        const tasksCompletedCount = filteredTasks.filter(t => t.status === 'completed').length;
        const tasksTotalCount = filteredTasks.length;

        // Tempo de Estudo no período
        const filteredStudies = studies.filter(s => this.isDateWithinTimeframe(s.date));
        const totalStudyMinutes = filteredStudies.reduce((acc, s) => acc + (parseInt(s.durationMinutes, 10) || 0), 0);
        const studyHoursFormatted = this.formatMinutesToHours(totalStudyMinutes);

        // Consistência de Hábitos
        let consistencyRate = 0;
        if (habits.length > 0) {
            const filteredRecords = records.filter(r => this.isDateWithinTimeframe(r.date));
            const totalExpected = habits.length * (typeof this.state.timeframe === 'number' ? this.state.timeframe : 30);
            const totalDone = filteredRecords.filter(r => r.completed).length;
            consistencyRate = totalExpected > 0 ? Math.min(100, Math.round((totalDone / totalExpected) * 100)) : 0;
        }

        // Progresso das Metas
        const activeGoals = goals.filter(g => g.status !== 'archived');
        const avgGoalProgress = activeGoals.length > 0
            ? Math.round(activeGoals.reduce((acc, g) => acc + (g.progress || (g.currentValue && g.targetValue ? (g.currentValue / g.targetValue) * 100 : 0)), 0) / activeGoals.length)
            : 0;

        // Taxa Geral de Execução
        const taskRate = tasksTotalCount > 0 ? (tasksCompletedCount / tasksTotalCount) * 100 : 0;
        const divisors = [taskRate, consistencyRate, avgGoalProgress].filter(val => !isNaN(val)).length;
        const overallExecution = divisors > 0 ? Math.round((taskRate + consistencyRate + avgGoalProgress) / divisors) : 0;

        // Atualização do DOM
        this.setDOMText('kpi-execution-rate', `${overallExecution}%`);
        this.setDOMText('kpi-tasks-completed', tasksCompletedCount);
        this.setDOMText('kpi-study-hours', studyHoursFormatted);
        this.setDOMText('kpi-habits-consistency', `${consistencyRate}%`);
        this.setDOMText('kpi-goals-progress', `${avgGoalProgress}%`);
    },

    renderModuleCards() {
        const tasks = this.state.rawData.tasks;
        const studies = this.state.rawData.studies;
        const habits = this.state.rawData.habits;
        const records = this.state.rawData.habitRecords;
        const goals = this.state.rawData.goals;
        const planning = this.state.rawData.planning;
        const calendar = this.state.rawData.calendar;

        // Tarefas
        const fTasks = tasks.filter(t => this.isDateWithinTimeframe(t.dueDate || t.createdAt));
        const tTotal = fTasks.length;
        const tDone = fTasks.filter(t => t.status === 'completed').length;
        const tPending = fTasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length;
        const tOverdue = fTasks.filter(t => t.status === 'overdue').length;
        const tRate = tTotal > 0 ? Math.round((tDone / tTotal) * 100) : 0;

        this.setDOMText('stat-tasks-total', tTotal);
        this.setDOMText('stat-tasks-done', tDone);
        this.setDOMText('stat-tasks-pending', tPending);
        this.setDOMText('stat-tasks-overdue', tOverdue);
        this.setDOMText('stat-tasks-rate', `${tRate}%`);

        // Estudos
        const fStudyHist = studies.history.filter(s => this.isDateWithinTimeframe(s.date));
        const sSessions = fStudyHist.length;
        const sQuestions = fStudyHist.reduce((acc, s) => acc + (parseInt(s.questions, 10) || 0), 0);
        const sCorrect = fStudyHist.reduce((acc, s) => acc + (parseInt(s.correct, 10) || 0), 0);
        const sAccuracy = sQuestions > 0 ? Math.round((sCorrect / sQuestions) * 100) : 0;
        const sTotalMins = fStudyHist.reduce((acc, s) => acc + (parseInt(s.durationMinutes, 10) || 0), 0);

        this.setDOMText('stat-study-sessions', sSessions);
        this.setDOMText('stat-study-questions', sQuestions);
        this.setDOMText('stat-study-correct', sCorrect);
        this.setDOMText('stat-study-accuracy', `${sAccuracy}%`);
        this.setDOMText('stat-study-time', this.formatMinutesToHours(sTotalMins));

        // Hábitos
        const fHabitRecs = records.filter(r => this.isDateWithinTimeframe(r.date));
        const hActive = habits.filter(h => h.status === 'active' || !h.status).length;
        const hConsistency = hActive > 0 ? Math.min(100, Math.round((fHabitRecs.filter(r => r.completed).length / (hActive * (typeof this.state.timeframe === 'number' ? this.state.timeframe : 30))) * 100)) : 0;

        this.setDOMText('stat-habits-active', hActive);
        this.setDOMText('stat-habits-records', fHabitRecs.length);
        this.setDOMText('stat-habits-consistency-card', `${hConsistency}%`);

        // Metas
        const gActive = goals.filter(g => g.status === 'active').length;
        const gCompleted = goals.filter(g => g.status === 'completed').length;
        const gAvg = goals.length > 0 ? Math.round(goals.reduce((acc, g) => acc + (g.progress || 0), 0) / goals.length) : 0;

        this.setDOMText('stat-goals-active', gActive);
        this.setDOMText('stat-goals-completed', gCompleted);
        this.setDOMText('stat-goals-avg-progress', `${gAvg}%`);

        // Planejamento
        const fPlan = planning.filter(p => this.isDateWithinTimeframe(p.date));
        const pPlanned = fPlan.length;
        const pExecuted = fPlan.filter(p => p.status === 'completed').length;
        const pRate = pPlanned > 0 ? Math.round((pExecuted / pPlanned) * 100) : 0;

        this.setDOMText('stat-plan-planned', pPlanned);
        this.setDOMText('stat-plan-executed', pExecuted);
        this.setDOMText('stat-plan-rate', `${pRate}%`);

        // Calendário
        const fCal = calendar.filter(c => this.isDateWithinTimeframe(c.date || c.start));
        const cFuture = fCal.filter(c => new Date(c.date || c.start) >= new Date()).length;

        this.setDOMText('stat-cal-events', fCal.length);
        this.setDOMText('stat-cal-future', cFuture);
    },

    /* =========================================================
       5. GRÁFICO PRINCIPAL (CHART.JS)
       ========================================================= */

    renderMainChart() {
        const canvas = document.getElementById('main-evolution-chart');
        const emptyState = document.getElementById('chart-empty-state');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const daysCount = typeof this.state.timeframe === 'number' ? this.state.timeframe : 30;

        const labels = [];
        const dataValues = [];

        for (let i = daysCount - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            labels.push(d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }));

            if (this.state.activeMetric === 'study') {
                const dayStudies = this.state.rawData.studies.history.filter(s => s.date === dateStr);
                const mins = dayStudies.reduce((acc, s) => acc + (parseInt(s.durationMinutes, 10) || 0), 0);
                dataValues.push(Number((mins / 60).toFixed(1)));
            } else if (this.state.activeMetric === 'tasks') {
                const dayTasks = this.state.rawData.tasks.filter(t => (t.completedAt === dateStr || t.dueDate === dateStr) && t.status === 'completed');
                dataValues.push(dayTasks.length);
            } else if (this.state.activeMetric === 'accuracy') {
                const dayStudies = this.state.rawData.studies.history.filter(s => s.date === dateStr);
                const q = dayStudies.reduce((acc, s) => acc + (parseInt(s.questions, 10) || 0), 0);
                const c = dayStudies.reduce((acc, s) => acc + (parseInt(s.correct, 10) || 0), 0);
                dataValues.push(q > 0 ? Math.round((c / q) * 100) : 0);
            }
        }

        const hasData = dataValues.some(v => v > 0);
        if (emptyState) {
            emptyState.style.display = hasData ? 'none' : 'flex';
        }

        if (this.state.chartInstance) {
            this.state.chartInstance.destroy();
        }

        const metricLabelsMap = {
            study: 'Horas de Estudo (h)',
            tasks: 'Tarefas Concluídas',
            accuracy: 'Aproveitamento (%)'
        };

        this.state.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: metricLabelsMap[this.state.activeMetric],
                    data: dataValues,
                    borderColor: '#27de80',
                    backgroundColor: 'rgba(39, 222, 128, 0.08)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.2,
                    pointRadius: daysCount > 30 ? 0 : 3,
                    pointBackgroundColor: '#27de80'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#151917',
                        borderColor: '#303632',
                        borderWidth: 1,
                        titleColor: '#f0f6f2',
                        bodyColor: '#8b949e'
                    }
                },
                scales: {
                    x: {
                        grid: { color: '#212623' },
                        ticks: { color: '#8b949e', font: { size: 10 } }
                    },
                    y: {
                        grid: { color: '#212623' },
                        ticks: { color: '#8b949e', font: { size: 10 } },
                        beginAtZero: true
                    }
                }
            }
        });
    },

    /* =========================================================
       6. COMPARAÇÃO ENTRE PERÍODOS E HISTÓRICO CONSOLIDADO
       ========================================================= */

    renderComparison() {
        const container = document.getElementById('comparison-metrics-container');
        if (!container) return;

        if (this.state.timeframe === 'all' || typeof this.state.timeframe !== 'number') {
            container.innerHTML = `<p class="empty-message">Selecione um período delimitado (ex: 30 dias) para ativar o comparativo.</p>`;
            return;
        }

        const days = this.state.timeframe;
        const now = new Date();
        
        const currentTasks = this.state.rawData.tasks.filter(t => this.isDateWithinTimeframe(t.completedAt || t.dueDate) && t.status === 'completed').length;
        
        const pastTasks = this.state.rawData.tasks.filter(t => {
            if (!t.completedAt && !t.dueDate) return false;
            const d = new Date(t.completedAt || t.dueDate);
            const diff = (now - d) / (1000 * 3600 * 24);
            return diff > days && diff <= (days * 2);
        }).filter(t => t.status === 'completed').length;

        const diff = currentTasks - pastTasks;
        const sign = diff >= 0 ? '+' : '';

        container.innerHTML = `
            <div class="stat-row"><span>Tarefas Concluídas (Ciclo Atual):</span> <strong>${currentTasks}</strong></div>
            <div class="stat-row"><span>Tarefas Concluídas (Ciclo Anterior):</span> <strong>${pastTasks}</strong></div>
            <div class="stat-row"><span>Variação de Produtividade:</span> <strong style="color: ${diff >= 0 ? 'var(--color-accent)' : 'var(--color-danger)'};">${sign}${diff} tarefas</strong></div>
        `;
    },

    renderUnifiedHistory() {
        const container = document.getElementById('unified-history-container');
        if (!container) return;

        let events = [];

        this.state.rawData.tasks.forEach(t => {
            if (t.completedAt) {
                events.push({ date: t.completedAt, text: `Tarefa concluída: "${t.title}"`, origin: 'Tarefas' });
            }
        });

        this.state.rawData.studies.history.forEach(s => {
            if (s.date) {
                events.push({ date: s.date, text: `Sessão de estudo registada (${s.durationMinutes} min)`, origin: 'Estudos' });
            }
        });

        this.state.rawData.goals.forEach(g => {
            if (g.completedAt) {
                events.push({ date: g.completedAt.split('T')[0], text: `Meta alcançada: "${g.title}"`, origin: 'Metas' });
            }
        });

        events.sort((a, b) => b.date.localeCompare(a.date));
        const filteredEvents = events.filter(e => this.isDateWithinTimeframe(e.date)).slice(0, 10);

        if (filteredEvents.length === 0) {
            container.innerHTML = `<p class="empty-message">Nenhum registo recente encontrado no período.</p>`;
            return;
        }

        container.innerHTML = filteredEvents.map(ev => `
            <div class="stat-row" style="padding: 0.35rem 0; border-bottom: 1px solid var(--color-border-subtle);">
                <span>[${ev.origin}] ${this.escapeHTML(ev.text)}</span>
                <strong style="font-size: 0.75rem; color: var(--color-text-muted);">${ev.date.split('-').reverse().join('/')}</strong>
            </div>
        `).join('');
    },

    /* =========================================================
       7. UTILITÁRIOS
       ========================================================= */

    formatMinutesToHours(minutes) {
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hrs}h ${String(mins).padStart(2, '0')}m`;
    },

    setDOMText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    },

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;

        toast.textContent = message;
        toast.style.borderColor = type === 'error' ? 'var(--color-danger)' : 'var(--color-accent)';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },

    escapeHTML(str) {
        return String(str || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[m]);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ProfileApp.init();
});