document.addEventListener('DOMContentLoaded', () => {
    GoalsApp.init();
});

const GoalsApp = {
    STORAGE_KEYS: {
        GOALS: 'metas',
        STEPS: 'metas_etapas',
        RECORDS: 'metas_registros',
        TASKS: 'painel_tarefas_v1' // Chave sincronizada com o tarefa_2.js[cite: 3]
    },

    state: {
        goals: [],
        steps: [],
        records: [],
        filters: {
            search: '',
            status: 'active',
            category: 'all',
            priority: 'all',
            sort: 'due-date'
        },
        currentModalGoalId: null
    },

    charts: {
        category: null
    },

    init() {
        this.loadData();
        this.setupDateDisplay();
        this.bindEvents();
        this.renderAll();
    },

    /* ==========================================================================
       1. PERSISTÊNCIA DE DADOS E BACKUP
       ========================================================================== */
    loadData() {
        try {
            const rawGoals = localStorage.getItem(this.STORAGE_KEYS.GOALS);
            const rawSteps = localStorage.getItem(this.STORAGE_KEYS.STEPS);
            const rawRecords = localStorage.getItem(this.STORAGE_KEYS.RECORDS);

            this.state.goals = rawGoals ? JSON.parse(rawGoals) : [];
            this.state.steps = rawSteps ? JSON.parse(rawSteps) : [];
            this.state.records = rawRecords ? JSON.parse(rawRecords) : [];
        } catch (error) {
            console.error('Erro ao carregar dados do LocalStorage:', error);
            this.state.goals = [];
            this.state.steps = [];
            this.state.records = [];
        }
    },

    saveGoals() {
        localStorage.setItem(this.STORAGE_KEYS.GOALS, JSON.stringify(this.state.goals));
    },

    saveSteps() {
        localStorage.setItem(this.STORAGE_KEYS.STEPS, JSON.stringify(this.state.steps));
    },

    saveRecords() {
        localStorage.setItem(this.STORAGE_KEYS.RECORDS, JSON.stringify(this.state.records));
    },

    exportData() {
        const backupData = {
            version: '1.2',
            exportDate: new Date().toISOString(),
            goals: this.state.goals,
            steps: this.state.steps,
            records: this.state.records
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `backup_metas_${this.getTodayDateString()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        this.showToast('Backup exportado com sucesso!');
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = JSON.parse(e.target.result);
                if (content && Array.isArray(content.goals)) {
                    if (confirm('A importação irá substituir todos os dados atuais. Deseja continuar?')) {
                        this.state.goals = content.goals || [];
                        this.state.steps = content.steps || [];
                        this.state.records = content.records || [];

                        this.saveGoals();
                        this.saveSteps();
                        this.saveRecords();
                        this.renderAll();
                        this.showToast('Dados importados com sucesso!');
                    }
                } else {
                    this.showToast('Ficheiro de backup inválido.');
                }
            } catch (err) {
                console.error('Erro ao processar JSON:', err);
                this.showToast('Erro ao ler o ficheiro de backup.');
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    },

    /* ==========================================================================
       2. REGRAS DE NEGÓCIO, CÁLCULOS E AUDITORIA
       ========================================================================== */
    getTodayDateString() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    calculateGoalProgress(goalId) {
        const goal = this.state.goals.find(g => g.id === goalId);
        if (!goal) return 0;

        if (goal.status === 'completed') return 100;

        if (goal.trackingType === 'manual') {
            return Math.min(100, Math.max(0, goal.progress || 0));
        }

        if (goal.trackingType === 'quantitative') {
            if (!goal.targetValue || goal.targetValue <= 0) return 0;
            const current = goal.currentValue || 0;
            const percentage = (current / goal.targetValue) * 100;
            return Math.min(100, Math.round(percentage));
        }

        if (goal.trackingType === 'steps') {
            const goalSteps = this.state.steps.filter(s => s.goalId === goalId);
            if (goalSteps.length === 0) return 0;
            const completedSteps = goalSteps.filter(s => s.status === 'completed').length;
            return Math.round((completedSteps / goalSteps.length) * 100);
        }

        return 0;
    },

    getGoalDueStatus(goal) {
        if (!goal.dueDate) return 'no-due';
        if (goal.status === 'completed') return 'completed';
        if (goal.status === 'archived') return 'archived';

        const todayStr = this.getTodayDateString();
        if (goal.dueDate === todayStr) return 'due-today';
        if (goal.dueDate < todayStr) return 'overdue';

        const dueDate = new Date(goal.dueDate + 'T00:00:00');
        const today = new Date(todayStr + 'T00:00:00');
        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays <= 7) return 'due-soon';
        return 'on-track';
    },

    addAuditRecord(goalId, type, note, extraData = {}) {
        const record = {
            id: 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            goalId,
            type,
            date: this.getTodayDateString(),
            note,
            previousProgress: extraData.previousProgress ?? null,
            newProgress: extraData.newProgress ?? null,
            createdAt: new Date().toISOString()
        };

        this.state.records.push(record);
        this.saveRecords();
    },

    calculateTrendForecast(goalId) {
        const goal = this.state.goals.find(g => g.id === goalId);
        if (!goal || goal.status === 'completed') return null;

        const records = this.state.records
            .filter(r => r.goalId === goalId && r.previousProgress !== null && r.newProgress !== null)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

        if (records.length < 2) {
            return { message: "Tendência em análise (necessita de pelo menos 2 registros de avanço)." };
        }

        const firstRecord = records[0];
        const lastRecord = records[records.length - 1];

        const firstDate = new Date(firstRecord.createdAt);
        const lastDate = new Date(lastRecord.createdAt);
        const daysElapsed = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

        const progressGained = lastRecord.newProgress - firstRecord.previousProgress;

        if (daysElapsed <= 0 || progressGained <= 0) {
            return { message: "Ritmo recente insuficiente para calcular projeção." };
        }

        const currentProgress = this.calculateGoalProgress(goalId);
        const remainingProgress = 100 - currentProgress;
        const dailyRate = progressGained / daysElapsed;

        const estimatedDaysRemaining = Math.ceil(remainingProgress / dailyRate);
        const estimatedCompletionDate = new Date();
        estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + estimatedDaysRemaining);

        const dateFormatted = estimatedCompletionDate.toLocaleDateString('pt-BR');

        if (goal.dueDate) {
            const dueDateObj = new Date(goal.dueDate + 'T23:59:59');
            const diffTime = dueDateObj - estimatedCompletionDate;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0) {
                return {
                    status: 'positive',
                    message: `🚀 No ritmo atual, você concluirá esta meta em **${dateFormatted}** (${diffDays} dias antes do prazo!).`
                };
            } else {
                return {
                    status: 'warning',
                    message: `⚠️ No ritmo atual, a meta só será concluída em **${dateFormatted}** (${Math.abs(diffDays)} dias após o prazo). Considere intensificar o ritmo.`
                };
            }
        }

        return {
            status: 'neutral',
            message: `📈 No ritmo atual, a estimativa de conclusão é **${dateFormatted}**.`
        };
    },

    /* ==========================================================================
       3. INTEGRAÇÃO COM MÓDULO DE TAREFAS (tarefa.js)
       ========================================================================== */
    exportStepToTask(stepId) {
        const step = this.state.steps.find(s => s.id === stepId);
        if (!step) return;

        const goal = this.state.goals.find(g => g.id === step.goalId);
        const goalTitle = goal ? goal.title : 'Meta';

        try {
            const rawTasks = localStorage.getItem(this.STORAGE_KEYS.TASKS);
            const tasks = rawTasks ? JSON.parse(rawTasks) : [];

            const existingTask = tasks.find(t => t.originStepId === stepId);
            if (existingTask) {
                this.showToast('Esta etapa já foi exportada como tarefa!');
                return;
            }

            const newTask = {
                id: 'task_from_goal_' + Date.now(),
                title: `[Meta: ${goalTitle}] ${step.title}`,
                description: `Tarefa gerada a partir da etapa da meta: "${goalTitle}"`,
                category: 'personal',
                priority: 'medium',
                status: step.status === 'completed' ? 'completed' : 'pending',
                dueDate: this.getTodayDateString(),
                dueTime: '',
                type: 'single',
                estimatedTime: '',
                notes: '',
                important: false,
                originStepId: step.id,
                originGoalId: step.goalId,
                createdAt: new Date().toISOString()
            };

            tasks.push(newTask);
            localStorage.setItem(this.STORAGE_KEYS.TASKS, JSON.stringify(tasks));

            this.addAuditRecord(step.goalId, 'step_changed', `Etapa "${step.title}" exportada para o Painel de Tarefas.`);
            this.showToast('Etapa exportada para o Gerenciador de Tarefas!');
        } catch (error) {
            console.error('Erro ao exportar tarefa:', error);
            this.showToast('Erro ao integrar com o módulo de Tarefas.');
        }
    },

    /* ==========================================================================
       4. AÇÕES DO UTILIZADOR
       ========================================================================== */
    saveGoalFromModal(formData) {
        const { id, title, description, category, priority, startDate, dueDate, trackingType, targetValue, unit, status } = formData;

        if (!title.trim() || !category.trim()) {
            this.showToast('Preencha o título e a categoria.');
            return;
        }

        const today = this.getTodayDateString();
        const start = startDate || today;

        if (dueDate && start > dueDate) {
            this.showToast('A data de início não pode ser posterior ao prazo.');
            return;
        }

        if (id) {
            const goal = this.state.goals.find(g => g.id === id);
            if (goal) {
                const changes = [];
                if (goal.title !== title.trim()) changes.push(`Título alterado para "${title.trim()}"`);
                if (goal.dueDate !== (dueDate || null)) changes.push(`Prazo alterado para ${dueDate ? dueDate.split('-').reverse().join('/') : 'Sem prazo'}`);
                if (goal.priority !== priority) changes.push(`Prioridade alterada para ${priority}`);

                goal.title = title.trim();
                goal.description = description.trim();
                goal.category = category.trim();
                goal.priority = priority;
                goal.startDate = start;
                goal.dueDate = dueDate || null;
                goal.trackingType = trackingType;
                goal.status = status || goal.status;

                if (trackingType === 'quantitative') {
                    goal.targetValue = parseFloat(targetValue) || 1;
                    goal.unit = unit.trim() || 'unidades';
                    if (goal.currentValue === undefined) goal.currentValue = 0;
                }

                goal.updatedAt = new Date().toISOString();
                this.saveGoals();

                this.addAuditRecord(
                    goal.id, 
                    'updated_info', 
                    changes.length > 0 ? changes.join('; ') : 'Informações e dados da meta atualizados.'
                );

                this.closeModal('goal-modal');
                this.renderAll();
                this.showToast('Meta atualizada com sucesso!');
            }
        } else {
            const newGoalId = 'goal_' + Date.now();
            const newGoal = {
                id: newGoalId,
                title: title.trim(),
                description: description.trim(),
                category: category.trim(),
                priority,
                startDate: start,
                dueDate: dueDate || null,
                trackingType,
                status: 'active',
                progress: 0,
                targetValue: trackingType === 'quantitative' ? parseFloat(targetValue) || 1 : null,
                currentValue: trackingType === 'quantitative' ? 0 : null,
                unit: trackingType === 'quantitative' ? (unit.trim() || 'unidades') : null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastProgressAt: null,
                completedAt: null,
                archivedAt: null
            };

            this.state.goals.push(newGoal);
            this.saveGoals();

            this.addAuditRecord(newGoalId, 'created', 'Meta criada no sistema.');

            this.closeModal('goal-modal');
            this.renderAll();
            this.showToast('Nova meta criada!');
        }
    },

    updateProgress(goalId, newValue, note = '') {
        const goal = this.state.goals.find(g => g.id === goalId);
        if (!goal) return;

        const prevProgress = this.calculateGoalProgress(goalId);
        let updated = false;

        if (goal.trackingType === 'manual') {
            const val = Math.min(100, Math.max(0, parseInt(newValue) || 0));
            goal.progress = val;
            updated = true;
        } else if (goal.trackingType === 'quantitative') {
            const val = Math.max(0, parseFloat(newValue) || 0);
            goal.currentValue = val;
            updated = true;
        }

        if (updated) {
            const newProgress = this.calculateGoalProgress(goalId);
            goal.lastProgressAt = new Date().toISOString();
            goal.updatedAt = new Date().toISOString();

            if (newProgress >= 100 && goal.status !== 'completed' && (goal.trackingType !== 'quantitative' || goal.currentValue >= goal.targetValue)) {
                goal.status = 'completed';
                goal.completedAt = new Date().toISOString();
                this.showToast('Parabéns! Meta concluída!');
            } else {
                this.showToast('Progresso registrado!');
            }

            this.addAuditRecord(goalId, 'progress_update', note.trim() || 'Progresso registrado', {
                previousProgress: prevProgress,
                newProgress
            });

            this.saveGoals();
            this.renderAll();
            this.openDetailsModal(goalId);
        }
    },

    addStep(goalId, title) {
        if (!title.trim()) return;

        const newStep = {
            id: 'step_' + Date.now(),
            goalId,
            title: title.trim(),
            status: 'pending',
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        this.state.steps.push(newStep);
        this.saveSteps();

        this.addAuditRecord(goalId, 'step_changed', `Etapa adicionada: "${title.trim()}"`);

        this.renderAll();
        this.openDetailsModal(goalId);
        this.showToast('Etapa adicionada!');
    },

    toggleStepStatus(stepId) {
        const step = this.state.steps.find(s => s.id === stepId);
        if (!step) return;

        step.status = step.status === 'completed' ? 'pending' : 'completed';
        step.completedAt = step.status === 'completed' ? new Date().toISOString() : null;

        this.saveSteps();
        
        const goalId = step.goalId;
        const goalSteps = this.state.steps.filter(s => s.goalId === goalId);
        const allCompleted = goalSteps.length > 0 && goalSteps.every(s => s.status === 'completed');
        const goal = this.state.goals.find(g => g.id === goalId);

        this.addAuditRecord(goalId, 'step_changed', `Etapa "${step.title}" marcada como ${step.status === 'completed' ? 'concluída' : 'pendente'}.`);

        if (goal && goal.trackingType === 'steps') {
            if (allCompleted && goal.status !== 'completed') {
                goal.status = 'completed';
                goal.completedAt = new Date().toISOString();
                this.showToast('Todas as etapas concluídas! Meta finalizada.');
            } else if (!allCompleted && goal.status === 'completed') {
                goal.status = 'active';
                goal.completedAt = null;
            }
            this.saveGoals();
        }

        this.renderAll();
        this.openDetailsModal(goalId);
    },

    deleteStep(stepId) {
        const step = this.state.steps.find(s => s.id === stepId);
        if (!step) return;
        const goalId = step.goalId;

        this.state.steps = this.state.steps.filter(s => s.id !== stepId);
        this.saveSteps();

        this.addAuditRecord(goalId, 'step_changed', `Etapa removida: "${step.title}"`);

        this.renderAll();
        this.openDetailsModal(goalId);
        this.showToast('Etapa removida.');
    },

    changeGoalStatus(goalId, newStatus) {
        const goal = this.state.goals.find(g => g.id === goalId);
        if (!goal) return;

        const oldStatus = goal.status;
        goal.status = newStatus;
        goal.updatedAt = new Date().toISOString();
        if (newStatus === 'completed') goal.completedAt = new Date().toISOString();
        if (newStatus === 'archived') goal.archivedAt = new Date().toISOString();

        this.saveGoals();

        this.addAuditRecord(goalId, 'status_changed', `Status alterado de ${oldStatus} para ${newStatus}.`);

        this.renderAll();
        this.closeModal('goal-details-modal');
        this.showToast(`Meta ${newStatus === 'completed' ? 'concluída' : newStatus === 'archived' ? 'arquivada' : 'atualizada'}.`);
    },

    deleteGoal(goalId) {
        if (!confirm('Tem certeza de que deseja eliminar esta meta permanentemente?')) return;

        this.state.goals = this.state.goals.filter(g => g.id !== goalId);
        this.state.steps = this.state.steps.filter(s => s.goalId !== goalId);
        this.state.records = this.state.records.filter(r => r.goalId !== goalId);

        this.saveGoals();
        this.saveSteps();
        this.saveRecords();
        this.closeModal('goal-details-modal');
        this.renderAll();
        this.showToast('Meta eliminada.');
    },

    /* ==========================================================================
       5. INTERFACE E RENDERIZAÇÃO
       ========================================================================== */
    renderAll() {
        this.updateCategoryOptions();
        this.renderOverview();
        this.renderPriorityGoals();
        this.renderGoalsList();
        this.renderGlobalHistory();
        this.renderCharts();
    },

    setupDateDisplay() {
        const dateElement = document.getElementById('header-date');
        const now = new Date();
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        if (dateElement) {
            dateElement.textContent = now.toLocaleDateString('pt-BR', options);
            dateElement.setAttribute('datetime', this.getTodayDateString());
        }
    },

    renderOverview() {
        const activeGoals = this.state.goals.filter(g => g.status === 'active');
        const completedGoals = this.state.goals.filter(g => g.status === 'completed');
        const overdueGoals = activeGoals.filter(g => this.getGoalDueStatus(g) === 'overdue');

        const avgProgress = activeGoals.length > 0
            ? Math.round(activeGoals.reduce((acc, g) => acc + this.calculateGoalProgress(g.id), 0) / activeGoals.length)
            : 0;

        this.setDOMText('[data-goal-stat="activeGoals"]', activeGoals.length);
        this.setDOMText('[data-goal-stat="completedGoals"]', completedGoals.length);
        this.setDOMText('[data-goal-stat="overdueGoals"]', overdueGoals.length);
        this.setDOMText('[data-goal-stat="avgProgress"]', `${avgProgress}%`);
    },

    renderPriorityGoals() {
        const container = document.getElementById('priority-goals-list');
        if (!container) return;

        const activeGoals = this.state.goals.filter(g => g.status === 'active');
        const priorityGoals = activeGoals.filter(g => {
            const dueStatus = this.getGoalDueStatus(g);
            return g.priority === 'high' || dueStatus === 'overdue' || dueStatus === 'due-today' || dueStatus === 'due-soon';
        });

        if (priorityGoals.length === 0) {
            container.innerHTML = `<p class="empty-message">Nenhuma meta prioritária ou com prazo crítico no momento.</p>`;
            return;
        }

        container.innerHTML = priorityGoals.map(goal => this.buildGoalCardHTML(goal)).join('');
    },

    renderGoalsList() {
        const container = document.getElementById('goals-list');
        const countDisplay = document.getElementById('goals-result-count');
        if (!container) return;

        let filtered = [...this.state.goals];

        if (this.state.filters.status !== 'all') {
            filtered = filtered.filter(g => g.status === this.state.filters.status);
        }

        if (this.state.filters.category !== 'all') {
            filtered = filtered.filter(g => g.category === this.state.filters.category);
        }

        if (this.state.filters.priority !== 'all') {
            filtered = filtered.filter(g => g.priority === this.state.filters.priority);
        }

        if (this.state.filters.search) {
            const term = this.state.filters.search.toLowerCase();
            filtered = filtered.filter(g => g.title.toLowerCase().includes(term) || g.category.toLowerCase().includes(term));
        }

        filtered.sort((a, b) => {
            if (this.state.filters.sort === 'due-date') {
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return a.dueDate.localeCompare(b.dueDate);
            }
            if (this.state.filters.sort === 'progress-desc') return this.calculateGoalProgress(b.id) - this.calculateGoalProgress(a.id);
            if (this.state.filters.sort === 'progress-asc') return this.calculateGoalProgress(a.id) - this.calculateGoalProgress(b.id);
            if (this.state.filters.sort === 'priority') {
                const weights = { high: 3, medium: 2, low: 1 };
                return weights[b.priority] - weights[a.priority];
            }
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        if (countDisplay) countDisplay.textContent = `${filtered.length} meta(s) encontrada(s)`;

        if (filtered.length === 0) {
            container.innerHTML = `<p class="empty-message">Nenhuma meta corresponde aos filtros aplicados.</p>`;
            return;
        }

        container.innerHTML = filtered.map(goal => this.buildGoalCardHTML(goal)).join('');
    },

    buildGoalCardHTML(goal) {
        const progress = this.calculateGoalProgress(goal.id);
        const dueStatus = this.getGoalDueStatus(goal);
        const isCompleted = goal.status === 'completed';
        const isOverdue = dueStatus === 'overdue';

        let dueDateBadgeText = '';
        if (goal.dueDate) {
            if (isCompleted) dueDateBadgeText = `Concluída em ${goal.dueDate.split('-').reverse().join('/')}`;
            else if (isOverdue) dueDateBadgeText = `⚠️ Atrasada (${goal.dueDate.split('-').reverse().join('/')})`;
            else if (dueStatus === 'due-today') dueDateBadgeText = `⚡ Vence hoje!`;
            else dueDateBadgeText = `Prazo: ${goal.dueDate.split('-').reverse().join('/')}`;
        } else {
            dueDateBadgeText = 'Sem prazo definido';
        }

        const priorityLabels = { high: 'Alta', medium: 'Média', low: 'Baixa' };

        return `
            <article class="goal-card ${isCompleted ? 'goal-completed' : ''} ${isOverdue ? 'goal-overdue' : ''}" data-action="open-details" data-id="${goal.id}">
                <div class="goal-card-header">
                    <div>
                        <span class="goal-category-badge">${this.escapeHTML(goal.category)}</span>
                        <h3>${this.escapeHTML(goal.title)}</h3>
                    </div>
                    <span class="goal-priority-tag priority-${goal.priority}">${priorityLabels[goal.priority]}</span>
                </div>

                <p class="goal-description">${this.escapeHTML(goal.description || 'Sem descrição informada.')}</p>

                <div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
                        <span>Progresso</span>
                        <strong>${progress}% ${goal.trackingType === 'quantitative' && goal.currentValue > goal.targetValue ? '(Excedido/Superado)' : ''}</strong>
                    </div>
                    <div class="today-progress-bar">
                        <div class="today-progress-fill" style="width: ${progress}%"></div>
                    </div>
                </div>

                <div class="goal-card-footer">
                    <span>${dueDateBadgeText}</span>
                    <span>${goal.trackingType === 'quantitative' ? `${goal.currentValue || 0}/${goal.targetValue}${goal.unit}` : ''}</span>
                </div>
            </article>
        `;
    },

    renderGlobalHistory() {
        const container = document.getElementById('goals-global-history');
        if (!container) return;

        const records = [...this.state.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        if (records.length === 0) {
            container.innerHTML = `<p class="empty-message">Ainda não há registos no histórico.</p>`;
            return;
        }

        container.innerHTML = records.slice(0, 15).map(rec => {
            const goal = this.state.goals.find(g => g.id === rec.goalId);
            const goalTitle = goal ? goal.title : 'Meta Removida';
            const badgeText = rec.previousProgress !== null && rec.newProgress !== null 
                ? `${rec.previousProgress}% ➔ ${rec.newProgress}%` 
                : 'Auditoria';

            return `
                <div class="history-item">
                    <div class="history-item-info">
                        <strong>${this.escapeHTML(goalTitle)}</strong>
                        <span>${rec.date.split('-').reverse().join('/')} — ${this.escapeHTML(rec.note || 'Ação registrada')}</span>
                    </div>
                    <span class="history-item-badge">${badgeText}</span>
                </div>
            `;
        }).join('');
    },

    renderCharts() {
        if (typeof Chart === 'undefined') return;

        const activeGoals = this.state.goals.filter(g => g.status === 'active');
        const categoryCounts = {};

        activeGoals.forEach(g => {
            const cat = g.category || 'Geral';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        const summaryEl = document.getElementById('category-chart-summary');
        if (summaryEl) summaryEl.style.display = activeGoals.length > 0 ? 'none' : 'inline-block';

        const ctx = document.getElementById('category-goals-chart')?.getContext('2d');
        if (ctx) {
            if (this.charts.category) this.charts.category.destroy();

            this.charts.category = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: Object.keys(categoryCounts),
                    datasets: [{
                        label: 'Metas Ativas',
                        data: Object.values(categoryCounts),
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
    },

    /* ==========================================================================
       6. MODAIS E GESTÃO LIMPA DE INPUTS/EVENTOS
       ========================================================================== */
    openGoalModal(goalId = null) {
        const modal = document.getElementById('goal-modal');
        const form = document.getElementById('goal-form');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('goal-id').value = '';
        document.getElementById('goal-modal-title').textContent = goalId ? 'Editar Meta' : 'Nova Meta';

        const statusContainer = document.getElementById('goal-status-container');
        if (statusContainer) statusContainer.hidden = !goalId;

        if (goalId) {
            const goal = this.state.goals.find(g => g.id === goalId);
            if (goal) {
                document.getElementById('goal-id').value = goal.id;
                document.getElementById('goal-title').value = goal.title;
                document.getElementById('goal-description').value = goal.description || '';
                document.getElementById('goal-category').value = goal.category;
                document.getElementById('goal-priority').value = goal.priority;
                document.getElementById('goal-start-date').value = goal.startDate || '';
                document.getElementById('goal-due-date').value = goal.dueDate || '';
                document.getElementById('goal-tracking-type').value = goal.trackingType;

                const statusSelect = document.getElementById('goal-status');
                if (statusSelect) statusSelect.value = goal.status;

                const quantFields = document.getElementById('quantitative-config-fields');
                if (quantFields) quantFields.hidden = goal.trackingType !== 'quantitative';
                if (goal.trackingType === 'quantitative') {
                    document.getElementById('goal-target-value').value = goal.targetValue || '';
                    document.getElementById('goal-unit').value = goal.unit || '';
                }
            }
        } else {
            const quantFields = document.getElementById('quantitative-config-fields');
            if (quantFields) quantFields.hidden = true;
            document.getElementById('goal-start-date').value = this.getTodayDateString();
        }

        modal.hidden = false;
    },

    openDetailsModal(goalId) {
        const goal = this.state.goals.find(g => g.id === goalId);
        if (!goal) return;

        this.state.currentModalGoalId = goalId;
        const modal = document.getElementById('goal-details-modal');
        if (!modal) return;

        document.getElementById('details-category-badge').textContent = goal.category;
        document.getElementById('details-modal-title').textContent = goal.title;
        document.getElementById('details-description').textContent = goal.description || 'Sem descrição.';
        document.getElementById('details-start-date').textContent = goal.startDate ? goal.startDate.split('-').reverse().join('/') : '--';
        document.getElementById('details-due-date').textContent = goal.dueDate ? goal.dueDate.split('-').reverse().join('/') : 'Sem prazo';
        
        const priorityMap = { high: 'Alta', medium: 'Média', low: 'Baixa' };
        document.getElementById('details-priority').textContent = priorityMap[goal.priority] || goal.priority;

        const progress = this.calculateGoalProgress(goalId);
        document.getElementById('details-progress').textContent = `${progress}% ${goal.trackingType === 'quantitative' && goal.currentValue > goal.targetValue ? '(Excedido)' : ''}`;
        document.getElementById('details-progress-fill').style.width = `${progress}%`;

        // Renderizar Previsão Inteligente
        const forecastBox = document.getElementById('details-trend-forecast');
        if (forecastBox) {
            const forecast = this.calculateTrendForecast(goalId);
            if (forecast) {
                forecastBox.style.display = 'block';
                forecastBox.className = `trend-forecast-box trend-${forecast.status || 'neutral'}`;
                forecastBox.innerHTML = `<strong> Previsão Inteligente:</strong> ${forecast.message}`;
            } else {
                forecastBox.style.display = 'none';
            }
        }

        document.getElementById('update-goal-id').value = goalId;
        
        // Limpeza e regeneração do container de input dinâmico
        const inputContainer = document.getElementById('update-input-container');
        inputContainer.innerHTML = ''; 

        if (goal.trackingType === 'manual') {
            inputContainer.innerHTML = `<input type="number" id="update-value" min="0" max="100" placeholder="Novo % (0–100)" required>`;
        } else if (goal.trackingType === 'quantitative') {
            inputContainer.innerHTML = `<input type="number" id="update-value" min="0" step="any" placeholder="Novo valor (${goal.unit})" value="${goal.currentValue || 0}" required>`;
        } else {
            inputContainer.innerHTML = `<span style="font-size: 0.85rem; color: var(--color-text-secondary);">Progresso gerido através das etapas abaixo.</span>`;
        }

        const stepsSection = document.getElementById('steps-management-section');
        if (stepsSection) {
            stepsSection.hidden = goal.trackingType !== 'steps';
            if (goal.trackingType === 'steps') {
                this.renderStepsListInModal(goalId);
            }
        }

        this.renderGoalHistoryInModal(goalId);
        modal.hidden = false;
    },

    renderStepsListInModal(goalId) {
        const container = document.getElementById('steps-list-container');
        if (!container) return;

        const steps = this.state.steps.filter(s => s.goalId === goalId);
        if (steps.length === 0) {
            container.innerHTML = `<p class="empty-message">Nenhuma etapa cadastrada.</p>`;
            return;
        }

        container.innerHTML = steps.map(step => `
            <div class="step-item">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; margin: 0; font-size: 0.85rem;">
                    <input type="checkbox" ${step.status === 'completed' ? 'checked' : ''} data-action="toggle-step" data-id="${step.id}">
                    <span style="${step.status === 'completed' ? 'text-decoration: line-through; color: var(--color-text-muted);' : ''}">${this.escapeHTML(step.title)}</span>
                </label>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button type="button" class="text-button button-small" style="font-size: 0.75rem;" data-action="export-task" data-id="${step.id}" title="Exportar para Tarefas">📋 + Tarefa</button>
                    <button type="button" class="text-button text-danger" data-action="delete-step" data-id="${step.id}" style="padding: 0;">✕</button>
                </div>
            </div>
        `).join('');
    },

    renderGoalHistoryInModal(goalId) {
        const container = document.getElementById('goal-history-timeline');
        if (!container) return;

        const records = this.state.records.filter(r => r.goalId === goalId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        if (records.length === 0) {
            container.innerHTML = `<p class="empty-message">Sem registos no histórico desta meta.</p>`;
            return;
        }

        container.innerHTML = records.map(rec => {
            const badgeText = rec.previousProgress !== null && rec.newProgress !== null 
                ? `${rec.previousProgress}% ➔ ${rec.newProgress}%` 
                : 'Auditoria';

            return `
                <div class="history-item">
                    <div class="history-item-info">
                        <span>${rec.date.split('-').reverse().join('/')} — ${this.escapeHTML(rec.note || 'Evento registrado')}</span>
                    </div>
                    <span class="history-item-badge">${badgeText}</span>
                </div>
            `;
        }).join('');
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.hidden = true;
    },

    /* ==========================================================================
       7. VINCULAÇÃO DE EVENTOS
       ========================================================================== */
    bindEvents() {
        document.addEventListener('click', (e) => {
            const card = e.target.closest('[data-action="open-details"]');
            if (card) {
                this.openDetailsModal(card.dataset.id);
                return;
            }

            const closeModalBtn = e.target.closest('[data-close-modal]');
            if (closeModalBtn) {
                this.closeModal(closeModalBtn.dataset.closeModal);
                return;
            }

            const toggleStep = e.target.closest('[data-action="toggle-step"]');
            if (toggleStep) {
                this.toggleStepStatus(toggleStep.dataset.id);
                return;
            }

            const deleteStep = e.target.closest('[data-action="delete-step"]');
            if (deleteStep) {
                this.deleteStep(deleteStep.dataset.id);
                return;
            }

            const exportBtn = e.target.closest('[data-action="export-task"]');
            if (exportBtn) {
                this.exportStepToTask(exportBtn.dataset.id);
                return;
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal('goal-modal');
                this.closeModal('goal-details-modal');
            }
        });

        document.getElementById('new-goal-button')?.addEventListener('click', () => this.openGoalModal());
        document.getElementById('management-new-goal-button')?.addEventListener('click', () => this.openGoalModal());

        document.getElementById('goal-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveGoalFromModal({
                id: document.getElementById('goal-id').value,
                title: document.getElementById('goal-title').value,
                description: document.getElementById('goal-description').value,
                category: document.getElementById('goal-category').value,
                priority: document.getElementById('goal-priority').value,
                startDate: document.getElementById('goal-start-date').value,
                dueDate: document.getElementById('goal-due-date').value,
                trackingType: document.getElementById('goal-tracking-type').value,
                targetValue: document.getElementById('goal-target-value').value,
                unit: document.getElementById('goal-unit').value,
                status: document.getElementById('goal-status')?.value
            });
        });

        document.getElementById('progress-update-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const goalId = document.getElementById('update-goal-id').value;
            const inputVal = document.getElementById('update-value')?.value;
            const note = document.getElementById('update-note').value;
            if (inputVal !== undefined) {
                this.updateProgress(goalId, inputVal, note);
                document.getElementById('update-note').value = '';
            }
        });

        document.getElementById('open-add-step-btn')?.addEventListener('click', () => {
            const form = document.getElementById('add-step-form');
            if (form) form.hidden = !form.hidden;
        });

        document.getElementById('add-step-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const titleInput = document.getElementById('new-step-title');
            if (this.state.currentModalGoalId && titleInput) {
                this.addStep(this.state.currentModalGoalId, titleInput.value);
                titleInput.value = '';
                document.getElementById('add-step-form').hidden = true;
            }
        });

        document.getElementById('details-edit-btn')?.addEventListener('click', () => {
            if (this.state.currentModalGoalId) {
                this.closeModal('goal-details-modal');
                this.openGoalModal(this.state.currentModalGoalId);
            }
        });

        document.getElementById('details-complete-btn')?.addEventListener('click', () => {
            if (this.state.currentModalGoalId) {
                this.changeGoalStatus(this.state.currentModalGoalId, 'completed');
            }
        });

        document.getElementById('details-archive-btn')?.addEventListener('click', () => {
            if (this.state.currentModalGoalId) {
                this.changeGoalStatus(this.state.currentModalGoalId, 'archived');
            }
        });

        document.getElementById('details-delete-btn')?.addEventListener('click', () => {
            if (this.state.currentModalGoalId) {
                this.deleteGoal(this.state.currentModalGoalId);
            }
        });

        document.getElementById('goal-tracking-type')?.addEventListener('change', (e) => {
            const quantFields = document.getElementById('quantitative-config-fields');
            if (quantFields) quantFields.hidden = e.target.value !== 'quantitative';
        });

        document.getElementById('goal-search')?.addEventListener('input', (e) => {
            this.state.filters.search = e.target.value;
            this.renderGoalsList();
        });

        document.getElementById('goal-status-filter')?.addEventListener('change', (e) => {
            this.state.filters.status = e.target.value;
            this.renderGoalsList();
        });

        document.getElementById('goal-category-filter')?.addEventListener('change', (e) => {
            this.state.filters.category = e.target.value;
            this.renderGoalsList();
        });

        document.getElementById('goal-priority-filter')?.addEventListener('change', (e) => {
            this.state.filters.priority = e.target.value;
            this.renderGoalsList();
        });

        document.getElementById('goal-sort')?.addEventListener('change', (e) => {
            this.state.filters.sort = e.target.value;
            this.renderGoalsList();
        });

        document.getElementById('clear-goal-filters')?.addEventListener('click', () => {
            this.state.filters = { search: '', status: 'active', category: 'all', priority: 'all', sort: 'due-date' };
            
            document.getElementById('goal-search').value = '';
            document.getElementById('goal-status-filter').value = 'active';
            document.getElementById('goal-category-filter').value = 'all';
            document.getElementById('goal-priority-filter').value = 'all';
            document.getElementById('goal-sort').value = 'due-date';

            this.renderGoalsList();
        });

        document.getElementById('scroll-to-history-btn')?.addEventListener('click', () => {
            document.getElementById('goals-history-section')?.scrollIntoView({ behavior: 'smooth' });
        });

        document.getElementById('export-data-btn')?.addEventListener('click', () => this.exportData());
        document.getElementById('import-data-input')?.addEventListener('change', (e) => this.importData(e));

        // Listener para sincronização bidirecional com o módulo de Tarefas usando a chave exata
        window.addEventListener('storage', (e) => {
            if (e.key === this.STORAGE_KEYS.TASKS) {
                try {
                    const tasks = JSON.parse(e.newValue || '[]');
                    let needsRender = false;

                    tasks.forEach(task => {
                        if (task.originStepId) {
                            const step = this.state.steps.find(s => s.id === task.originStepId);
                            if (step) {
                                const isTaskCompleted = task.status === 'completed';
                                const newStatus = isTaskCompleted ? 'completed' : 'pending';
                                if (step.status !== newStatus) {
                                    step.status = newStatus;
                                    step.completedAt = isTaskCompleted ? new Date().toISOString() : null;
                                    needsRender = true;
                                }
                            }
                        }
                    });

                    if (needsRender) {
                        this.saveSteps();
                        this.renderAll();
                        if (this.state.currentModalGoalId) {
                            this.openDetailsModal(this.state.currentModalGoalId);
                        }
                    }
                } catch (err) {
                    console.error('Erro ao sincronizar tarefas:', err);
                }
            }
        });
    },

    /* ==========================================================================
       8. UTILITÁRIOS
       ========================================================================== */
    updateCategoryOptions() {
        const categories = [...new Set(this.state.goals.map(g => g.category))];
        const select = document.getElementById('goal-category-filter');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = `<option value="all">Todas as categorias</option>` +
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