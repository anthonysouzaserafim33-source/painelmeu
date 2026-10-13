'use strict';

document.addEventListener('DOMContentLoaded', () => {
    CalendarApp.init();
});

const CalendarApp = {
    STORAGE_KEYS: {
        CALENDAR_EVENTS: 'painel_calendario_eventos_v1',
        PLANNING: 'painel_planejamento_v1',
        PLANNING_HISTORY: 'painel_planejamento_historico_v1',
        TASKS: 'painel_tarefas_v1',
        STUDIES: 'app_estudos_data',
        GOALS: 'metas',
        GOAL_STEPS: 'metas_etapas',
        GOAL_RECORDS: 'metas_registros',
        HABITS: 'habitos',
        HABIT_RECORDS: 'habitos_registros'
    },

    COLORS: {
        event: '#27DE80',
        planning: '#60A5FA',
        task: '#FBBF24',
        study: '#A78BFA',
        review: '#38BDF8',
        goal: '#F472B6',
        habit: '#34D399'
    },

    state: {
        events: [],

        externalData: {
            planning: [],
            planningHistory: [],
            tasks: [],
            studies: [],
            studyHistory: [],
            reviews: [],
            goals: [],
            goalSteps: [],
            goalRecords: [],
            habits: [],
            habitRecords: []
        },

        currentDate: '',
        currentView: 'month',

        filters: {
            search: '',
            origin: 'all',
            category: 'all'
        },

        selectedItem: null
    },

    toastTimer: null,
    initialized: false,

    // =========================================================
    // 1. INICIALIZAÇÃO
    // =========================================================

    init() {
        if (this.initialized) return;

        this.initialized = true;
        this.state.currentDate = this.getLocalDateString();

        this.loadEvents();
        this.loadExternalModulesData();

        this.setupHeaderDate();
        this.bindEvents();
        this.setupCrossTabSync();

        this.renderAll();
    },

    // =========================================================
    // 2. DATAS, HORÁRIOS E ARMAZENAMENTO
    // =========================================================

    getLocalDateString(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    },

    parseStorage(key, fallback = []) {
        try {
            const raw = localStorage.getItem(key);

            if (raw === null || raw === '') {
                return fallback;
            }

            return JSON.parse(raw);
        } catch (error) {
            console.error(`Erro ao ler "${key}":`, error);
            return fallback;
        }
    },

    extractDateOnly(value) {
        if (typeof value !== 'string' || !value.trim()) {
            return '';
        }

        const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);

        return match ? match[1] : '';
    },

    isValidDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
            return false;
        }

        const date = new Date(`${value}T00:00:00`);

        return !Number.isNaN(date.getTime()) &&
            this.getLocalDateString(date) === value;
    },

    addDays(dateString, amount) {
        const date = new Date(`${dateString}T00:00:00`);
        date.setDate(date.getDate() + amount);

        return this.getLocalDateString(date);
    },

    generateId(prefix = 'item') {
        if (
            typeof crypto !== 'undefined' &&
            typeof crypto.randomUUID === 'function'
        ) {
            return `${prefix}_${crypto.randomUUID()}`;
        }

        return `${prefix}_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 10)}`;
    },

    stableExternalId(origin, item, date = '') {
        const sourceId = item?.id ??
            item?.contentId ??
            item?.habitId ??
            item?.goalId ??
            item?.title ??
            item?.name ??
            'registro';

        return `${origin}_${String(sourceId)}${date ? `_${date}` : ''}`;
    },

    normalizeStatus(value, fallback = 'planned') {
        const status = String(value || fallback)
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        const aliases = {
            done: 'completed',
            complete: 'completed',
            concluido: 'completed',
            finalizado: 'completed',
            finalizada: 'completed',
            pendente: 'pending',
            em_andamento: 'in-progress',
            'in progress': 'in-progress',
            cancelado: 'cancelled',
            cancelada: 'cancelled',
            ativo: 'active',
            ativa: 'active',
            pausado: 'paused',
            pausada: 'paused',
            arquivado: 'archived',
            arquivada: 'archived'
        };

        return aliases[status] || status;
    },

    escapeHTML(value) {
        const replacements = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };

        return String(value ?? '').replace(
            /[&<>"']/g,
            character => replacements[character]
        );
    },

    // Tradução e formatação de categorias vindas de outros módulos em inglês/português
    formatCategoryName(category) {
        const categoriesMap = {
            'academic': 'Escola',
            'personal': 'Pessoal',
            'work': 'Trabalho',
            'health': 'Saúde e rotina',
            'studies': 'Estudos',
            'other': 'Outros'
        };

        const key = String(category || '').trim().toLowerCase();
        return categoriesMap[key] || category || 'Geral';
    },

    // =========================================================
    // 3. EVENTOS PRÓPRIOS DO CALENDÁRIO
    // =========================================================

    loadEvents() {
        const data = this.parseStorage(
            this.STORAGE_KEYS.CALENDAR_EVENTS,
            []
        );

        this.state.events = Array.isArray(data)
            ? data.filter(item => item && typeof item === 'object')
            : [];

        let changed = false;

        this.state.events.forEach(event => {
            if (!event.id) {
                event.id = this.generateId('evt');
                changed = true;
            }
        });

        if (changed) {
            this.saveEvents();
        }
    },

    saveEvents() {
        try {
            localStorage.setItem(
                this.STORAGE_KEYS.CALENDAR_EVENTS,
                JSON.stringify(this.state.events)
            );

            return true;
        } catch (error) {
            console.error('Erro ao salvar eventos:', error);

            this.showToast(
                'Não foi possível salvar o evento. Verifique o armazenamento.'
            );

            return false;
        }
    },

    // =========================================================
    // 4. CARREGAMENTO DOS MÓDULOS EXTERNOS
    // =========================================================

    loadExternalModulesData() {
        const keys = this.STORAGE_KEYS;

        const planning = this.parseStorage(keys.PLANNING, []);
        const planningHistory = this.parseStorage(
            keys.PLANNING_HISTORY,
            []
        );

        const tasks = this.parseStorage(keys.TASKS, []);
        const studies = this.parseStorage(keys.STUDIES, {});
        const goals = this.parseStorage(keys.GOALS, []);
        const goalSteps = this.parseStorage(keys.GOAL_STEPS, []);
        const goalRecords = this.parseStorage(keys.GOAL_RECORDS, []);
        const habits = this.parseStorage(keys.HABITS, []);
        const habitRecords = this.parseStorage(keys.HABIT_RECORDS, []);

        this.state.externalData.planning =
            Array.isArray(planning)
                ? planning
                : Array.isArray(planning?.activities)
                    ? planning.activities
                    : Array.isArray(planning?.items)
                        ? planning.items
                        : [];

        this.state.externalData.planningHistory =
            Array.isArray(planningHistory)
                ? planningHistory
                : Array.isArray(planningHistory?.items)
                    ? planningHistory.items
                    : [];

        this.state.externalData.tasks =
            Array.isArray(tasks)
                ? tasks
                : Array.isArray(tasks?.items)
                    ? tasks.items
                    : [];

        this.state.externalData.studies =
            Array.isArray(studies?.contents)
                ? studies.contents
                : [];

        this.state.externalData.studyHistory =
            Array.isArray(studies?.history)
                ? studies.history
                : Array.isArray(studies?.studyHistory)
                    ? studies.studyHistory
                    : Array.isArray(studies?.records)
                        ? studies.records
                        : [];

        this.state.externalData.reviews =
            Array.isArray(studies?.reviews)
                ? studies.reviews
                : [];

        this.state.externalData.goals =
            Array.isArray(goals)
                ? goals
                : Array.isArray(goals?.items)
                    ? goals.items
                    : [];

        this.state.externalData.goalSteps =
            Array.isArray(goalSteps)
                ? goalSteps
                : Array.isArray(goalSteps?.items)
                    ? goalSteps.items
                    : [];

        this.state.externalData.goalRecords =
            Array.isArray(goalRecords)
                ? goalRecords
                : Array.isArray(goalRecords?.items)
                    ? goalRecords.items
                    : [];

        this.state.externalData.habits =
            Array.isArray(habits)
                ? habits
                : Array.isArray(habits?.items)
                    ? habits.items
                    : [];

        this.state.externalData.habitRecords =
            Array.isArray(habitRecords)
                ? habitRecords
                : Array.isArray(habitRecords?.items)
                    ? habitRecords.items
                    : [];
    },

    setupHeaderDate() {
        const element = document.getElementById('header-date');

        if (!element) return;

        const now = new Date();

        element.textContent = now.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        element.setAttribute('datetime', this.getLocalDateString(now));
    },

    // =========================================================
    // 5. INTERVALO DA VISUALIZAÇÃO
    // =========================================================

    getPeriodRange() {
        const date = new Date(`${this.state.currentDate}T00:00:00`);

        if (this.state.currentView === 'day') {
            return {
                start: this.state.currentDate,
                end: this.state.currentDate
            };
        }

        if (this.state.currentView === 'week') {
            const weekday = date.getDay() || 7;
            const start = new Date(date);

            start.setDate(start.getDate() - weekday + 1);

            const end = new Date(start);
            end.setDate(end.getDate() + 6);

            return {
                start: this.getLocalDateString(start),
                end: this.getLocalDateString(end)
            };
        }

        const year = date.getFullYear();
        const month = date.getMonth();

        return {
            start: this.getLocalDateString(new Date(year, month, 1)),
            end: this.getLocalDateString(new Date(year, month + 1, 0))
        };
    },

    // =========================================================
    // 6. NORMALIZAÇÃO DE REGISTROS
    // =========================================================

    normalizeItem(item, origin, defaults = {}) {
        if (!item || typeof item !== 'object') {
            return null;
        }

        const date = this.extractDateOnly(
            item.date ||
            item.dueDate ||
            item.completedAt
        );

        if (!date || !this.isValidDate(date)) {
            return null;
        }

        const title = item.title ||
            item.name ||
            defaults.title ||
            'Sem título';

        return {
            id: String(
                item.id ??
                this.stableExternalId(origin, item, date)
            ),

            title: String(title),
            description: String(item.description || ''),
            date,

            startTime: String(
                item.startTime ||
                item.dueTime ||
                item.preferredTime ||
                ''
            ),

            endTime: String(item.endTime || ''),

            category: String(
                item.category ||
                defaults.category ||
                'Geral'
            ),

            color: String(
                item.color ||
                defaults.color ||
                this.COLORS[origin] ||
                '#27DE80'
            ),

            location: String(item.location || ''),
            origin,

            status: this.normalizeStatus(
                item.status,
                defaults.status || 'planned'
            ),

            raw: item
        };
    },

    itemIsInRange(item, start, end) {
        return Boolean(
            item &&
            item.date >= start &&
            item.date <= end
        );
    },

    // =========================================================
    // 7. TAREFAS E DUPLICAÇÕES
    // =========================================================

    isTaskCompleted(task) {
        return this.normalizeStatus(task?.status, 'pending') === 'completed';
    },

    isTaskCancelled(task) {
        return this.normalizeStatus(task?.status, 'pending') === 'cancelled';
    },

    getTaskLinkedToPlanning(activity) {
        if (
            !activity ||
            activity.linkedType !== 'task' ||
            activity.linkedId == null
        ) {
            return null;
        }

        return this.state.externalData.tasks.find(task =>
            String(task.id) === String(activity.linkedId)
        ) || null;
    },

    isTaskRepresentedInPlanning(task) {
        if (!task || task.id == null) {
            return false;
        }

        return this.state.externalData.planning.some(activity => {
            if (
                !activity ||
                activity.linkedType !== 'task' ||
                activity.linkedId == null
            ) {
                return false;
            }

            if (String(activity.linkedId) !== String(task.id)) {
                return false;
            }

            const status = this.normalizeStatus(
                activity.status,
                'planned'
            );

            // Atividades canceladas não representam a tarefa.
            if (status === 'cancelled') {
                return false;
            }

            // Se a atividade estiver concluída, a tarefa continua
            // sendo representada por ela, evitando duplicação.
            return true;
        });
    },

    getTaskCalendarDate(task) {
        // A data de vencimento é a referência principal.
        const dueDate = this.extractDateOnly(task?.dueDate);

        if (dueDate && this.isValidDate(dueDate)) {
            return dueDate;
        }

        const date = this.extractDateOnly(task?.date);

        return date && this.isValidDate(date) ? date : '';
    },

    // =========================================================
    // 8. ESTUDOS E SESSÕES REGISTRADAS
    // =========================================================

    getStudyContent(contentId) {
        return this.state.externalData.studies.find(content =>
            String(content.id) === String(contentId)
        ) || null;
    },

    getStudyTitle(session) {
        const content = this.getStudyContent(session.contentId);

        return session.title ||
            content?.name ||
            'Sessão de estudo';
    },

    getStudyDescription(session) {
        const parts = [];

        if (session.durationMinutes != null) {
            parts.push(`Duração: ${session.durationMinutes} min`);
        }

        if (session.questions != null) {
            parts.push(`Questões: ${session.questions}`);
        }

        if (session.correct != null) {
            parts.push(`Acertos: ${session.correct}`);
        }

        const content = this.getStudyContent(session.contentId);

        if (content?.name) {
            parts.unshift(`Conteúdo: ${content.name}`);
        }

        return parts.join(' | ') || 'Sessão de estudo registrada.';
    },

    getPlanningStudySignatures() {
        const signatures = new Set();

        this.state.externalData.planning.forEach(activity => {
            if (
                activity.linkedType !== 'study' ||
                !activity.linkedId ||
                !['completed', 'partial'].includes(
                    this.normalizeStatus(activity.status)
                )
            ) {
                return;
            }

            const signature = [
                String(activity.id),
                String(activity.linkedId),
                this.extractDateOnly(activity.date)
            ].join('|');

            signatures.add(signature);
        });

        return signatures;
    },

    getUnifiedStudyHistory() {
        const history = this.state.externalData.studyHistory;

        return history.filter(session =>
            session &&
            typeof session === 'object' &&
            !session.isDuplicate
        );
    },

    // =========================================================
    // 9. HÁBITOS RECORRENTES
    // =========================================================

    getHabitRecord(habitId, date) {
        return this.state.externalData.habitRecords.find(record =>
            String(record.habitId) === String(habitId) &&
            this.extractDateOnly(record.date) === date
        ) || null;
    },

    isHabitScheduledForDate(habit, dateString) {
        if (!habit || !this.isValidDate(dateString)) {
            return false;
        }

        const status = this.normalizeStatus(habit.status, 'active');

        if (status === 'paused' || status === 'archived') {
            return false;
        }

        const createdDate = this.extractDateOnly(habit.createdAt);

        if (createdDate && dateString < createdDate) {
            return false;
        }

        if (habit.archivedAt) {
            const archivedDate = this.extractDateOnly(habit.archivedAt);

            if (archivedDate && dateString >= archivedDate) {
                return false;
            }
        }

        const date = new Date(`${dateString}T00:00:00`);
        const weekday = date.getDay();

        switch (habit.frequency) {
            case 'daily':
                return true;

            case 'weekdays':
                return weekday >= 1 && weekday <= 5;

            case 'specific':
                return Array.isArray(habit.frequencyDays) &&
                    habit.frequencyDays.includes(weekday);

            default:
                return false;
        }
    },

    getHabitOccurrence(habit, dateString) {
        const record = this.getHabitRecord(habit.id, dateString);

        const completed = Boolean(record?.completed);

        return {
            id: this.stableExternalId(
                'habit',
                { id: habit.id },
                dateString
            ),

            title: habit.name || 'Hábito',
            description: habit.description || 'Hábito recorrente.',

            date: dateString,
            startTime: habit.preferredTime || '',
            endTime: '',

            category: habit.category || 'Hábitos',
            color: this.COLORS.habit,
            location: '',

            origin: 'habit',
            status: completed ? 'completed' : 'pending',

            raw: {
                ...habit,
                occurrenceDate: dateString,
                occurrenceRecord: record
            }
        };
    },

    getHabitOccurrences(start, end) {
        const occurrences = [];

        let date = start;

        while (date <= end) {
            this.state.externalData.habits.forEach(habit => {
                if (this.isHabitScheduledForDate(habit, date)) {
                    occurrences.push(
                        this.getHabitOccurrence(habit, date)
                    );
                }
            });

            date = this.addDays(date, 1);
        }

        return occurrences;
    },

    // =========================================================
    // 10. REVISÕES DE ESTUDOS
    // =========================================================

    getReviewItems(start, end) {
        return this.state.externalData.reviews
            .filter(review => review && typeof review === 'object')
            .map(review => {
                const dueDate = this.extractDateOnly(review.dueDate);

                if (!dueDate || !this.isValidDate(dueDate)) {
                    return null;
                }

                return {
                    id: String(
                        review.id ??
                        this.stableExternalId('review', review, dueDate)
                    ),

                    title: review.title || 'Revisão de conteúdo',
                    description: review.description ||
                        'Revisão programada no módulo Estudos.',

                    date: dueDate,
                    startTime: '',
                    endTime: '',

                    category: 'Estudos',
                    color: this.COLORS.review,
                    location: '',

                    origin: 'review',
                    status: review.completed ? 'completed' : 'pending',

                    raw: review
                };
            })
            .filter(item => this.itemIsInRange(item, start, end));
    },

    // =========================================================
    // 11. CONSOLIDAÇÃO DOS REGISTROS
    // =========================================================

    getUnifiedItemsForPeriod(options = {}) {
        const { start, end } = this.getPeriodRange();
        const items = [];

        const add = (item, origin, defaults = {}) => {
            const normalized = this.normalizeItem(item, origin, defaults);

            if (this.itemIsInRange(normalized, start, end)) {
                items.push(normalized);
            }
        };

        // Eventos próprios.
        this.state.events.forEach(event => {
            add(event, 'event', {
                title: 'Evento',
                category: 'Pessoal',
                color: event.color || this.COLORS.event
            });
        });

        // Planejamento.
        this.state.externalData.planning.forEach(activity => {
            if (
                this.normalizeStatus(activity.status) === 'cancelled'
            ) {
                return;
            }

            add(activity, 'planning', {
                title: 'Atividade',
                category: 'Outros',
                color: this.COLORS.planning
            });
        });

        // Tarefas com vencimento.
        this.state.externalData.tasks.forEach(task => {
            if (!task || this.isTaskCancelled(task)) {
                return;
            }

            if (this.isTaskRepresentedInPlanning(task)) {
                return;
            }

            const taskDate = this.getTaskCalendarDate(task);

            if (!taskDate) {
                return;
            }

            add({
                ...task,
                date: taskDate,
                title: task.title || 'Tarefa',
                status: this.normalizeStatus(task.status, 'pending')
            }, 'task', {
                title: 'Tarefa',
                category: 'Escola',
                color: this.COLORS.task,
                status: 'pending'
            });
        });

        // Sessões de estudo efetivamente registradas.
        this.getUnifiedStudyHistory().forEach(session => {
            const date = this.extractDateOnly(session.date);

            const normalized = this.normalizeItem({
                ...session,
                id: session.id ??
                    this.stableExternalId('study', session, date),
                title: this.getStudyTitle(session),
                description: session.description ||
                    this.getStudyDescription(session),
                date
            }, 'study', {
                category: 'Estudos',
                color: this.COLORS.study,
                status: 'completed'
            });

            if (this.itemIsInRange(normalized, start, end)) {
                items.push(normalized);
            }
        });

        // Revisões com data de vencimento.
        items.push(...this.getReviewItems(start, end));

        // Metas.
        this.state.externalData.goals.forEach(goal => {
            const status = this.normalizeStatus(goal.status, 'active');

            if (['archived', 'cancelled'].includes(status)) {
                return;
            }

            if (!goal.dueDate) return;

            add({
                ...goal,
                id: goal.id,
                date: goal.dueDate,
                title: `Prazo da meta: ${goal.title || 'Meta'}`,
                description: goal.description || '',
                status
            }, 'goal', {
                title: 'Meta',
                category: 'Pessoal',
                color: this.COLORS.goal,
                status: 'active'
            });
        });

        // Hábitos.
        items.push(...this.getHabitOccurrences(start, end));

        // Ordenação cronológica.
        items.sort((a, b) => {
            const dateCompare = a.date.localeCompare(b.date);

            if (dateCompare !== 0) {
                return dateCompare;
            }

            const timeCompare = (a.startTime || '00:00')
                .localeCompare(b.startTime || '00:00');

            if (timeCompare !== 0) {
                return timeCompare;
            }

            return a.title.localeCompare(b.title, 'pt-BR');
        });

        if (options.ignoreFilters) {
            return items;
        }

        const search = this.state.filters.search
            .trim()
            .toLocaleLowerCase('pt-BR');

        return items.filter(item => {
            const text = [
                item.title,
                item.description,
                item.category,
                item.location
            ].join(' ').toLocaleLowerCase('pt-BR');

            const matchesSearch =
                !search || text.includes(search);

            const matchesOrigin =
                this.state.filters.origin === 'all' ||
                item.origin === this.state.filters.origin;

            const matchesCategory =
                this.state.filters.category === 'all' ||
                item.category === this.state.filters.category;

            return matchesSearch &&
                matchesOrigin &&
                matchesCategory;
        });
    },

    // =========================================================
    // 12. CRIAÇÃO E EDIÇÃO DE EVENTOS PRÓPRIOS
    // =========================================================

    openEventModal(eventId = null) {
        const modal = document.getElementById('event-modal');
        const form = document.getElementById('event-form');

        if (!modal || !form) return;

        form.reset();

        const fields = {
            id: document.getElementById('event-id'),
            title: document.getElementById('event-title'),
            description: document.getElementById('event-description'),
            category: document.getElementById('event-category'),
            color: document.getElementById('event-color'),
            date: document.getElementById('event-date'),
            location: document.getElementById('event-location'),
            startTime: document.getElementById('event-start-time'),
            endTime: document.getElementById('event-end-time')
        };

        const modalTitle = document.getElementById('event-modal-title');
        const conflictBox = document.getElementById('event-conflict-box');

        if (conflictBox) conflictBox.style.display = 'none';

        if (modalTitle) {
            modalTitle.textContent = eventId
                ? 'Editar Evento'
                : 'Novo Evento';
        }

        if (fields.id) fields.id.value = '';

        if (eventId) {
            const event = this.state.events.find(item =>
                String(item.id) === String(eventId)
            );

            if (!event) {
                this.showToast('Evento não encontrado.');
                return;
            }

            if (fields.id) fields.id.value = event.id;
            if (fields.title) fields.title.value = event.title || '';
            if (fields.description) fields.description.value = event.description || '';
            if (fields.category) fields.category.value = event.category || 'Pessoal';
            if (fields.color) fields.color.value = event.color || this.COLORS.event;
            if (fields.date) fields.date.value = event.date || this.state.currentDate;
            if (fields.location) fields.location.value = event.location || '';
            if (fields.startTime) fields.startTime.value = event.startTime || '';
            if (fields.endTime) fields.endTime.value = event.endTime || '';
        } else {
            if (fields.date) {
                fields.date.value = this.state.currentDate;
            }

            if (fields.color) {
                fields.color.value = this.COLORS.event;
            }
        }

        modal.hidden = false;
        fields.title?.focus();
    },

    checkTimeOverlap(date, startTime, endTime, excludeId = null) {
        if (!startTime || !endTime) return false;

        return this.state.events.some(event => {
            if (String(event.id) === String(excludeId)) {
                return false;
            }

            if (event.date !== date) return false;

            if (!event.startTime || !event.endTime) {
                return false;
            }

            return startTime < event.endTime &&
                endTime > event.startTime;
        });
    },

    saveEventFromModal(formData) {
        const {
            id,
            title,
            description,
            category,
            color,
            date,
            location,
            startTime,
            endTime
        } = formData;

        const cleanTitle = String(title || '').trim();
        const cleanDescription = String(description || '').trim();
        const cleanLocation = String(location || '').trim();

        if (!cleanTitle || !date || !category) {
            this.showToast('Preencha os campos obrigatórios (*).');
            return;
        }

        if (!this.isValidDate(date)) {
            this.showToast('Informe uma data válida.');
            return;
        }

        const validTime = value =>
            !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

        if (!validTime(startTime) || !validTime(endTime)) {
            this.showToast('Informe um horário válido.');
            return;
        }

        if (startTime && endTime && startTime >= endTime) {
            this.showToast(
                'O horário final deve ser posterior ao inicial.'
            );
            return;
        }

        if (
            startTime &&
            endTime &&
            this.checkTimeOverlap(date, startTime, endTime, id || null)
        ) {
            const conflictBox = document.getElementById('event-conflict-box');

            if (conflictBox) {
                conflictBox.style.display = 'block';
            }

            this.showToast('Existe conflito com outro evento.');
            return;
        }

        const previousEvents = this.state.events.map(event => ({ ...event }));
        const now = new Date().toISOString();

        if (id) {
            const existing = this.state.events.find(event =>
                String(event.id) === String(id)
            );

            if (!existing) {
                this.showToast('Não foi possível localizar o evento.');
                return;
            }

            Object.assign(existing, {
                title: cleanTitle,
                description: cleanDescription,
                category,
                color: color || this.COLORS.event,
                date,
                location: cleanLocation,
                startTime: startTime || '',
                endTime: endTime || '',
                updatedAt: now
            });
        } else {
            this.state.events.push({
                id: this.generateId('evt'),
                title: cleanTitle,
                description: cleanDescription,
                category,
                color: color || this.COLORS.event,
                date,
                location: cleanLocation,
                startTime: startTime || '',
                endTime: endTime || '',
                status: 'planned',
                createdAt: now,
                updatedAt: now
            });
        }

        if (!this.saveEvents()) {
            this.state.events = previousEvents;
            return;
        }

        this.closeModal('event-modal');
        this.renderAll();

        this.showToast(
            id
                ? 'Evento atualizado com sucesso.'
                : 'Evento criado com sucesso.'
        );
    },

    deleteEvent(eventId) {
        const event = this.state.events.find(item =>
            String(item.id) === String(eventId)
        );

        if (!event) {
            this.showToast('Evento não encontrado.');
            return;
        }

        if (!confirm('Deseja excluir permanentemente este evento?')) {
            return;
        }

        const previousEvents = this.state.events;

        this.state.events = previousEvents.filter(item =>
            String(item.id) !== String(eventId)
        );

        if (!this.saveEvents()) {
            this.state.events = previousEvents;
            return;
        }

        this.closeModal('details-modal');
        this.renderAll();
        this.showToast('Evento excluído com sucesso.');
    },

    // =========================================================
    // 13. MODAIS E DETALHES (Com Tradução em Português)
    // =========================================================

    closeModal(modalId) {
        const modal = document.getElementById(modalId);

        if (modal) {
            modal.hidden = true;
        }
    },

    openDetailsModal(itemId, origin) {
        const modal = document.getElementById('details-modal');

        if (!modal) return;

        const item = this.getUnifiedItemsForPeriod({
            ignoreFilters: true
        }).find(record =>
            String(record.id) === String(itemId) &&
            record.origin === origin
        );

        if (!item) {
            this.showToast('Registro não encontrado. Atualize o calendário.');
            return;
        }

        this.state.selectedItem = {
            id: item.id,
            origin: item.origin,
            date: item.date
        };

        const fields = {
            origin: document.getElementById('details-origin-badge'),
            title: document.getElementById('details-modal-title'),
            description: document.getElementById('details-description'),
            date: document.getElementById('details-date'),
            time: document.getElementById('details-time'),
            location: document.getElementById('details-location'),
            category: document.getElementById('details-category'),
            actions: document.getElementById('details-actions-row')
        };

        // Mapeamento de origens em Português
        const originNames = {
            event: 'EVENTO',
            planning: 'PLANEJAMENTO',
            task: 'TAREFA',
            study: 'ESTUDO',
            review: 'REVISÃO',
            goal: 'META',
            habit: 'HÁBITO'
        };

        if (fields.origin) {
            fields.origin.textContent = `Origem: ${originNames[origin] || origin.toUpperCase()}`;
        }

        if (fields.title) {
            fields.title.textContent = item.title;
        }

        if (fields.description) {
            fields.description.textContent =
                item.description || 'Sem descrição detalhada.';
        }

        if (fields.date) {
            fields.date.textContent = item.date.split('-').reverse().join('/');
        }

        if (fields.time) {
            fields.time.textContent = item.startTime
                ? `${item.startTime}${item.endTime ? ` - ${item.endTime}` : ''}`
                : 'Não especificado';
        }

        if (fields.location) {
            fields.location.textContent = item.location || 'Não informado';
        }

        if (fields.category) {
            fields.category.textContent = this.formatCategoryName(item.category);
        }

        if (fields.actions) {
            fields.actions.replaceChildren();

            const closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = 'button button-secondary';
            closeButton.textContent = 'Fechar';
            closeButton.dataset.closeModal = 'details-modal';

            fields.actions.appendChild(closeButton);

            if (origin === 'event') {
                const editButton = document.createElement('button');

                editButton.type = 'button';
                editButton.className = 'button button-secondary';
                editButton.textContent = 'Editar';

                editButton.addEventListener('click', () => {
                    this.closeModal('details-modal');
                    this.openEventModal(item.id);
                });

                const deleteButton = document.createElement('button');

                deleteButton.type = 'button';
                deleteButton.className = 'text-button text-danger';
                deleteButton.textContent = 'Excluir';

                deleteButton.addEventListener('click', () => {
                    this.deleteEvent(item.id);
                });

                fields.actions.append(editButton, deleteButton);
            }
        }

        modal.hidden = false;
    },

    // =========================================================
    // 14. CABEÇALHO E MÉTRICAS
    // =========================================================

    renderAll() {
        this.loadExternalModulesData();
        this.renderTemporalHeader();
        this.renderMetrics();
        this.renderCurrentView();
    },

    renderTemporalHeader() {
        const label = document.getElementById('current-period-label');

        if (!label) return;

        const date = new Date(`${this.state.currentDate}T00:00:00`);

        if (this.state.currentView === 'day') {
            label.textContent = date.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

            return;
        }

        if (this.state.currentView === 'week') {
            const { start, end } = this.getPeriodRange();

            const startDate = new Date(`${start}T00:00:00`);
            const endDate = new Date(`${end}T00:00:00`);

            label.textContent =
                `${startDate.toLocaleDateString('pt-BR', {
                    day: 'numeric',
                    month: 'short'
                })} — ${endDate.toLocaleDateString('pt-BR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                })}`;

            return;
        }

        label.textContent = date.toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric'
        });
    },

    renderMetrics() {
        const items = this.getUnifiedItemsForPeriod({
            ignoreFilters: true
        });

        const totalEvents = items.filter(item =>
            item.origin === 'event' ||
            item.origin === 'planning'
        ).length;

        const pendingTasks = items.filter(item =>
            item.origin === 'task' &&
            !this.isTaskCompleted(item.raw)
        ).length;

        const studyGoals = items.filter(item =>
            item.origin === 'study' ||
            item.origin === 'review' ||
            item.origin === 'goal'
        ).length;

        const eventsEl = document.getElementById('stat-total-events');
        const tasksEl = document.getElementById('stat-pending-tasks');
        const studiesEl = document.getElementById('stat-study-goals');

        if (eventsEl) eventsEl.textContent = totalEvents;
        if (tasksEl) tasksEl.textContent = pendingTasks;
        if (studiesEl) studiesEl.textContent = studyGoals;
    },

    // =========================================================
    // 15. RENDERIZAÇÃO DAS VISUALIZAÇÕES
    // =========================================================

    renderCurrentView() {
        document.querySelectorAll('.calendar-view-panel').forEach(panel => {
            panel.hidden = true;
        });

        const activePanel = document.getElementById(
            `view-${this.state.currentView}`
        );

        if (activePanel) {
            activePanel.hidden = false;
        }

        document.querySelectorAll('.view-tab').forEach(tab => {
            const selected = tab.dataset.view === this.state.currentView;

            tab.classList.toggle('active', selected);
            tab.setAttribute('aria-selected', String(selected));
        });

        if (this.state.currentView === 'month') {
            this.renderMonthView();
        } else if (this.state.currentView === 'week') {
            this.renderWeekView();
        } else if (this.state.currentView === 'day') {
            this.renderDayView();
        }

        this.renderTemporalHeader();
        this.renderMetrics();
    },

    renderItemBadge(item, extraClass = '') {
        const time = item.startTime
            ? `${this.escapeHTML(item.startTime)} `
            : '';

        const statusClass = item.status === 'completed'
            ? ' is-completed'
            : '';

        return `
            <div
                class="calendar-event-badge origin-${this.escapeHTML(item.origin)}${statusClass} ${extraClass}"
                title="${this.escapeHTML(item.title)}"
                data-item-id="${this.escapeHTML(item.id)}"
                data-origin="${this.escapeHTML(item.origin)}"
                role="button"
                tabindex="0"
            >
                ${time}${this.escapeHTML(item.title)}
            </div>
        `;
    },

    renderMonthView() {
        const container = document.getElementById('month-grid-container');

        if (!container) return;

        const date = new Date(`${this.state.currentDate}T00:00:00`);
        const year = date.getFullYear();
        const month = date.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        let offset = firstDay.getDay() - 1;

        if (offset < 0) offset = 6;

        const totalDays = lastDay.getDate();
        const items = this.getUnifiedItemsForPeriod();
        const today = this.getLocalDateString();

        let html = '';

        const previousMonthLastDay = new Date(year, month, 0).getDate();

        for (let i = offset - 1; i >= 0; i--) {
            html += `
                <div class="month-cell other-month">
                    <span class="day-number">${previousMonthLastDay - i}</span>
                </div>
            `;
        }

        for (let day = 1; day <= totalDays; day++) {
            const dateString =
                `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            const todayClass = dateString === today ? 'today' : '';

            const dayItems = items.filter(item => item.date === dateString);
            const visibleItems = dayItems.slice(0, 3);
            const remaining = dayItems.length - visibleItems.length;

            const badges = visibleItems.map(item =>
                this.renderItemBadge(item)
            ).join('');

            const more = remaining > 0
                ? `<span class="calendar-more">+${remaining} mais</span>`
                : '';

            html += `
                <div
                    class="month-cell ${todayClass}"
                    data-date="${dateString}"
                    tabindex="0"
                    role="button"
                    aria-label="Abrir ${day}/${month + 1}/${year}"
                >
                    <span class="day-number">${day}</span>
                    <div class="day-events-list">
                        ${badges}
                        ${more}
                    </div>
                </div>
            `;
        }

        const totalCells = offset + totalDays;
        const remainingCells = (7 - totalCells % 7) % 7;

        for (let day = 1; day <= remainingCells; day++) {
            html += `
                <div class="month-cell other-month">
                    <span class="day-number">${day}</span>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    renderWeekView() {
        const container = document.getElementById('week-grid-container');

        if (!container) return;

        const { start } = this.getPeriodRange();
        const startDate = new Date(`${start}T00:00:00`);
        const items = this.getUnifiedItemsForPeriod();

        let html = '';

        for (let i = 0; i < 7; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);

            const dateString = this.getLocalDateString(date);

            const dayName = date.toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: 'numeric',
                month: 'numeric'
            });

            const dayItems = items.filter(item => item.date === dateString);

            const content = dayItems.length
                ? dayItems.map(item => `
                    <div
                        class="calendar-event-badge origin-${this.escapeHTML(item.origin)}${item.status === 'completed' ? ' is-completed' : ''}"
                        style="padding:0.3rem 0.5rem;margin-bottom:0.25rem"
                        data-item-id="${this.escapeHTML(item.id)}"
                        data-origin="${this.escapeHTML(item.origin)}"
                        role="button"
                        tabindex="0"
                    >
                        <strong>${this.escapeHTML(item.startTime || 'Todo o dia')}</strong>
                        — ${this.escapeHTML(item.title)}
                    </div>
                `).join('')
                : '<span class="calendar-empty-day">Nenhum registro neste dia.</span>';

            html += `
                <div class="time-slot-row">
                    <div class="time-slot-label">${this.escapeHTML(dayName)}</div>
                    <div class="time-slot-content">${content}</div>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    renderDayView() {
        const container = document.getElementById('day-grid-container');

        if (!container) return;

        const items = this.getUnifiedItemsForPeriod().filter(item =>
            item.date === this.state.currentDate
        );

        if (!items.length) {
            container.innerHTML = `
                <p class="empty-message" style="text-align:center;padding:2rem">
                    Nenhum evento ou atividade agendada para esta data.
                </p>
            `;
            return;
        }

        const originLabels = {
            event: 'Evento',
            planning: 'Planejamento',
            task: 'Tarefa',
            study: 'Estudo',
            review: 'Revisão',
            goal: 'Meta',
            habit: 'Hábito'
        };

        container.innerHTML = items.map(item => `
            <div
                class="time-slot-row"
                style="cursor:pointer"
                data-item-id="${this.escapeHTML(item.id)}"
                data-origin="${this.escapeHTML(item.origin)}"
                role="button"
                tabindex="0"
            >
                <div class="time-slot-label">
                    ${this.escapeHTML(item.startTime || 'Geral')}
                    ${item.endTime ? ` - ${this.escapeHTML(item.endTime)}` : ''}
                </div>

                <div class="time-slot-content" style="flex-direction:column;gap:0.2rem">
                    <div style="display:flex;gap:0.5rem;align-items:center">
                        <span class="calendar-event-badge origin-${this.escapeHTML(item.origin)}">
                            ${this.escapeHTML(originLabels[item.origin] || item.origin)}
                        </span>

                        <strong>${this.escapeHTML(item.title)}</strong>
                    </div>

                    <p style="font-size:0.85rem;color:var(--color-text-muted)">
                        ${this.escapeHTML(item.description || 'Sem descrição adicional.')}
                    </p>
                </div>
            </div>
        `).join('');
    },

    // =========================================================
    // 16. NOTIFICAÇÕES
    // =========================================================

    showToast(message) {
        const toast = document.getElementById('toast');

        if (!toast) return;

        toast.textContent = message;
        toast.classList.add('show');

        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
        }

        this.toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    },

    // =========================================================
    // 17. NAVEGAÇÃO
    // =========================================================

    navigatePeriod(direction) {
        const date = new Date(`${this.state.currentDate}T00:00:00`);

        if (this.state.currentView === 'day') {
            date.setDate(date.getDate() + direction);
        } else if (this.state.currentView === 'week') {
            date.setDate(date.getDate() + 7 * direction);
        } else {
            date.setDate(1);
            date.setMonth(date.getMonth() + direction);
        }

        this.state.currentDate = this.getLocalDateString(date);
        this.renderAll();
    },

    // =========================================================
    // 18. FILTROS
    // =========================================================

    clearFilters() {
        this.state.filters = {
            search: '',
            origin: 'all',
            category: 'all'
        };

        const search = document.getElementById('calendar-search');
        const origin = document.getElementById('calendar-origin-filter');
        const category = document.getElementById('calendar-category-filter');

        if (search) search.value = '';
        if (origin) origin.value = 'all';
        if (category) category.value = 'all';

        this.renderCurrentView();
    },

    // =========================================================
    // 19. SINCRONIZAÇÃO ENTRE ABAS E MÓDULOS
    // =========================================================

    setupCrossTabSync() {
        const knownKeys = new Set(Object.values(this.STORAGE_KEYS));

        window.addEventListener('storage', event => {
            if (event.key !== null && !knownKeys.has(event.key)) {
                return;
            }

            if (
                event.key === null ||
                event.key === this.STORAGE_KEYS.CALENDAR_EVENTS
            ) {
                this.loadEvents();
            }

            this.renderAll();
        });

        window.addEventListener('focus', () => {
            this.refreshExternalData();
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.refreshExternalData();
            }
        });

        window.addEventListener('painel:data-changed', () => {
            this.refreshExternalData();
        });

        window.addEventListener('painel:refresh-calendar', () => {
            this.refreshExternalData();
        });
    },

    refreshExternalData() {
        this.loadEvents();
        this.loadExternalModulesData();
        this.renderAll();
    },

    // =========================================================
    // 20. EVENTOS E INTERAÇÕES
    // =========================================================

    bindEvents() {
        document.addEventListener('click', event => {
            const target = event.target;

            if (!(target instanceof Element)) return;

            const closeButton = target.closest('[data-close-modal]');

            if (closeButton) {
                this.closeModal(closeButton.dataset.closeModal);
                return;
            }

            const itemElement = target.closest('[data-item-id]');

            if (itemElement) {
                this.openDetailsModal(
                    itemElement.dataset.itemId,
                    itemElement.dataset.origin
                );

                return;
            }

            const monthCell = target.closest('.month-cell');

            if (
                monthCell &&
                monthCell.dataset.date &&
                !monthCell.classList.contains('other-month')
            ) {
                this.state.currentDate = monthCell.dataset.date;
                this.openEventModal();
            }
        });

        document.getElementById('new-event-button')
            ?.addEventListener('click', () => {
                this.openEventModal();
            });

        document.getElementById('event-form')
            ?.addEventListener('submit', event => {
                event.preventDefault();

                const getValue = id =>
                    document.getElementById(id)?.value ?? '';

                this.saveEventFromModal({
                    id: getValue('event-id'),
                    title: getValue('event-title'),
                    description: getValue('event-description'),
                    category: getValue('event-category'),
                    color: getValue('event-color'),
                    date: getValue('event-date'),
                    location: getValue('event-location'),
                    startTime: getValue('event-start-time'),
                    endTime: getValue('event-end-time')
                });
            });

        document.getElementById('today-jump-btn')
            ?.addEventListener('click', () => {
                this.state.currentDate = this.getLocalDateString();
                this.renderAll();
            });

        document.getElementById('prev-period-btn')
            ?.addEventListener('click', () => {
                this.navigatePeriod(-1);
            });

        document.getElementById('next-period-btn')
            ?.addEventListener('click', () => {
                this.navigatePeriod(1);
            });

        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', event => {
                const view = event.currentTarget.dataset.view;

                if (!['month', 'week', 'day'].includes(view)) {
                    return;
                }

                this.state.currentView = view;
                this.renderCurrentView();
            });
        });

        document.getElementById('calendar-search')
            ?.addEventListener('input', event => {
                this.state.filters.search = event.target.value;
                this.renderCurrentView();
            });

        document.getElementById('calendar-origin-filter')
            ?.addEventListener('change', event => {
                this.state.filters.origin = event.target.value;
                this.renderCurrentView();
            });

        document.getElementById('calendar-category-filter')
            ?.addEventListener('change', event => {
                this.state.filters.category = event.target.value;
                this.renderCurrentView();
            });

        document.getElementById('clear-calendar-filters')
            ?.addEventListener('click', () => {
                this.clearFilters();
            });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            const target = event.target;

            if (!(target instanceof Element)) return;

            const item = target.closest('[data-item-id]');

            if (!item || target !== item) return;

            if (target.matches('button, input, select, textarea')) {
                return;
            }

            event.preventDefault();

            this.openDetailsModal(
                item.dataset.itemId,
                item.dataset.origin
            );
        });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            const target = event.target;

            if (!(target instanceof Element)) return;

            const cell = target.closest('.month-cell[data-date]');

            if (
                !cell ||
                target !== cell ||
                cell.classList.contains('other-month')
            ) {
                return;
            }

            event.preventDefault();

            this.state.currentDate = cell.dataset.date;
            this.openEventModal();
        });

        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', event => {
                if (event.target === modal) {
                    modal.hidden = true;
                }
            });
        });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;

            document.querySelectorAll('.modal-overlay').forEach(modal => {
                if (!modal.hidden) {
                    modal.hidden = true;
                }
            });
        });
    }
};