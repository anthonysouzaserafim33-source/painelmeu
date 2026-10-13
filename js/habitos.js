document.addEventListener('DOMContentLoaded', () => {
    HabitsApp.init();
});

const HabitsApp = {
    // Chaves de armazenamento no LocalStorage
    STORAGE_KEYS: {
        HABITS: 'habitos',
        REGISTROS: 'habitos_registros'
    },

    // Estado Geral da Aplicação
    state: {
        habits: [],
        records: [],
        filters: {
            search: '',
            category: 'all',
            status: 'active',
            frequency: 'all',
            sort: 'recent'
        },
        overviewPeriod: 30,
        chartPeriod: 30,
        consistencyMonth: new Date().toISOString().slice(0, 7) // AAAA-MM
    },

    // Instâncias ativas do Chart.js
    charts: {
        evolution: null,
        category: null,
        weekday: null
    },

    /**
     * Inicialização e carregamento
     */
    init() {
        this.loadData();
        this.setupDateDisplay();
        this.bindEvents();
        this.renderAll();
    },

    /* ==========================================================================
       1. PERSISTÊNCIA DE DADOS (LOCAL STORAGE)
       ========================================================================== */
    loadData() {
        try {
            const rawHabits = localStorage.getItem(this.STORAGE_KEYS.HABITS);
            const rawRecords = localStorage.getItem(this.STORAGE_KEYS.REGISTROS);

            this.state.habits = rawHabits ? JSON.parse(rawHabits) : [];
            this.state.records = rawRecords ? JSON.parse(rawRecords) : [];
        } catch (error) {
            console.error('Erro ao carregar dados do LocalStorage:', error);
            this.state.habits = [];
            this.state.records = [];
        }
    },

    saveHabits() {
        localStorage.setItem(this.STORAGE_KEYS.HABITS, JSON.stringify(this.state.habits));
    },

    saveRecords() {
        localStorage.setItem(this.STORAGE_KEYS.REGISTROS, JSON.stringify(this.state.records));
    },

    /* ==========================================================================
       2. REGRAS DE NEGÓCIO E MOTORES DE CÁLCULO
       ========================================================================== */

    /**
     * Data atual no formato local AAAA-MM-DD
     */
    getTodayDateString() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    /**
     * Verifica se o hábito está agendado para uma data específica
     */
    isHabitScheduledForDate(habit, dateString) {
        if (habit.status === 'paused') return false;

        const date = new Date(dateString + 'T00:00:00');
        const dayOfWeek = date.getDay(); // 0 = Dom, 1 = Seg, ..., 6 = Sáb

        if (habit.createdAt && dateString < habit.createdAt.slice(0, 10)) {
            return false;
        }

        if (habit.status === 'archived' && habit.archivedAt && dateString > habit.archivedAt.slice(0, 10)) {
            return false;
        }

        switch (habit.frequency) {
            case 'daily':
                return true;
            case 'weekdays':
                return dayOfWeek >= 1 && dayOfWeek <= 5;
            case 'specific':
                return Array.isArray(habit.frequencyDays) && habit.frequencyDays.includes(dayOfWeek);
            default:
                return true;
        }
    },

    /**
     * Filtra registros de um hábito por intervalo de datas
     */
    getHabitRecords(habitId, startDate, endDate) {
        return this.state.records.filter(r => {
            if (r.habitId !== habitId) return false;
            if (startDate && r.date < startDate) return false;
            if (endDate && r.date > endDate) return false;
            return true;
        });
    },

    /**
     * Calcula a sequência atual e a melhor sequência histórica
     */
    calculateStreak(habit) {
        const todayStr = this.getTodayDateString();
        let currentStreak = 0;
        let bestStreak = 0;
        let tempStreak = 0;

        const d = new Date();
        let checkDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        let isCurrentStreakActive = true;

        for (let i = 0; i < 365; i++) {
            const dateStr = checkDate.toISOString().split('T')[0];

            if (habit.createdAt && dateStr < habit.createdAt.slice(0, 10)) break;

            const isScheduled = this.isHabitScheduledForDate(habit, dateStr);

            if (isScheduled) {
                const record = this.state.records.find(r => r.habitId === habit.id && r.date === dateStr);
                const isCompleted = record ? record.completed : false;

                if (isCompleted) {
                    tempStreak++;
                    if (tempStreak > bestStreak) bestStreak = tempStreak;
                    if (isCurrentStreakActive) currentStreak = tempStreak;
                } else {
                    if (dateStr !== todayStr) {
                        isCurrentStreakActive = false;
                        tempStreak = 0;
                    }
                }
            }

            checkDate.setDate(checkDate.getDate() - 1);
        }

        return { currentStreak, bestStreak };
    },

    /**
     * Taxa de Conclusão (%) nos últimos X dias
     */
    calculateCompletionRate(habit, daysLimit = 30) {
        let expectedCount = 0;
        let completedCount = 0;

        const d = new Date();

        for (let i = 0; i < daysLimit; i++) {
            const checkDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
            const dateStr = checkDate.toISOString().split('T')[0];

            if (habit.createdAt && dateStr < habit.createdAt.slice(0, 10)) break;

            if (this.isHabitScheduledForDate(habit, dateStr)) {
                expectedCount++;
                const record = this.state.records.find(r => r.habitId === habit.id && r.date === dateStr);
                if (record && record.completed) completedCount++;
            }
        }

        if (expectedCount === 0) return 0;
        return Math.round((completedCount / expectedCount) * 100);
    },

    /* ==========================================================================
       3. AÇÕES DO USUÁRIO
       ========================================================================== */

    toggleHabitCompletion(habitId, dateStr = this.getTodayDateString()) {
        const habit = this.state.habits.find(h => h.id === habitId);
        if (!habit) return;

        let record = this.state.records.find(r => r.habitId === habitId && r.date === dateStr);

        if (record) {
            if (record.completed) {
                record.completed = false;
                record.value = 0;
            } else {
                record.completed = true;
                record.value = habit.target || 1;
            }
        } else {
            this.state.records.push({
                id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                habitId,
                date: dateStr,
                completed: true,
                value: habit.target || 1,
                notes: '',
                createdAt: new Date().toISOString()
            });
        }

        this.saveRecords();
        this.renderAll();
        this.showToast('Progresso atualizado!');
    },

    saveHabitFromModal(formData) {
        const { id, name, category, frequency, frequencyDays, preferredTime, targetType, target, unit, description, status } = formData;

        if (!name || !category) {
            this.showToast('Preencha o nome e a categoria.');
            return;
        }

        if (id) {
            const index = this.state.habits.findIndex(h => h.id === id);
            if (index !== -1) {
                this.state.habits[index] = {
                    ...this.state.habits[index],
                    name,
                    description,
                    category,
                    frequency,
                    frequencyDays,
                    target: targetType === 'quantitative' ? parseFloat(target) || 1 : null,
                    unit: targetType === 'quantitative' ? unit : '',
                    preferredTime,
                    status: status || 'active',
                    archivedAt: status === 'archived' && !this.state.habits[index].archivedAt ? new Date().toISOString() : this.state.habits[index].archivedAt
                };
                this.showToast('Hábito atualizado com sucesso!');
            }
        } else {
            const newHabit = {
                id: 'hab_' + Date.now(),
                name,
                description,
                category,
                frequency,
                frequencyDays,
                target: targetType === 'quantitative' ? parseFloat(target) || 1 : null,
                unit: targetType === 'quantitative' ? unit : '',
                preferredTime,
                status: 'active',
                createdAt: new Date().toISOString(),
                archivedAt: null
            };
            this.state.habits.push(newHabit);
            this.showToast('Novo hábito criado!');
        }

        this.saveHabits();
        this.closeModal('habit-modal');
        this.renderAll();
    },

    saveRecordFromModal(habitId, dateStr, value, notes) {
        const habit = this.state.habits.find(h => h.id === habitId);
        if (!habit) return;

        const numericVal = parseFloat(value) || 0;
        const isCompleted = numericVal >= (habit.target || 1);

        let record = this.state.records.find(r => r.habitId === habitId && r.date === dateStr);

        if (record) {
            record.value = numericVal;
            record.completed = isCompleted;
            record.notes = notes;
        } else {
            this.state.records.push({
                id: 'rec_' + Date.now(),
                habitId,
                date: dateStr,
                completed: isCompleted,
                value: numericVal,
                notes,
                createdAt: new Date().toISOString()
            });
        }

        this.saveRecords();
        this.closeModal('record-modal');
        this.renderAll();
        this.showToast('Progresso registrado!');
    },

    archiveHabit(habitId) {
        const habit = this.state.habits.find(h => h.id === habitId);
        if (habit) {
            habit.status = 'archived';
            habit.archivedAt = new Date().toISOString();
            this.saveHabits();
            this.renderAll();
            this.showToast('Hábito arquivado.');
        }
    },

    pauseHabit(habitId) {
        const habit = this.state.habits.find(h => h.id === habitId);
        if (habit) {
            habit.status = habit.status === 'paused' ? 'active' : 'paused';
            this.saveHabits();
            this.renderAll();
            this.showToast(habit.status === 'paused' ? 'Hábito pausado.' : 'Hábito reativado.');
        }
    },

    /* ==========================================================================
       4. INTERFACE E RENDERIZAÇÃO
       ========================================================================== */

    renderAll() {
        this.updateCategoryOptions();
        this.renderOverview();
        this.renderToday();
        this.renderHabitsList();
        this.renderAttention();
        this.renderHeatmap();
        this.renderHistory();
        this.renderCharts();
    },

    setupDateDisplay() {
        const dateElement = document.getElementById('header-date');
        const todayDisplay = document.getElementById('today-date-display');
        const now = new Date();

        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        const formattedDate = now.toLocaleDateString('pt-BR', options);

        if (dateElement) {
            dateElement.textContent = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
            dateElement.setAttribute('datetime', this.getTodayDateString());
        }

        if (todayDisplay) {
            const shortOptions = { day: '2-digit', month: 'short' };
            todayDisplay.textContent = now.toLocaleDateString('pt-BR', shortOptions).toUpperCase();
        }
    },

    renderOverview() {
        const todayStr = this.getTodayDateString();
        const activeHabits = this.state.habits.filter(h => h.status === 'active');

        const scheduledToday = activeHabits.filter(h => this.isHabitScheduledForDate(h, todayStr));
        const completedToday = scheduledToday.filter(h => {
            const rec = this.state.records.find(r => r.habitId === h.id && r.date === todayStr);
            return rec && rec.completed;
        });

        const periodDays = parseInt(this.state.overviewPeriod) || 30;
        let maxStreak = 0;
        let currentStreakSum = 0;

        activeHabits.forEach(habit => {
            const { currentStreak, bestStreak } = this.calculateStreak(habit);
            if (bestStreak > maxStreak) maxStreak = bestStreak;
            currentStreakSum += currentStreak;
        });

        const globalRate = activeHabits.length > 0
            ? Math.round(activeHabits.reduce((acc, h) => acc + this.calculateCompletionRate(h, periodDays), 0) / activeHabits.length)
            : 0;

        this.setDOMText('[data-habit-stat="todayProgress"]', `${completedToday.length}/${scheduledToday.length}`);
        this.setDOMText('[data-habit-stat="completionRate"]', `${globalRate}%`);
        this.setDOMText('[data-habit-stat="currentStreak"]', activeHabits.length ? `${Math.round(currentStreakSum / activeHabits.length)} dias` : '0 dias');
        this.setDOMText('[data-habit-stat="bestStreak"]', `${maxStreak} dias`);
        this.setDOMText('[data-habit-stat="activeHabits"]', activeHabits.length);
        this.setDOMText('[data-habit-stat="totalRecords"]', this.state.records.filter(r => r.completed).length);
    },

    renderToday() {
        const container = document.getElementById('today-habits-list');
        if (!container) return;

        const todayStr = this.getTodayDateString();
        const scheduledHabits = this.state.habits.filter(h => h.status === 'active' && this.isHabitScheduledForDate(h, todayStr));

        if (scheduledHabits.length === 0) {
            container.innerHTML = `<p class="empty-message">Nenhum hábito agendado para hoje. Aproveite o dia!</p>`;
            return;
        }

        container.innerHTML = scheduledHabits.map(habit => {
            const record = this.state.records.find(r => r.habitId === habit.id && r.date === todayStr);
            const isCompleted = record ? record.completed : false;
            const value = record ? record.value || 0 : 0;
            const target = habit.target || 1;
            const percent = habit.target ? Math.min(100, Math.round((value / target) * 100)) : (isCompleted ? 100 : 0);

            return `
                <article class="today-card ${isCompleted ? 'completed' : ''}">
                    <div class="today-card-header">
                        <div class="today-card-info">
                            <span class="habit-category-badge">${this.escapeHTML(habit.category)}</span>
                            <h3>${this.escapeHTML(habit.name)}</h3>
                            ${habit.preferredTime ? `<p>⏰ ${habit.preferredTime}</p>` : ''}
                        </div>
                        <button type="button" 
                                class="habit-checkbox-btn" 
                                data-action="toggle-today" 
                                data-id="${habit.id}" 
                                aria-label="Marcar ${this.escapeHTML(habit.name)} como concluído">
                            ${isCompleted ? '✓' : ''}
                        </button>
                    </div>

                    ${habit.target ? `
                        <div class="today-quantitative-info">
                            <div class="today-card-footer">
                                <span>Progresso: ${value} / ${habit.target}${habit.unit || ''}</span>
                                <strong>${percent}%</strong>
                            </div>
                            <div class="today-progress-bar">
                                <div class="today-progress-fill" style="width: ${percent}%"></div>
                            </div>
                        </div>
                    ` : ''}

                    <div class="today-card-footer">
                        <span>🔥 ${this.calculateStreak(habit).currentStreak} dias de sequência</span>
                        ${habit.target ? `<button type="button" class="text-button" data-action="open-record" data-id="${habit.id}">+ Registrar</button>` : ''}
                    </div>
                </article>
            `;
        }).join('');
    },

    renderHabitsList() {
        const container = document.getElementById('habits-list');
        const countDisplay = document.getElementById('habits-result-count');
        if (!container) return;

        let filtered = [...this.state.habits];

        if (this.state.filters.search) {
            const term = this.state.filters.search.toLowerCase();
            filtered = filtered.filter(h => h.name.toLowerCase().includes(term) || h.category.toLowerCase().includes(term));
        }

        if (this.state.filters.category !== 'all') {
            filtered = filtered.filter(h => h.category === this.state.filters.category);
        }

        if (this.state.filters.status !== 'all') {
            filtered = filtered.filter(h => h.status === this.state.filters.status);
        }

        if (this.state.filters.frequency !== 'all') {
            filtered = filtered.filter(h => h.frequency === this.state.filters.frequency);
        }

        filtered.sort((a, b) => {
            if (this.state.filters.sort === 'name') return a.name.localeCompare(b.name);
            if (this.state.filters.sort === 'streak') return this.calculateStreak(b).currentStreak - this.calculateStreak(a).currentStreak;
            if (this.state.filters.sort === 'rate-desc') return this.calculateCompletionRate(b) - this.calculateCompletionRate(a);
            if (this.state.filters.sort === 'rate-asc') return this.calculateCompletionRate(a) - this.calculateCompletionRate(b);
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        if (countDisplay) countDisplay.textContent = `${filtered.length} hábito(s) encontrado(s)`;

        if (filtered.length === 0) {
            container.innerHTML = `<p class="empty-message">Nenhum hábito encontrado com os filtros selecionados.</p>`;
            return;
        }

        container.innerHTML = filtered.map(habit => {
            const streak = this.calculateStreak(habit);
            const rate = this.calculateCompletionRate(habit, 30);

            return `
                <article class="habit-management-card">
                    <div class="habit-card-header">
                        <div>
                            <span class="habit-category-badge">${this.escapeHTML(habit.category)}</span>
                            <h3>${this.escapeHTML(habit.name)}</h3>
                        </div>
                        <div class="habit-card-actions">
                            <button type="button" data-action="edit-habit" data-id="${habit.id}">Editar</button>
                            <button type="button" data-action="pause-habit" data-id="${habit.id}">${habit.status === 'paused' ? 'Reativar' : 'Pausar'}</button>
                            ${habit.status !== 'archived' ? `<button type="button" data-action="archive-habit" data-id="${habit.id}">Arquivar</button>` : ''}
                        </div>
                    </div>

                    <p class="habit-description">${this.escapeHTML(habit.description || 'Sem descrição.')}</p>

                    <div class="today-progress-bar">
                        <div class="today-progress-fill" style="width: ${rate}%"></div>
                    </div>

                    <div class="today-card-footer">
                        <span>🔥 ${streak.currentStreak} dias (Maior: ${streak.bestStreak})</span>
                        <strong>Consistência: ${rate}%</strong>
                    </div>
                </article>
            `;
        }).join('');
    },

    renderAttention() {
        const container = document.getElementById('attention-list');
        if (!container) return;

        const activeHabits = this.state.habits.filter(h => h.status === 'active');
        const criticalHabits = activeHabits
            .map(h => ({ habit: h, rate: this.calculateCompletionRate(h, 30) }))
            .filter(item => item.rate < 60)
            .sort((a, b) => a.rate - b.rate);

        if (criticalHabits.length === 0) {
            container.innerHTML = `<p class="empty-message">Excelente! Todos os seus hábitos estão com taxa de consistência acima de 60%.</p>`;
            return;
        }

        container.innerHTML = criticalHabits.map(({ habit, rate }) => `
            <article class="attention-card">
                <div>
                    <h4>${this.escapeHTML(habit.name)}</h4>
                    <p>Categoria: ${this.escapeHTML(habit.category)}</p>
                </div>
                <div class="attention-rate">
                    ${rate}%
                </div>
            </article>
        `).join('');
    },

    renderHeatmap() {
        const container = document.getElementById('consistency-heatmap');
        if (!container) return;

        const [year, month] = this.state.consistencyMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        const activeHabits = this.state.habits.filter(h => h.status === 'active');

        let html = '';

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const scheduled = activeHabits.filter(h => this.isHabitScheduledForDate(h, dateStr));
            const completed = scheduled.filter(h => {
                const rec = this.state.records.find(r => r.habitId === h.id && r.date === dateStr);
                return rec && rec.completed;
            });

            let level = 'level-0';
            if (scheduled.length > 0) {
                const ratio = completed.length / scheduled.length;
                if (ratio > 0.8) level = 'level-4';
                else if (ratio > 0.5) level = 'level-3';
                else if (ratio > 0.2) level = 'level-2';
                else if (ratio > 0) level = 'level-1';
            }

            html += `<div class="heatmap-day ${level}" title="${dateStr}: ${completed.length}/${scheduled.length} concluídos">${day}</div>`;
        }

        container.innerHTML = html;
    },

    renderHistory() {
        const container = document.getElementById('global-history');
        const countDisplay = document.getElementById('history-visible-count');
        const dateFilter = document.getElementById('history-date-filter')?.value;
        if (!container) return;

        let records = [...this.state.records];
        if (dateFilter) {
            records = records.filter(r => r.date === dateFilter);
        }

        records.sort((a, b) => b.date.localeCompare(a.date));

        if (countDisplay) countDisplay.textContent = `${records.length} registo(s)`;

        if (records.length === 0) {
            container.innerHTML = `<p class="empty-message">Nenhum registro de execução encontrado.</p>`;
            return;
        }

        const grouped = {};
        records.forEach(r => {
            if (!grouped[r.date]) grouped[r.date] = [];
            grouped[r.date].push(r);
        });

        container.innerHTML = Object.keys(grouped).map(dateStr => {
            const dayRecords = grouped[dateStr];
            return `
                <div class="history-group">
                    <div class="history-group-header">${dateStr}</div>
                    ${dayRecords.map(r => {
                        const habit = this.state.habits.find(h => h.id === r.habitId);
                        const habitName = habit ? habit.name : 'Hábito Removido';
                        return `
                            <div class="history-item">
                                <div>
                                    <strong>${this.escapeHTML(habitName)}</strong>${r.value ? `<span> — ${r.value} ${habit?.unit || ''}</span>` : ''}
                                    ${r.notes ? `<p class="history-notes">"${this.escapeHTML(r.notes)}"</p>` : ''}
                                </div>
                                <span class="history-item-status ${r.completed ? 'status-success' : 'status-failed'}">
                                    ${r.completed ? '✓' : '✗'}
                                </span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }).join('');
    },

    /* ==========================================================================
       5. RENDERIZAÇÃO DE GRÁFICOS (CHART.JS)
       ========================================================================== */
    renderCharts() {
        if (typeof Chart === 'undefined') return;

        const period = parseInt(this.state.chartPeriod) || 30;
        const activeHabits = this.state.habits.filter(h => h.status === 'active');

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);
        const cutoffStr = cutoffDate.toISOString().split('T')[0];

        const recentCompletedRecords = this.state.records.filter(r => r.completed && r.date >= cutoffStr);

        this.updateNoDataBadges({
            evolution: recentCompletedRecords.length > 0,
            category: activeHabits.length > 0,
            weekday: recentCompletedRecords.length > 0
        });

        // 1. Gráfico de Evolução (Linha)
        const evolutionCtx = document.getElementById('evolution-chart')?.getContext('2d');
        if (evolutionCtx) {
            const labels = [];
            const data = [];
            const d = new Date();

            for (let i = period - 1; i >= 0; i--) {
                const checkDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
                const dateStr = checkDate.toISOString().split('T')[0];

                labels.push(checkDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));

                const scheduled = activeHabits.filter(h => this.isHabitScheduledForDate(h, dateStr));
                const completed = scheduled.filter(h => {
                    const rec = this.state.records.find(r => r.habitId === h.id && r.date === dateStr);
                    return rec && rec.completed;
                });

                const rate = scheduled.length > 0 ? Math.round((completed.length / scheduled.length) * 100) : 0;
                data.push(rate);
            }

            if (this.charts.evolution) this.charts.evolution.destroy();

            this.charts.evolution = new Chart(evolutionCtx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Taxa de Conclusão (%)',
                        data,
                        borderColor: '#27DE80',
                        backgroundColor: 'rgba(39, 222, 128, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { min: 0, max: 100, grid: { color: '#262927' }, ticks: { color: '#9CA3AF' } },
                        x: { grid: { color: '#262927' }, ticks: { color: '#9CA3AF' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // 2. Gráfico por Categoria (Barras)
        const categoryCtx = document.getElementById('category-chart')?.getContext('2d');
        if (categoryCtx) {
            const categoryTotals = {};

            activeHabits.forEach(h => {
                const cat = h.category?.trim() || 'Geral';
                if (!(cat in categoryTotals)) categoryTotals[cat] = 0;
            });

            recentCompletedRecords.forEach(record => {
                const habit = this.state.habits.find(h => h.id === record.habitId);
                if (habit) {
                    const cat = habit.category?.trim() || 'Geral';
                    categoryTotals[cat] = (categoryTotals[cat] || 0) + 1;
                }
            });

            if (this.charts.category) this.charts.category.destroy();

            this.charts.category = new Chart(categoryCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(categoryTotals),
                    datasets: [{
                        label: 'Conclusões',
                        data: Object.values(categoryTotals),
                        backgroundColor: '#27DE80',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#262927' }, ticks: { color: '#9CA3AF', stepSize: 1 } },
                        x: { grid: { color: '#262927' }, ticks: { color: '#9CA3AF' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // 3. Gráfico por Dia da Semana (Barras)
        const weekdayCtx = document.getElementById('weekday-chart')?.getContext('2d');
        if (weekdayCtx) {
            const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];

            recentCompletedRecords.forEach(record => {
                const recordDate = new Date(record.date + 'T00:00:00');
                weekdayCounts[recordDate.getDay()]++;
            });

            if (this.charts.weekday) this.charts.weekday.destroy();

            this.charts.weekday = new Chart(weekdayCtx, {
                type: 'bar',
                data: {
                    labels: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
                    datasets: [{
                        label: 'Conclusões',
                        data: weekdayCounts,
                        backgroundColor: '#3B82F6',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#262927' }, ticks: { color: '#9CA3AF', stepSize: 1 } },
                        x: { grid: { color: '#262927' }, ticks: { color: '#9CA3AF' } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    },

    updateNoDataBadges(statusMap) {
        const evolutionSummary = document.getElementById('evolution-chart-summary');
        if (evolutionSummary) evolutionSummary.style.display = statusMap.evolution ? 'none' : 'inline-block';

        const categorySummary = document.getElementById('category-chart-summary');
        if (categorySummary) categorySummary.style.display = statusMap.category ? 'none' : 'inline-block';

        const weekdaySummary = document.getElementById('weekday-chart-summary');
        if (weekdaySummary) weekdaySummary.style.display = statusMap.weekday ? 'none' : 'inline-block';
    },

    /* ==========================================================================
       6. VINCULAÇÃO DE EVENTOS
       ========================================================================== */
    bindEvents() {
        // Delegação de eventos globais
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const id = target.dataset.id;

            if (action === 'toggle-today') this.toggleHabitCompletion(id);
            if (action === 'edit-habit') this.openHabitModal(id);
            if (action === 'pause-habit') this.pauseHabit(id);
            if (action === 'archive-habit') this.archiveHabit(id);
            if (action === 'open-record') this.openRecordModal(id);
        });

        // Fechar modais ao clicar no backdrop ou em botões de fechar
        document.addEventListener('click', (e) => {
            const closeModalBtn = e.target.closest('[data-close-modal]');
            if (closeModalBtn) {
                const modalId = closeModalBtn.dataset.closeModal;
                this.closeModal(modalId);
            }
        });

        // Fechar modais ao teclar ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal('habit-modal');
                this.closeModal('record-modal');
            }
        });

        // Botões de Abertura de Novo Hábito
        document.getElementById('new-habit-button')?.addEventListener('click', () => this.openHabitModal());
        document.getElementById('management-new-habit-button')?.addEventListener('click', () => this.openHabitModal());

        // Submissão do Formulário de Hábitos
        document.getElementById('habit-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const days = Array.from(document.querySelectorAll('input[name="habit-days"]:checked')).map(cb => parseInt(cb.value));

            this.saveHabitFromModal({
                id: document.getElementById('habit-id').value,
                name: document.getElementById('habit-name').value,
                description: document.getElementById('habit-description').value,
                category: document.getElementById('habit-category').value,
                frequency: document.getElementById('habit-frequency').value,
                frequencyDays: days,
                preferredTime: document.getElementById('habit-preferred-time').value,
                targetType: document.getElementById('habit-target-type').value,
                target: document.getElementById('habit-target-value').value,
                unit: document.getElementById('habit-unit').value,
                status: document.getElementById('habit-status')?.value
            });
        });

        // Submissão do Formulário de Registros Quantitativos
        document.getElementById('record-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveRecordFromModal(
                document.getElementById('record-habit-id').value,
                document.getElementById('record-date').value,
                document.getElementById('record-value').value,
                document.getElementById('record-notes').value
            );
        });

        // Exibição condicional de campos nos modais
        document.getElementById('habit-frequency')?.addEventListener('change', (e) => {
            const daysContainer = document.getElementById('frequency-days-container');
            if (daysContainer) daysContainer.hidden = e.target.value !== 'specific';
        });

        document.getElementById('habit-target-type')?.addEventListener('change', (e) => {
            const quantFields = document.getElementById('quantitative-fields');
            if (quantFields) quantFields.hidden = e.target.value !== 'quantitative';
        });

        // Filtros dinâmicos
        document.getElementById('habit-search')?.addEventListener('input', (e) => {
            this.state.filters.search = e.target.value;
            this.renderHabitsList();
        });

        document.getElementById('habit-category-filter')?.addEventListener('change', (e) => {
            this.state.filters.category = e.target.value;
            this.renderHabitsList();
        });

        document.getElementById('habit-status-filter')?.addEventListener('change', (e) => {
            this.state.filters.status = e.target.value;
            this.renderHabitsList();
        });

        document.getElementById('habit-frequency-filter')?.addEventListener('change', (e) => {
            this.state.filters.frequency = e.target.value;
            this.renderHabitsList();
        });

        document.getElementById('habit-sort')?.addEventListener('change', (e) => {
            this.state.filters.sort = e.target.value;
            this.renderHabitsList();
        });

        document.getElementById('clear-habit-filters')?.addEventListener('click', () => {
            this.state.filters = { search: '', category: 'all', status: 'active', frequency: 'all', sort: 'recent' };
            
            const searchInput = document.getElementById('habit-search');
            const categoryFilter = document.getElementById('habit-category-filter');
            const statusFilter = document.getElementById('habit-status-filter');
            const frequencyFilter = document.getElementById('habit-frequency-filter');
            const sortFilter = document.getElementById('habit-sort');

            if (searchInput) searchInput.value = '';
            if (categoryFilter) categoryFilter.value = 'all';
            if (statusFilter) statusFilter.value = 'active';
            if (frequencyFilter) frequencyFilter.value = 'all';
            if (sortFilter) sortFilter.value = 'recent';

            this.renderHabitsList();
        });

        // Controles de seções específicas
        document.getElementById('consistency-month-picker')?.addEventListener('change', (e) => {
            this.state.consistencyMonth = e.target.value;
            this.renderHeatmap();
        });

        document.getElementById('history-date-filter')?.addEventListener('change', () => {
            this.renderHistory();
        });

        document.getElementById('overview-period')?.addEventListener('change', (e) => {
            this.state.overviewPeriod = parseInt(e.target.value) || 30;
            this.renderOverview();
        });

        document.getElementById('chart-period')?.addEventListener('change', (e) => {
            this.state.chartPeriod = parseInt(e.target.value) || 30;
            this.renderCharts();
        });
    },

    openHabitModal(habitId = null) {
        const modal = document.getElementById('habit-modal');
        const form = document.getElementById('habit-form');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('habit-id').value = '';
        document.getElementById('habit-modal-title').textContent = habitId ? 'Editar hábito' : 'Novo hábito';
        
        const statusContainer = document.getElementById('status-field-container');
        if (statusContainer) statusContainer.hidden = !habitId;

        if (habitId) {
            const habit = this.state.habits.find(h => h.id === habitId);
            if (habit) {
                document.getElementById('habit-id').value = habit.id;
                document.getElementById('habit-name').value = habit.name;
                document.getElementById('habit-description').value = habit.description || '';
                document.getElementById('habit-category').value = habit.category;
                document.getElementById('habit-frequency').value = habit.frequency;
                document.getElementById('habit-preferred-time').value = habit.preferredTime || '';
                
                const statusSelect = document.getElementById('habit-status');
                if (statusSelect) statusSelect.value = habit.status;

                const isQuant = habit.target !== null;
                document.getElementById('habit-target-type').value = isQuant ? 'quantitative' : 'binary';
                document.getElementById('quantitative-fields').hidden = !isQuant;
                document.getElementById('habit-target-value').value = habit.target || '';
                document.getElementById('habit-unit').value = habit.unit || '';

                const isSpecific = habit.frequency === 'specific';
                document.getElementById('frequency-days-container').hidden = !isSpecific;
                if (isSpecific && Array.isArray(habit.frequencyDays)) {
                    document.querySelectorAll('input[name="habit-days"]').forEach(cb => {
                        cb.checked = habit.frequencyDays.includes(parseInt(cb.value));
                    });
                }
            }
        } else {
            document.getElementById('frequency-days-container').hidden = true;
            document.getElementById('quantitative-fields').hidden = true;
        }

        modal.hidden = false;
    },

    openRecordModal(habitId) {
        const habit = this.state.habits.find(h => h.id === habitId);
        if (!habit) return;

        const modal = document.getElementById('record-modal');
        const todayStr = this.getTodayDateString();
        const record = this.state.records.find(r => r.habitId === habitId && r.date === todayStr);

        document.getElementById('record-habit-id').value = habit.id;
        document.getElementById('record-date').value = todayStr;
        document.getElementById('record-habit-name-display').textContent = habit.name;
        document.getElementById('record-unit-display').textContent = habit.unit || '';
        document.getElementById('record-value').value = record ? record.value : '';
        document.getElementById('record-notes').value = record ? record.notes || '' : '';

        modal.hidden = false;
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.hidden = true;
    },

    /* ==========================================================================
       7. UTILITÁRIOS
       ========================================================================== */
    updateCategoryOptions() {
        const categories = [...new Set(this.state.habits.map(h => h.category))];
        const select = document.getElementById('habit-category-filter');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = `<option value="all">Todas</option>` +
            categories.map(c => `<option value="${this.escapeHTML(c)}">${this.escapeHTML(c)}</option>`).join('');
        select.value = currentValue;
    },

    setDOMText(selector, text) {
        const el = document.querySelector(selector);
        if (el) el.textContent = text;
    },

    showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;

        toast.textContent = message;
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

window.addEventListener('storage', (e) => {
    if (e.key === HabitsApp.STORAGE_KEYS.HABITS || e.key === HabitsApp.STORAGE_KEYS.REGISTROS) {
        HabitsApp.loadData();
        HabitsApp.renderAll();
    }
});