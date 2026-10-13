'use strict';

/* =========================================================
   01. CONFIGURAÇÃO E ESTADO
   ========================================================= */

const STORAGE_KEY = 'painel_tarefas_v1';
const PLANNING_STORAGE_KEY = 'painel_planejamento_v1';

const DEFAULT_TASKS = [];

let tasks = [];
let editingTaskId = null;
let initialized = false;
let lastSavedData = '';
let headerClockInterval = null;

const filters = {
    search: '',
    status: 'all',
    category: 'all',
    priority: 'all',
    period: 'all'
};

const VALID_STATUSES = [
    'pending',
    'in-progress',
    'completed',
    'overdue'
];

const VALID_PRIORITIES = ['high', 'medium', 'low'];

const CATEGORY_LABELS = {
    academico: 'Acadêmico',
    acadêmico: 'Acadêmico',
    academic: 'Acadêmico',
    escola: 'Escola',
    pessoal: 'Pessoal',
    personal: 'Pessoal',
    projeto: 'Projeto',
    project: 'Projeto',
    exercicios: 'Exercícios',
    exercícios: 'Exercícios',
    studies: 'Estudos',
    estudos: 'Estudos',
    organização: 'Organização',
    organizacao: 'Organização',
    trabalho: 'Trabalho',
    work: 'Trabalho',
    saude: 'Saúde',
    saúde: 'Saúde',
    other: 'Outros',
    outros: 'Outros'
};

const elements = {
    headerDate: document.querySelector('.header-date time'),

    taskSearch: document.querySelector('#task-search'),
    statusFilter: document.querySelector('#status-filter'),
    categoryFilter: document.querySelector('#category-filter'),
    priorityFilter: document.querySelector('#priority-filter'),
    periodFilter: document.querySelector('#period-filter'),

    clearFiltersButton: document.querySelector('#clear-filters-button'),
    newTaskButton: document.querySelector('#new-task-button'),
    openModalButton: document.querySelector('#open-task-modal-btn'),
    filterTasksButton: document.querySelector('#filter-tasks-button'),

    taskModal: document.querySelector('#task-modal'),
    modalBackdrop: document.querySelector('#modal-backdrop'),
    closeModalButton: document.querySelector('#close-task-modal-btn'),
    cancelModalButton: document.querySelector('#cancel-task-modal-btn'),

    newTaskSection: document.querySelector('#new-task-section'),
    newTaskForm: document.querySelector('.new-task-form'),
    quickTaskForm: document.querySelector('.quick-task-form'),

    taskTitle: document.querySelector('#task-title'),
    taskCategory: document.querySelector('#task-category'),
    taskDescription: document.querySelector('#task-description'),
    taskPriority: document.querySelector('#task-priority'),
    taskStatus: document.querySelector('#task-status'),
    taskDueDate: document.querySelector('#task-due-date'),
    taskDueTime: document.querySelector('#task-due-time'),
    taskType: document.querySelector('#task-type'),
    taskEstimatedTime: document.querySelector('#task-estimated-time'),
    taskNotes: document.querySelector('#task-notes'),

    quickTaskTitle: document.querySelector('#quick-task-title'),
    quickTaskCategory: document.querySelector('#quick-task-category'),
    quickTaskPriority: document.querySelector('#quick-task-priority'),
    quickTaskDate: document.querySelector('#quick-task-date'),
    quickTaskTime: document.querySelector('#quick-task-time'),

    taskLists: {
        important: document.querySelector('.important-task-list'),
        today: document.querySelector('.today-tasks .task-list'),
        upcoming: document.querySelector('.upcoming-tasks .task-list'),
        completed: document.querySelector('.completed-tasks .task-list')
    },

    counts: {
        important: document.querySelector('.important-tasks .task-count'),
        today: document.querySelector('.today-tasks .task-count'),
        completed: document.querySelector('.completed-tasks .task-count')
    },

    overviewCards: document.querySelectorAll('.overview-card'),

    productivityPercentage: document.querySelector('.productivity-percentage'),
    progressBar: document.querySelector('.progress-bar'),
    progressValue: document.querySelector('.progress-value'),
    progressDescription: document.querySelector('.progress-description'),

    categoryList: document.querySelector('.category-list'),
    distributionList: document.querySelector('.distribution-list')
};

/* =========================================================
   02. INICIALIZAÇÃO
   ========================================================= */

document.addEventListener('DOMContentLoaded', initTaskManager);

function initTaskManager() {
    if (initialized) return;

    initialized = true;

    loadTasks();

    if (normalizeTasks()) {
        saveTasks();
    }

    bindEvents();
    updateAll();
    updateHeaderDateTime();

    if (headerClockInterval) {
        clearInterval(headerClockInterval);
    }

    headerClockInterval = setInterval(updateHeaderDateTime, 60000);

    setupCrossTabSync();
}

/* =========================================================
   03. DATAS E HORÁRIOS
   ========================================================= */

function getTodayString() {
    return formatDateToString(new Date());
}

function formatDateToString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
    if (!isValidDate(dateString)) {
        return new Date(NaN);
    }

    const [year, month, day] = dateString.split('-').map(Number);

    return new Date(year, month - 1, day);
}

function isValidDate(value) {
    if (typeof value !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const date = new Date(`${value}T00:00:00`);

    return !Number.isNaN(date.getTime()) &&
        formatDateToString(date) === value;
}

function addDays(dateString, amount) {
    const date = parseLocalDate(dateString);

    if (Number.isNaN(date.getTime())) return '';

    date.setDate(date.getDate() + amount);

    return formatDateToString(date);
}

function normalizeTime(value) {
    const time = String(value || '').trim();

    return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
        ? time
        : '';
}

function updateHeaderDateTime() {
    if (!elements.headerDate) return;

    const now = new Date();

    let formattedDate = now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    formattedDate =
        formattedDate.charAt(0).toUpperCase() +
        formattedDate.slice(1);

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    elements.headerDate.setAttribute(
        'datetime',
        now.toISOString()
    );

    elements.headerDate.textContent =
        `${formattedDate} — ${hours}:${minutes}`;
}

function isWithinCurrentWeek(dateString) {
    const date = parseLocalDate(dateString);

    if (Number.isNaN(date.getTime())) return false;

    const today = new Date();
    const monday = new Date(today);

    const weekday = today.getDay();
    const difference = weekday === 0 ? -6 : 1 - weekday;

    monday.setDate(today.getDate() + difference);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return date >= monday && date <= sunday;
}

function isWithinCurrentMonth(dateString) {
    const date = parseLocalDate(dateString);

    if (Number.isNaN(date.getTime())) return false;

    const today = new Date();

    return date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth();
}

/* =========================================================
   04. NORMALIZAÇÃO DE TAREFAS
   ========================================================= */

function generateTaskId() {
    if (
        typeof crypto !== 'undefined' &&
        typeof crypto.randomUUID === 'function'
    ) {
        return `task-${crypto.randomUUID()}`;
    }

    return `task-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

function normalizePriority(value) {
    const priority = String(value || 'medium')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const aliases = {
        alta: 'high',
        high: 'high',
        media: 'medium',
        medio: 'medium',
        medium: 'medium',
        baixa: 'low',
        baixo: 'low',
        low: 'low'
    };

    return aliases[priority] || 'medium';
}

function normalizeTaskStatus(value) {
    const status = String(value || 'pending')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    const aliases = {
        pending: 'pending',
        pendente: 'pending',
        'in-progress': 'in-progress',
        in_progress: 'in-progress',
        'in progress': 'in-progress',
        em_andamento: 'in-progress',
        completed: 'completed',
        complete: 'completed',
        concluida: 'completed',
        concluido: 'completed',
        done: 'completed',
        overdue: 'overdue',
        atrasada: 'overdue',
        atrasado: 'overdue',
        cancelled: 'cancelled',
        canceled: 'cancelled',
        cancelado: 'cancelled',
        cancelada: 'cancelled'
    };

    return aliases[status] || 'pending';
}

function normalizeTaskRecord(task) {
    const normalized = { ...task };

    normalized.id = String(
        normalized.id ?? generateTaskId()
    );

    normalized.title = String(normalized.title || '').trim();
    normalized.description = String(normalized.description || '');
    normalized.category = String(normalized.category || 'pessoal');
    normalized.priority = normalizePriority(normalized.priority);
    normalized.status = normalizeTaskStatus(normalized.status);

    normalized.dueDate = isValidDate(normalized.dueDate)
        ? normalized.dueDate
        : '';

    normalized.dueTime = normalizeTime(normalized.dueTime);
    normalized.type = normalized.type || 'single';

    normalized.estimatedTime =
        normalized.estimatedTime == null
            ? ''
            : String(normalized.estimatedTime);

    normalized.notes = String(normalized.notes || '');
    normalized.important = Boolean(normalized.important);

    if (normalized.status === 'completed') {
        normalized.completedAt =
            normalized.completedAt || getTodayString();
    } else {
        normalized.completedAt = null;
    }

    return normalized;
}

/*
 * Atualiza o atraso sem sobrescrever o status "in-progress".
 * Retorna true quando houve alteração.
 */
function normalizeTasks() {
    const today = getTodayString();
    let changed = false;

    tasks = tasks.map(original => {
        const task = { ...original };
        const previousStatus = task.status;

        if (task.status === 'completed' || task.status === 'cancelled') {
            return task;
        }

        if (task.status === 'in-progress') {
            return task;
        }

        if (task.dueDate && task.dueDate < today) {
            task.status = 'overdue';
        } else if (task.status === 'overdue') {
            task.status = 'pending';
        }

        if (task.status !== previousStatus) {
            changed = true;
        }

        return task;
    });

    return changed;
}

/* =========================================================
   05. ARMAZENAMENTO E SINCRONIZAÇÃO
   ========================================================= */

function loadTasks() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (stored === null) {
            tasks = DEFAULT_TASKS.map(task =>
                normalizeTaskRecord(task)
            );

            lastSavedData = '';
            return;
        }

        const parsed = JSON.parse(stored);

        const list = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.items)
                ? parsed.items
                : null;

        if (!list) {
            console.error('Formato inválido no armazenamento de tarefas.');
            return;
        }

        tasks = list
            .filter(task =>
                task &&
                typeof task === 'object' &&
                !Array.isArray(task)
            )
            .map(normalizeTaskRecord);

        lastSavedData = stored;
    } catch (error) {
        console.error('Erro ao carregar tarefas:', error);

        showNotification(
            'Não foi possível carregar as tarefas salvas.',
            'error'
        );
    }
}

function saveTasks() {
    try {
        const serialized = JSON.stringify(tasks);

        localStorage.setItem(STORAGE_KEY, serialized);
        lastSavedData = serialized;

        notifyDataChanged('tasks');

        return true;
    } catch (error) {
        console.error('Erro ao salvar tarefas:', error);

        showNotification(
            'Não foi possível salvar as tarefas.',
            'error'
        );

        return false;
    }
}

function notifyDataChanged(source = 'tasks') {
    const detail = {
        module: source,
        source,
        key: STORAGE_KEY,
        timestamp: Date.now()
    };

    // Evento específico do módulo Tarefas.
    window.dispatchEvent(
        new CustomEvent('tasks:updated', { detail })
    );

    // Compatibilidade com os módulos que já usam estes eventos.
    window.dispatchEvent(
        new CustomEvent('painel:data-changed', { detail })
    );

    window.dispatchEvent(
        new CustomEvent('painel:refresh-calendar', { detail })
    );
}

function syncTasksFromPlanning() {
    try {
        const planRaw = localStorage.getItem(PLANNING_STORAGE_KEY);
        if (!planRaw) return;

        let activities = JSON.parse(planRaw);
        if (!Array.isArray(activities) || !Array.isArray(tasks)) return;

        let tasksChanged = false;

        activities.forEach(activity => {
            if (String(activity.linkedType || '').toLowerCase() === 'task' && activity.linkedId) {
                const task = tasks.find(t => String(t.id) === String(activity.linkedId));
                if (task) {
                    if (activity.title && activity.title !== task.title) {
                        task.title = activity.title;
                        tasksChanged = true;
                    }
                    if (activity.description !== undefined && activity.description !== task.description) {
                        task.description = activity.description;
                        tasksChanged = true;
                    }
                    if (activity.category && activity.category !== task.category) {
                        task.category = activity.category;
                        tasksChanged = true;
                    }
                    if (activity.date && activity.date !== task.dueDate) {
                        task.dueDate = activity.date;
                        tasksChanged = true;
                    }
                    if (activity.priority && activity.priority !== task.priority) {
                        task.priority = normalizePriority(activity.priority);
                        tasksChanged = true;
                    }
                }
            }
        });

        if (tasksChanged) {
            const serialized = JSON.stringify(tasks);
            localStorage.setItem(STORAGE_KEY, serialized);
            lastSavedData = serialized;
            updateAll();
        }
    } catch (e) {
        console.error('Erro ao sincronizar tarefas a partir do planejamento:', e);
    }
}

function setupCrossTabSync() {
    window.addEventListener('storage', event => {
        if (
            event.key !== STORAGE_KEY &&
            event.key !== PLANNING_STORAGE_KEY &&
            event.key !== null
        ) {
            return;
        }

        if (event.key === PLANNING_STORAGE_KEY) {
            syncTasksFromPlanning();
        }

        reloadTasksFromStorage(true);
    });

    const handleExternalUpdate = event => {
        const source = event.detail?.source ||
            event.detail?.module ||
            '';

        if (source === 'tasks') return;

        const key = event.detail?.key;

        if (
            key &&
            key !== STORAGE_KEY &&
            key !== PLANNING_STORAGE_KEY
        ) {
            return;
        }

        syncTasksFromPlanning();
        reloadTasksFromStorage(false);
    };

    window.addEventListener('tasks:updated', event => {
        if (event.detail?.source === 'tasks') return;
        handleExternalUpdate(event);
    });

    window.addEventListener('planning:updated', handleExternalUpdate);
    window.addEventListener('painel:data-changed', handleExternalUpdate);
    window.addEventListener('painel:refresh-calendar', handleExternalUpdate);

    window.addEventListener('focus', () => {
        syncTasksFromPlanning();
        reloadTasksFromStorage(false);
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            syncTasksFromPlanning();
            reloadTasksFromStorage(false);
        }
    });
}

function reloadTasksFromStorage(force = false) {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (stored === null) return;

        if (!force && stored === lastSavedData) {
            return;
        }

        loadTasks();

        const normalizedChanged = normalizeTasks();

        if (normalizedChanged) {
            saveTasks();
        }

        updateAll();
    } catch (error) {
        console.error('Erro ao sincronizar tarefas:', error);
    }
}

/* =========================================================
   06. EVENTOS E INTERAÇÕES
   ========================================================= */

function bindEvents() {
    elements.taskSearch?.addEventListener('input', event => {
        filters.search = event.target.value
            .trim()
            .toLocaleLowerCase('pt-BR');

        updateTaskLists();
    });

    elements.statusFilter?.addEventListener('change', event => {
        filters.status = event.target.value;
        updateTaskLists();
    });

    elements.categoryFilter?.addEventListener('change', event => {
        filters.category = event.target.value;
        updateTaskLists();
    });

    elements.priorityFilter?.addEventListener('change', event => {
        filters.priority = event.target.value;
        updateTaskLists();
    });

    elements.periodFilter?.addEventListener('change', event => {
        filters.period = event.target.value;
        updateTaskLists();
    });

    elements.clearFiltersButton?.addEventListener('click', clearFilters);
    elements.newTaskButton?.addEventListener('click', openNewTaskForm);
    elements.openModalButton?.addEventListener('click', openNewTaskForm);

    elements.closeModalButton?.addEventListener('click', closeTaskModal);
    elements.cancelModalButton?.addEventListener('click', closeTaskModal);
    elements.modalBackdrop?.addEventListener('click', closeTaskModal);

    elements.filterTasksButton?.addEventListener('click', () => {
        document.querySelector('.task-filters')?.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    });

    elements.newTaskForm?.addEventListener(
        'submit',
        handleTaskFormSubmit
    );

    elements.quickTaskForm?.addEventListener(
        'submit',
        handleQuickTaskSubmit
    );

    elements.newTaskForm?.addEventListener('reset', () => {
        editingTaskId = null;
        setTimeout(updateFormMode, 0);
    });

    document.addEventListener('change', handleCheckboxChange);
    document.addEventListener('click', handleDynamicActions);
    document.addEventListener('keydown', handleKeyboardShortcuts);

    elements.categoryList?.addEventListener('click', event => {
        const target = event.target;

        if (!(target instanceof Element)) return;

        const button = target.closest('[data-category]');

        if (!button) return;

        const category = button.dataset.category;

        if (elements.categoryFilter) {
            elements.categoryFilter.value = category;
        }

        filters.category = category;
        updateTaskLists();
    });
}

/* =========================================================
   07. MODAL
   ========================================================= */

function openTaskModal() {
    if (elements.taskModal) {
        elements.taskModal.hidden = false;
    }
}

function closeTaskModal() {
    if (elements.taskModal) {
        elements.taskModal.hidden = true;
    }

    editingTaskId = null;
    elements.newTaskForm?.reset();
    updateFormMode();
}

function openNewTaskForm() {
    editingTaskId = null;

    elements.newTaskForm?.reset();
    updateFormMode();
    openTaskModal();

    setTimeout(() => elements.taskTitle?.focus(), 100);
}

function updateFormMode() {
    const submitButton = elements.newTaskForm?.querySelector(
        'button[type="submit"]'
    );

    const heading = document.querySelector('#new-task-title');

    if (submitButton) {
        submitButton.textContent = editingTaskId
            ? 'Salvar alterações'
            : 'Criar tarefa';
    }

    if (heading) {
        heading.textContent = editingTaskId
            ? 'Editar tarefa'
            : 'Adicionar nova tarefa';
    }
}

/* =========================================================
   08. FILTROS
   ========================================================= */

function getFilteredTasks() {
    return tasks.filter(task => {
        const searchableText = [
            task.title,
            task.description,
            task.notes,
            getCategoryLabel(task.category)
        ]
            .map(value => String(value || ''))
            .join(' ')
            .toLocaleLowerCase('pt-BR');

        const matchesSearch =
            !filters.search ||
            searchableText.includes(filters.search);

        const matchesStatus =
            filters.status === 'all' ||
            task.status === filters.status;

        const matchesCategory =
            filters.category === 'all' ||
            task.category === filters.category;

        const matchesPriority =
            filters.priority === 'all' ||
            task.priority === filters.priority;

        const matchesPeriod =
            filters.period === 'all' ||
            matchesPeriodFilter(task, filters.period);

        return matchesSearch &&
            matchesStatus &&
            matchesCategory &&
            matchesPriority &&
            matchesPeriod;
    });
}

function matchesPeriodFilter(task, period) {
    if (!task.dueDate || !isValidDate(task.dueDate)) {
        return false;
    }

    const today = getTodayString();
    const tomorrow = addDays(today, 1);

    if (period === 'today') {
        return task.dueDate === today;
    }

    if (period === 'tomorrow') {
        return task.dueDate === tomorrow;
    }

    if (period === 'week') {
        return isWithinCurrentWeek(task.dueDate);
    }

    if (period === 'month') {
        return isWithinCurrentMonth(task.dueDate);
    }

    return true;
}

function clearFilters() {
    Object.assign(filters, {
        search: '',
        status: 'all',
        category: 'all',
        priority: 'all',
        period: 'all'
    });

    if (elements.taskSearch) elements.taskSearch.value = '';
    if (elements.statusFilter) elements.statusFilter.value = 'all';
    if (elements.categoryFilter) elements.categoryFilter.value = 'all';
    if (elements.priorityFilter) elements.priorityFilter.value = 'all';
    if (elements.periodFilter) elements.periodFilter.value = 'all';

    updateTaskLists();
}

/* =========================================================
   09. RENDERIZAÇÃO
   ========================================================= */

function updateAll() {
    updateTaskLists();
    updateOverview();
    updateProgress();
    updateCategories();
    updateDistribution();
}

function updateTaskLists() {
    const filtered = getFilteredTasks();
    const today = getTodayString();

    const importantTasks = filtered.filter(task =>
        task.important &&
        task.status !== 'completed' &&
        task.status !== 'cancelled'
    );

    const todayTasks = filtered.filter(task =>
        task.dueDate === today &&
        task.status !== 'completed' &&
        task.status !== 'cancelled'
    );

    const upcomingTasks = filtered.filter(task =>
        task.dueDate > today &&
        task.status !== 'completed' &&
        task.status !== 'cancelled'
    );

    const completedTasks = filtered.filter(task =>
        task.status === 'completed'
    );

    renderTaskList(
        elements.taskLists.important,
        importantTasks,
        'Nenhuma tarefa importante encontrada.'
    );

    renderTaskList(
        elements.taskLists.today,
        todayTasks,
        'Nenhuma tarefa para hoje.'
    );

    renderTaskList(
        elements.taskLists.upcoming,
        upcomingTasks,
        'Nenhuma tarefa próxima.'
    );

    renderTaskList(
        elements.taskLists.completed,
        completedTasks,
        'Nenhuma tarefa concluída.'
    );

    updateTaskCounts(importantTasks, todayTasks, completedTasks);
}

function renderTaskList(container, taskList, emptyMessage) {
    if (!container) return;

    container.replaceChildren();

    if (!taskList.length) {
        container.appendChild(createEmptyState(emptyMessage));
        return;
    }

    const fragment = document.createDocumentFragment();

    [...taskList].sort(sortTasks).forEach(task => {
        fragment.appendChild(createTaskCard(task));
    });

    container.appendChild(fragment);
}

function createTaskCard(task) {
    const article = document.createElement('article');

    article.className = [
        'task-card',
        `task-card-${task.status}`,
        task.important ? 'task-card-important' : ''
    ].filter(Boolean).join(' ');

    article.dataset.taskId = task.id;

    const escapedId = escapeAttribute(task.id);
    const completed = task.status === 'completed';

    article.innerHTML = `
        <div class="task-card-main">
            <div class="task-checkbox">
                <input
                    type="checkbox"
                    id="checkbox-${escapedId}"
                    data-task-checkbox="${escapedId}"
                    ${completed ? 'checked' : ''}
                    aria-label="${completed
                        ? 'Marcar tarefa como pendente'
                        : 'Concluir tarefa'}"
                >

                <label for="checkbox-${escapedId}">
                    <span class="visually-hidden">
                        ${completed
                            ? 'Marcar tarefa como pendente'
                            : 'Concluir tarefa'}
                    </span>
                </label>
            </div>

            <div class="task-content">
                <div class="task-title-row">
                    <h4 class="task-title">
                        ${escapeHTML(task.title)}
                    </h4>

                    <span class="task-priority priority-${task.priority}">
                        ${getPriorityLabel(task.priority)}
                    </span>
                </div>

                <p class="task-description">
                    ${escapeHTML(task.description || 'Sem descrição.')}
                </p>

                <div class="task-metadata">
                    <span class="task-category">
                        ${escapeHTML(getCategoryLabel(task.category))}
                    </span>

                    <time datetime="${escapeAttribute(
                        task.dueDate +
                        (task.dueTime ? `T${task.dueTime}` : '')
                    )}">
                        ${escapeHTML(formatTaskDate(task))}
                    </time>

                    <span class="task-status status-${task.status}">
                        ${getStatusLabel(task.status)}
                    </span>
                </div>
            </div>
        </div>

        <div class="task-card-actions">
            <button
                type="button"
                class="task-action"
                data-action="edit"
                data-task-id="${escapedId}"
            >
                Editar
            </button>

            <button
                type="button"
                class="task-action"
                data-action="delete"
                data-task-id="${escapedId}"
            >
                Excluir
            </button>
        </div>
    `;

    return article;
}

function createEmptyState(message) {
    const element = document.createElement('div');
    element.className = 'task-empty-state';

    const paragraph = document.createElement('p');
    paragraph.textContent = message;

    element.appendChild(paragraph);

    return element;
}

/* =========================================================
   10. CONCLUSÃO E AÇÕES DINÂMICAS
   ========================================================= */

function handleCheckboxChange(event) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const checkbox = target.closest('[data-task-checkbox]');

    if (!checkbox) return;

    const task = findTask(checkbox.dataset.taskCheckbox);

    if (!task) return;

    const previous = { ...task };

    if (checkbox.checked) {
        task.status = 'completed';
        task.completedAt = getTodayString();
    } else {
        task.status = determineCurrentStatus(task);
        task.completedAt = null;
    }

    if (!saveTasks()) {
        Object.assign(task, previous);
        updateAll();
        return;
    }

    updateAll();
}

function handleDynamicActions(event) {
    const target = event.target;

    if (!(target instanceof Element)) return;

    const actionButton = target.closest('[data-action]');

    if (!actionButton) return;

    const taskId = actionButton.dataset.taskId;

    if (actionButton.dataset.action === 'edit') {
        editTask(taskId);
    } else if (actionButton.dataset.action === 'delete') {
        deleteTask(taskId);
    }
}

/* =========================================================
   11. FORMULÁRIO PRINCIPAL
   ========================================================= */

function getMainFormData() {
    return {
        title: elements.taskTitle?.value.trim() || '',
        description: elements.taskDescription?.value.trim() || '',
        category: elements.taskCategory?.value || '',
        priority: normalizePriority(elements.taskPriority?.value),
        status: normalizeTaskStatus(elements.taskStatus?.value),
        dueDate: elements.taskDueDate?.value || '',
        dueTime: elements.taskDueTime?.value || '',
        type: elements.taskType?.value || 'single',
        estimatedTime: elements.taskEstimatedTime?.value.trim() || '',
        notes: elements.taskNotes?.value.trim() || ''
    };
}

function validateTaskData(data) {
    if (!data.title) {
        showNotification('O título da tarefa é obrigatório.', 'error');
        elements.taskTitle?.focus();
        return false;
    }

    if (!data.category) {
        showNotification('Selecione uma categoria.', 'error');
        elements.taskCategory?.focus();
        return false;
    }

    if (!VALID_PRIORITIES.includes(data.priority)) {
        showNotification('Selecione uma prioridade válida.', 'error');
        elements.taskPriority?.focus();
        return false;
    }

    if (!VALID_STATUSES.includes(data.status)) {
        showNotification('Selecione um status válido.', 'error');
        elements.taskStatus?.focus();
        return false;
    }

    if (!isValidDate(data.dueDate)) {
        showNotification('Defina uma data válida para a tarefa.', 'error');
        elements.taskDueDate?.focus();
        return false;
    }

    if (
        data.dueTime &&
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.dueTime)
    ) {
        showNotification('Informe um horário válido.', 'error');
        elements.taskDueTime?.focus();
        return false;
    }

    return true;
}

function handleTaskFormSubmit(event) {
    event.preventDefault();

    const data = getMainFormData();

    if (!validateTaskData(data)) return;

    const wasEditing = editingTaskId !== null;

    const success = wasEditing
        ? updateExistingTask(data)
        : Boolean(createTask(data));

    if (!success) return;

    closeTaskModal();
    updateAll();

    showNotification(
        wasEditing
            ? 'Tarefa atualizada.'
            : 'Tarefa salva com sucesso.',
        'success'
    );
}

function createTask(taskData) {
    if (!taskData || typeof taskData !== 'object') {
        return null;
    }

    const data = {
        title: String(taskData.title || '').trim(),
        description: String(taskData.description || ''),
        category: String(taskData.category || 'pessoal'),
        priority: normalizePriority(taskData.priority),
        status: normalizeTaskStatus(taskData.status),
        dueDate: isValidDate(taskData.dueDate)
            ? taskData.dueDate
            : '',
        dueTime: normalizeTime(taskData.dueTime),
        type: taskData.type || 'single',
        estimatedTime: taskData.estimatedTime == null
            ? ''
            : String(taskData.estimatedTime),
        notes: String(taskData.notes || '')
    };

    if (!data.title) return null;

    const newTask = {
        id: generateTaskId(),
        ...data,
        important: taskData.important == null
            ? data.priority === 'high'
            : Boolean(taskData.important),
        completedAt: data.status === 'completed'
            ? taskData.completedAt || getTodayString()
            : null
    };

    const previousTasks = tasks;

    tasks = [...tasks, newTask];

    if (!saveTasks()) {
        tasks = previousTasks;
        return null;
    }

    return { ...newTask };
}

function updateExistingTask(taskData) {
    const task = findTask(editingTaskId);

    if (!task) {
        showNotification('Tarefa não encontrada.', 'error');
        return false;
    }

    const previous = { ...task };

    Object.assign(task, {
        title: taskData.title,
        description: taskData.description,
        category: taskData.category,
        priority: taskData.priority,
        status: taskData.status,
        dueDate: taskData.dueDate,
        dueTime: taskData.dueTime,
        type: taskData.type,
        estimatedTime: taskData.estimatedTime,
        notes: taskData.notes,
        important: taskData.priority === 'high',
        completedAt: taskData.status === 'completed'
            ? previous.completedAt || getTodayString()
            : null
    });

    if (!saveTasks()) {
        Object.assign(task, previous);
        return false;
    }

    return true;
}

/* =========================================================
   12. FORMULÁRIO RÁPIDO
   ========================================================= */

function handleQuickTaskSubmit(event) {
    event.preventDefault();

    const title = elements.quickTaskTitle?.value.trim() || '';

    if (!title) {
        showNotification('Digite um título para a tarefa.', 'error');
        elements.quickTaskTitle?.focus();
        return;
    }

    const dueDate =
        elements.quickTaskDate?.value || getTodayString();

    if (!isValidDate(dueDate)) {
        showNotification('Informe uma data válida.', 'error');
        elements.quickTaskDate?.focus();
        return;
    }

    const created = createTask({
        title,
        description: '',
        category: elements.quickTaskCategory?.value || 'pessoal',
        priority: normalizePriority(
            elements.quickTaskPriority?.value || 'medium'
        ),
        status: 'pending',
        dueDate,
        dueTime: elements.quickTaskTime?.value || '',
        type: 'single',
        estimatedTime: '',
        notes: ''
    });

    if (!created) {
        showNotification('Não foi possível criar a tarefa.', 'error');
        return;
    }

    elements.quickTaskForm?.reset();
    updateAll();

    showNotification('Tarefa adicionada.', 'success');
}

/* =========================================================
   13. EDIÇÃO
   ========================================================= */

function editTask(taskId) {
    const task = findTask(taskId);

    if (!task || !elements.newTaskForm) return;

    editingTaskId = task.id;

    if (elements.taskTitle) elements.taskTitle.value = task.title;
    if (elements.taskDescription) {
        elements.taskDescription.value = task.description || '';
    }
    if (elements.taskCategory) elements.taskCategory.value = task.category;
    if (elements.taskPriority) elements.taskPriority.value = task.priority;
    if (elements.taskStatus) elements.taskStatus.value = task.status;
    if (elements.taskDueDate) elements.taskDueDate.value = task.dueDate;
    if (elements.taskDueTime) elements.taskDueTime.value = task.dueTime || '';
    if (elements.taskType) elements.taskType.value = task.type || 'single';

    if (elements.taskEstimatedTime) {
        elements.taskEstimatedTime.value = task.estimatedTime || '';
    }

    if (elements.taskNotes) {
        elements.taskNotes.value = task.notes || '';
    }

    updateFormMode();
    openTaskModal();

    setTimeout(() => elements.taskTitle?.focus(), 100);
}

/* =========================================================
   14. EXCLUSÃO
   ========================================================= */

function deleteTask(taskId) {
    const task = findTask(taskId);

    if (!task) return false;

    const confirmed = window.confirm(
        `Deseja excluir a tarefa "${task.title}"?`
    );

    if (!confirmed) return false;

    return deleteTaskById(taskId);
}

function deleteTaskById(taskId) {
    const previousTasks = tasks;
    const exists = tasks.some(task =>
        String(task.id) === String(taskId)
    );

    if (!exists) return false;

    tasks = tasks.filter(task =>
        String(task.id) !== String(taskId)
    );

    if (!saveTasks()) {
        tasks = previousTasks;
        updateAll();
        return false;
    }

    // Remover atividade correspondente no Planejamento se existir
    try {
        const planRaw = localStorage.getItem('painel_planejamento_v1');
        if (planRaw) {
            let activities = JSON.parse(planRaw);
            if (Array.isArray(activities)) {
                activities = activities.filter(a => String(a.linkedId) !== String(taskId));
                localStorage.setItem('painel_planejamento_v1', JSON.stringify(activities));
                window.dispatchEvent(new CustomEvent('planning:updated', {
                    detail: { source: 'tasks', key: 'painel_planejamento_v1' }
                }));
            }
        }
    } catch (e) {
        console.error('Erro ao excluir atividade vinculada no planejamento:', e);
    }

    updateAll();
    showNotification('Tarefa excluída.', 'success');

    return true;
}

/* =========================================================
   15. MÉTRICAS
   ========================================================= */

function updateOverview() {
    const total = tasks.length;

    const pending = tasks.filter(task =>
        ['pending', 'in-progress'].includes(task.status)
    ).length;

    const today = tasks.filter(task =>
        task.dueDate === getTodayString() &&
        !['completed', 'cancelled'].includes(task.status)
    ).length;

    const overdue = tasks.filter(task =>
        task.status === 'overdue'
    ).length;

    const completed = tasks.filter(task =>
        task.status === 'completed'
    ).length;

    [total, pending, today, overdue, completed].forEach(
        (value, index) => {
            const card = elements.overviewCards[index];
            const target = card?.querySelector(
                '.overview-card-value strong'
            );

            if (target) target.textContent = String(value);
        }
    );
}

function updateProgress() {
    const total = tasks.length;

    const completed = tasks.filter(task =>
        task.status === 'completed'
    ).length;

    const percentage = total
        ? Math.round((completed / total) * 100)
        : 0;

    if (elements.productivityPercentage) {
        elements.productivityPercentage.textContent = `${percentage}%`;
    }

    if (elements.progressValue) {
        elements.progressValue.style.width = `${percentage}%`;
    }

    if (elements.progressBar) {
        elements.progressBar.setAttribute(
            'aria-valuenow',
            String(percentage)
        );
    }

    if (elements.progressDescription) {
        elements.progressDescription.textContent =
            `${completed} de ${total} tarefas foram concluídas.`;
    }
}

function updateCategories() {
    if (!elements.categoryList) return;

    const categories = [
        'academico',
        'pessoal',
        'projeto',
        'exercicios',
        'organização'
    ];

    categories.forEach(category => {
        const count = tasks.filter(task =>
            task.category === category
        ).length;

        const button = elements.categoryList.querySelector(
            `[data-category="${escapeAttribute(category)}"]`
        );

        const countElement = button?.querySelector('.category-count');

        if (countElement) {
            countElement.textContent = String(count);
        }
    });
}

function updateDistribution() {
    if (!elements.distributionList) return;

    const categories = [
        'academico',
        'pessoal',
        'projeto',
        'exercicios',
        'organização'
    ];

    const total = tasks.length;

    elements.distributionList
        .querySelectorAll('.distribution-item')
        .forEach((item, index) => {
            const category = categories[index];

            if (!category) return;

            const count = tasks.filter(task =>
                task.category === category
            ).length;

            const percentage = total
                ? Math.round((count / total) * 100)
                : 0;

            const value = item.querySelector('dd');

            if (value) {
                value.textContent = `${percentage}%`;
            }
        });
}

function updateTaskCounts(importantTasks, todayTasks, completedTasks) {
    if (elements.counts.important) {
        elements.counts.important.textContent =
            `${importantTasks.length} ${
                importantTasks.length === 1 ? 'tarefa' : 'tarefas'
            }`;
    }

    if (elements.counts.today) {
        elements.counts.today.textContent =
            `${todayTasks.length} ${
                todayTasks.length === 1 ? 'tarefa' : 'tarefas'
            }`;
    }

    if (elements.counts.completed) {
        elements.counts.completed.textContent =
            `${completedTasks.length} ${
                completedTasks.length === 1 ? 'concluída' : 'concluídas'
            }`;
    }
}

/* =========================================================
   16. UTILITÁRIOS
   ========================================================= */

function findTask(taskId) {
    if (taskId == null) return null;

    return tasks.find(task =>
        String(task.id) === String(taskId)
    ) || null;
}

function determineCurrentStatus(task) {
    if (task.status === 'in-progress') {
        return 'in-progress';
    }

    if (task.dueDate && task.dueDate < getTodayString()) {
        return 'overdue';
    }

    return 'pending';
}

function sortTasks(a, b) {
    const statusOrder = {
        overdue: 0,
        'in-progress': 1,
        pending: 2,
        completed: 3,
        cancelled: 4
    };

    const priorityOrder = {
        high: 0,
        medium: 1,
        low: 2
    };

    const statusDifference =
        (statusOrder[a.status] ?? 9) -
        (statusOrder[b.status] ?? 9);

    if (statusDifference) return statusDifference;

    const priorityDifference =
        (priorityOrder[a.priority] ?? 9) -
        (priorityOrder[b.priority] ?? 9);

    if (priorityDifference) return priorityDifference;

    const dateA =
        `${a.dueDate || '9999-12-31'} ${a.dueTime || '23:59'}`;

    const dateB =
        `${b.dueDate || '9999-12-31'} ${b.dueTime || '23:59'}`;

    return dateA.localeCompare(dateB);
}

function formatTaskDate(task) {
    if (!task.dueDate || !isValidDate(task.dueDate)) {
        return 'Sem prazo';
    }

    const today = getTodayString();
    const tomorrow = addDays(today, 1);
    const date = parseLocalDate(task.dueDate);

    if (task.status === 'overdue') {
        return `Atrasada · ${date.toLocaleDateString('pt-BR', {
            day: 'numeric',
            month: 'long'
        })}`;
    }

    if (task.dueDate === today) {
        return task.dueTime ? `Hoje, ${task.dueTime}` : 'Hoje';
    }

    if (task.dueDate === tomorrow) {
        return task.dueTime ? `Amanhã, ${task.dueTime}` : 'Amanhã';
    }

    const formattedDate = date.toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'long'
    });

    return task.dueTime
        ? `${formattedDate}, ${task.dueTime}`
        : formattedDate;
}

function getCategoryLabel(category) {
    const key = String(category || '')
        .trim()
        .toLowerCase();

    return CATEGORY_LABELS[key] ||
        String(category || 'Sem categoria');
}

function getPriorityLabel(priority) {
    const labels = {
        high: 'Alta',
        medium: 'Média',
        low: 'Baixa'
    };

    return labels[priority] || 'Média';
}

function getStatusLabel(status) {
    const labels = {
        pending: 'Pendente',
        'in-progress': 'Em andamento',
        completed: 'Concluída',
        overdue: 'Atrasada',
        cancelled: 'Cancelada'
    };

    return labels[status] || 'Pendente';
}

/* =========================================================
   17. NOTIFICAÇÕES E ATALHOS
   ========================================================= */

function showNotification(message, type = 'success') {
    let container = document.querySelector('.notification-container');

    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';

        Object.assign(container.style, {
            position: 'fixed',
            right: '24px',
            bottom: '24px',
            zIndex: '9999',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        });

        document.body.appendChild(container);
    }

    const notification = document.createElement('div');

    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    Object.assign(notification.style, {
        padding: '12px 16px',
        background: '#151917',
        border: '1px solid #303632',
        borderRadius: '8px',
        color: type === 'error' ? '#d66a6a' : '#27de80',
        fontSize: '14px',
        boxShadow: '0 8px 24px rgba(0,0,0,.25)',
        opacity: '0',
        transform: 'translateY(8px)',
        transition: 'opacity .18s ease, transform .18s ease'
    });

    container.appendChild(notification);

    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(8px)';

        setTimeout(() => notification.remove(), 200);
    }, 2500);
}

function handleKeyboardShortcuts(event) {
    const target = event.target;

    const isTyping = target instanceof Element &&
        target.matches(
            'input, textarea, select, [contenteditable="true"]'
        );

    if (
        event.ctrlKey &&
        event.key.toLowerCase() === 'k'
    ) {
        event.preventDefault();
        elements.taskSearch?.focus();
    }

    if (
        event.ctrlKey &&
        event.key.toLowerCase() === 'n' &&
        !event.repeat
    ) {
        event.preventDefault();
        openNewTaskForm();
    }

    if (
        event.key === 'Escape' &&
        elements.taskModal &&
        !elements.taskModal.hidden
    ) {
        closeTaskModal();
    }
}

function escapeHTML(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
    return escapeHTML(value);
}

/* =========================================================
   18. API PÚBLICA PARA OUTROS MÓDULOS
   ========================================================= */

window.TaskManager = {
    getTasks() {
        return tasks.map(task => ({ ...task }));
    },

    getTask(taskId) {
        const task = findTask(taskId);

        return task ? { ...task } : null;
    },

    addTask(taskData) {
        const created = createTask(taskData);

        if (created) {
            updateAll();
        }

        return created ? { ...created } : null;
    },

    updateTask(taskId, changes = {}) {
        const task = findTask(taskId);

        if (!task || !changes || typeof changes !== 'object') {
            return false;
        }

        const previous = { ...task };

        const allowedFields = [
            'title',
            'description',
            'category',
            'priority',
            'status',
            'dueDate',
            'dueTime',
            'type',
            'estimatedTime',
            'notes',
            'important',
            'completedAt'
        ];

        allowedFields.forEach(key => {
            if (Object.prototype.hasOwnProperty.call(changes, key)) {
                task[key] = changes[key];
            }
        });

        const normalized = normalizeTaskRecord(task);
        Object.assign(task, normalized);

        if (!task.title) {
            Object.assign(task, previous);
            return false;
        }

        if (!saveTasks()) {
            Object.assign(task, previous);
            return false;
        }

        // Sincronizar edição com o Planejamento (Título, Descrição, Categoria, Data e Prioridade)
        try {
            const planRaw = localStorage.getItem('painel_planejamento_v1');
            if (planRaw) {
                let activities = JSON.parse(planRaw);
                if (Array.isArray(activities)) {
                    let planChanged = false;
                    activities.forEach(a => {
                        if (a.linkedType === 'task' && String(a.linkedId) === String(taskId)) {
                            if (task.title !== undefined && task.title !== a.title) { a.title = task.title; planChanged = true; }
                            if (task.description !== undefined && task.description !== a.description) { a.description = task.description; planChanged = true; }
                            if (task.category !== undefined && task.category !== a.category) { a.category = task.category; planChanged = true; }
                            if (task.dueDate !== undefined && task.dueDate !== a.date) { a.date = task.dueDate; planChanged = true; }
                            if (task.priority !== undefined && task.priority !== a.priority) { a.priority = task.priority; planChanged = true; }
                        }
                    });
                    if (planChanged) {
                        localStorage.setItem('painel_planejamento_v1', JSON.stringify(activities));
                        window.dispatchEvent(new CustomEvent('planning:updated', {
                            detail: { source: 'tasks', key: 'painel_planejamento_v1' }
                        }));
                    }
                }
            }
        } catch (e) {
            console.error('Erro ao sincronizar edição com o planejamento:', e);
        }

        updateAll();

        return true;
    },

    completeTask(taskId) {
        return this.updateTask(taskId, {
            status: 'completed',
            completedAt: getTodayString()
        });
    },

    deleteTask(taskId, options = {}) {
        /*
         * Chamadas pelo código da interface mantêm a confirmação.
         * Outros módulos podem passar { confirm: false }.
         */
        if (options.confirm !== false) {
            return deleteTask(taskId);
        }

        return deleteTaskById(taskId);
    },

    editTask,

    refresh() {
        /*
         * Recarrega o estado persistido mesmo que o valor local
         * já tenha sido visto anteriormente.
         */
        reloadTasksFromStorage(true);
        return this.getTasks();
    },

    clearFilters
};