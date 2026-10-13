'use strict';

document.addEventListener('DOMContentLoaded', () => {
    PlanningApp.init();
});

const PlanningApp = {
    STORAGE_KEYS: {
        ACTIVITIES: 'painel_planejamento_v1',
        HISTORY: 'painel_planejamento_historico_v1',
        TASKS: 'painel_tarefas_v1',
        STUDIES: 'app_estudos_data',
        HABITS: 'habitos',
        HABIT_RECORDS: 'habitos_registros',
        GOALS: 'metas',
        STEPS: 'metas_etapas'
    },

    state: {
        activities: [],
        history: [],
        externalEntities: {
            tasks: [],
            studies: [],
            habits: [],
            goals: []
        },
        currentDate: '',
        currentView: 'day',
        filters: {
            search: '',
            category: 'all',
            status: 'all'
        }
    },

    init() {
        this.state.currentDate = this.getLocalDateString();
        this.loadData();
        this.loadExternalEntities();
        this.setupDateDisplay();
        this.bindEvents();
        this.renderAll();
        this.setupCrossTabSync();
    },

    /* =========================================================
       1. PERSISTÊNCIA E CARREGAMENTO DE DADOS
       ========================================================= */

    getLocalDateString(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    },

    loadData() {
        try {
            const rawActivities = localStorage.getItem(
                this.STORAGE_KEYS.ACTIVITIES
            );

            const rawHistory = localStorage.getItem(
                this.STORAGE_KEYS.HISTORY
            );

            this.state.activities = rawActivities
                ? JSON.parse(rawActivities)
                : [];

            this.state.history = rawHistory
                ? JSON.parse(rawHistory)
                : [];

            if (!Array.isArray(this.state.activities)) {
                this.state.activities = [];
            }

            if (!Array.isArray(this.state.history)) {
                this.state.history = [];
            }
        } catch (error) {
            console.error(
                'Erro ao carregar dados de planejamento:',
                error
            );

            this.state.activities = [];
            this.state.history = [];
        }
    },

    loadExternalEntities() {
        try {
            const tasksRaw = localStorage.getItem(
                this.STORAGE_KEYS.TASKS
            );

            const parsedTasks = tasksRaw
                ? JSON.parse(tasksRaw)
                : [];

            this.state.externalEntities.tasks = Array.isArray(parsedTasks)
                ? parsedTasks
                : Array.isArray(parsedTasks?.items)
                    ? parsedTasks.items
                    : Array.isArray(parsedTasks?.tasks)
                        ? parsedTasks.tasks
                        : [];

            const studiesRaw = localStorage.getItem(
                this.STORAGE_KEYS.STUDIES
            );

            if (studiesRaw) {
                const studyData = JSON.parse(studiesRaw);

                this.state.externalEntities.studies =
                    Array.isArray(studyData.contents)
                        ? studyData.contents
                        : [];
            } else {
                this.state.externalEntities.studies = [];
            }

            const habitsRaw = localStorage.getItem(
                this.STORAGE_KEYS.HABITS
            );

            const parsedHabits = habitsRaw
                ? JSON.parse(habitsRaw)
                : [];

            this.state.externalEntities.habits =
                Array.isArray(parsedHabits) ? parsedHabits : [];

            const goalsRaw = localStorage.getItem(
                this.STORAGE_KEYS.GOALS
            );

            const parsedGoals = goalsRaw
                ? JSON.parse(goalsRaw)
                : [];

            this.state.externalEntities.goals =
                Array.isArray(parsedGoals) ? parsedGoals : [];
        } catch (error) {
            console.error(
                'Erro ao carregar entidades externas para o Planejamento:',
                error
            );
        }
    },

    saveActivities() {
        localStorage.setItem(
            this.STORAGE_KEYS.ACTIVITIES,
            JSON.stringify(this.state.activities)
        );
    },

    saveHistory() {
        localStorage.setItem(
            this.STORAGE_KEYS.HISTORY,
            JSON.stringify(this.state.history)
        );
    },

    addHistoryRecord(activityId, type, note) {
        const record = {
            id: 'hist_' + Date.now() + '_' +
                Math.random().toString(36).substr(2, 4),
            activityId,
            type,
            date: this.getLocalDateString(),
            note,
            createdAt: new Date().toISOString()
        };

        this.state.history.push(record);
        this.saveHistory();
    },

    getTodayDateString() {
        return this.state.currentDate;
    },

    /* =========================================================
       2. REGRAS DE NEGÓCIO E CÁLCULOS
       ========================================================= */

    getFilteredActivitiesForPeriod() {
        const dateObj = new Date(
            this.state.currentDate + 'T00:00:00'
        );

        if (this.state.currentView === 'day') {
            return this.state.activities.filter(
                activity => activity.date === this.state.currentDate
            );
        }

        const startOfWeek = new Date(dateObj);
        const day = startOfWeek.getDay();

        startOfWeek.setDate(startOfWeek.getDate() - day);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);

        const startStr = this.getLocalDateString(startOfWeek);
        const endStr = this.getLocalDateString(endOfWeek);

        return this.state.activities.filter(
            activity =>
                activity.date >= startStr &&
                activity.date <= endStr
        );
    },

    calculateOverviewMetrics() {
        const periodActivities = this.getFilteredActivitiesForPeriod();

        const totalPlanned = periodActivities.length;

        const totalCompleted = periodActivities.filter(
            activity => activity.status === 'completed'
        ).length;

        let plannedMinutes = 0;
        let realMinutes = 0;

        periodActivities.forEach(activity => {
            if (activity.status !== 'cancelled') {
                plannedMinutes += parseInt(activity.duration || 0, 10);

                if (
                    activity.realDuration !== undefined &&
                    activity.realDuration !== null
                ) {
                    realMinutes += parseInt(
                        activity.realDuration || 0,
                        10
                    );
                }
            }
        });

        const executionRate = totalPlanned > 0
            ? Math.round((totalCompleted / totalPlanned) * 100)
            : 0;

        return {
            totalPlanned,
            totalCompleted,
            plannedMinutes,
            realMinutes,
            executionRate
        };
    },

    formatMinutesToHours(minutes) {
        const hrs = Math.floor(minutes / 60);
        const mins = minutes % 60;

        return `${hrs}h ${String(mins).padStart(2, '0')}m`;
    },

    checkTimeOverlap(date, startTime, endTime, excludeId = null) {
        if (!startTime || !endTime) {
            return false;
        }

        const periodActivities = this.state.activities.filter(
            activity =>
                activity.date === date &&
                activity.id !== excludeId &&
                activity.status !== 'cancelled'
        );

        for (const activity of periodActivities) {
            if (!activity.startTime || !activity.endTime) {
                continue;
            }

            if (
                startTime < activity.endTime &&
                endTime > activity.startTime
            ) {
                return true;
            }
        }

        return false;
    },

    saveActivityFromModal(formData) {
        const { id, title, description, category, priority, date, duration, startTime, endTime, notes, linkedType, linkedId } = formData;

        if (!title.trim() || !category.trim() || !date) {
            this.showToast('Preencha os campos obrigatórios (*).');
            return;
        }

        let finalLinkedId = linkedId;

        if (linkedType === 'task' && (finalLinkedId === 'NEW_TASK' || (!finalLinkedId && title.trim()))) {
            try {
                const tasksRaw = localStorage.getItem(this.STORAGE_KEYS.TASKS);
                let storedTasks = tasksRaw ? JSON.parse(tasksRaw) : [];
                
                let taskList = Array.isArray(storedTasks)
                    ? storedTasks
                    : Array.isArray(storedTasks?.items)
                        ? storedTasks.items
                        : Array.isArray(storedTasks?.tasks)
                            ? storedTasks.tasks
                            : [];

                const newTask = {
                    id: 'task_' + Date.now(),
                    title: title.trim(),
                    description: description.trim(),
                    category: category.toLowerCase() === 'tarefa' ? 'pessoal' : (category.toLowerCase() || 'pessoal'),
                    priority: priority || 'medium',
                    dueDate: date,
                    status: 'pending',
                    createdAt: new Date().toISOString()
                };

                taskList.push(newTask);

                if (Array.isArray(storedTasks)) {
                    storedTasks = taskList;
                } else if (storedTasks?.items) {
                    storedTasks.items = taskList;
                } else if (storedTasks?.tasks) {
                    storedTasks.tasks = taskList;
                } else {
                    storedTasks = taskList;
                }

                localStorage.setItem(this.STORAGE_KEYS.TASKS, JSON.stringify(storedTasks));

                window.dispatchEvent(new CustomEvent('tasks:updated', {
                    detail: { source: 'planning', taskId: newTask.id }
                }));

                finalLinkedId = newTask.id;
            } catch (e) {
                console.error('Erro ao criar tarefa automática a partir do planejamento:', e);
            }
        }

        if (id) {
            const activity = this.state.activities.find(a => a.id === id);
            if (activity) {
                if (activity.linkedType === 'task' && activity.linkedId) {
                    this.updateOriginTaskData(activity.linkedId, {
                        title: title.trim(),
                        description: description.trim(),
                        category,
                        priority,
                        dueDate: date
                    });
                }

                activity.title = title.trim();
                activity.description = description.trim();
                activity.category = category;
                activity.priority = priority;
                activity.date = date;
                activity.duration = parseInt(duration, 10) || 30;
                activity.startTime = startTime || '';
                activity.endTime = endTime || '';
                activity.notes = notes.trim();
                activity.linkedType = linkedType || '';
                activity.linkedId = finalLinkedId === 'NEW_TASK' ? '' : (finalLinkedId || '');
                activity.updatedAt = new Date().toISOString();

                this.saveActivities();
                this.addHistoryRecord(id, 'updated', `Atividade "${activity.title}" atualizada.`);
                this.closeModal('activity-modal');
                this.renderAll();
                this.showToast('Atividade e tarefa atualizadas com sucesso!');
            }
        } else {
            const newId = 'act_' + Date.now();
            const newActivity = {
                id: newId,
                title: title.trim(),
                description: description.trim(),
                category,
                priority,
                date,
                duration: parseInt(duration, 10) || 30,
                startTime: startTime || '',
                endTime: endTime || '',
                notes: notes.trim(),
                status: 'planned',
                realDuration: null,
                realEndTime: '',
                executionObservation: '',
                linkedType: linkedType || '',
                linkedId: finalLinkedId === 'NEW_TASK' ? '' : (finalLinkedId || ''),
                lastSyncedVersion: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            this.state.activities.push(newActivity);
            this.saveActivities();
            this.addHistoryRecord(newId, 'created', `Atividade planejada para ${date}.`);
            this.closeModal('activity-modal');
            this.renderAll();
            this.showToast('Atividade criada e enviada para o módulo de Tarefas!');
        }
    },

    updateOriginTaskData(taskId, updatedFields) {
        try {
            const tasksRaw = localStorage.getItem(this.STORAGE_KEYS.TASKS);
            if (!tasksRaw) return;
            const storedTasks = JSON.parse(tasksRaw);
            let tasks = Array.isArray(storedTasks)
                ? storedTasks
                : Array.isArray(storedTasks?.items)
                    ? storedTasks.items
                    : Array.isArray(storedTasks?.tasks)
                        ? storedTasks.tasks
                        : [];

            const task = tasks.find(t => String(t.id) === String(taskId));
            if (task) {
                task.title = updatedFields.title;
                task.description = updatedFields.description;
                task.category = updatedFields.category;
                task.priority = updatedFields.priority;
                task.dueDate = updatedFields.dueDate;

                localStorage.setItem(this.STORAGE_KEYS.TASKS, JSON.stringify(storedTasks));
                window.dispatchEvent(new CustomEvent('tasks:updated', {
                    detail: { source: 'planning', taskId: String(taskId) }
                }));
            }
        } catch (e) {
            console.error('Erro ao atualizar tarefa de origem:', e);
        }
    },

    deleteActivity(activityId) {
        if (!confirm('Tem certeza de que deseja excluir permanentemente esta atividade?')) return;

        const activity = this.state.activities.find(a => a.id === activityId);
        
        if (activity && activity.linkedType === 'task' && activity.linkedId) {
            try {
                const tasksRaw = localStorage.getItem(this.STORAGE_KEYS.TASKS);
                if (tasksRaw) {
                    let storedTasks = JSON.parse(tasksRaw);
                    let tasksList = Array.isArray(storedTasks)
                        ? storedTasks
                        : Array.isArray(storedTasks?.items)
                            ? storedTasks.items
                            : Array.isArray(storedTasks?.tasks)
                                ? storedTasks.tasks
                                : [];

                    tasksList = tasksList.filter(t => String(t.id) !== String(activity.linkedId));

                    if (Array.isArray(storedTasks)) {
                        storedTasks = tasksList;
                    } else if (storedTasks?.items) {
                        storedTasks.items = tasksList;
                    } else if (storedTasks?.tasks) {
                        storedTasks.tasks = tasksList;
                    }

                    localStorage.setItem(this.STORAGE_KEYS.TASKS, JSON.stringify(storedTasks));
                    window.dispatchEvent(new CustomEvent('tasks:updated', {
                        detail: { source: 'planning', taskId: activity.linkedId }
                    }));
                }
            } catch (e) {
                console.error('Erro ao excluir tarefa associada no módulo Tarefas:', e);
            }
        }

        this.state.activities = this.state.activities.filter(a => a.id !== activityId);
        this.saveActivities();
        this.renderAll();
        this.showToast('Atividade excluída.');
    },

    syncPlanningFromTasks() {
        this.loadExternalEntities();

        const tasks = this.state.externalEntities.tasks;
        if (!Array.isArray(tasks) || !Array.isArray(this.state.activities)) return;

        let changed = false;
        const now = new Date().toISOString();
        const today = this.getLocalDateString();

        this.state.activities.forEach(activity => {
            const linkedType = String(activity.linkedType || '').toLowerCase();
            if (linkedType !== 'task' || !activity.linkedId) return;

            const task = tasks.find(
                item => String(item.id) === String(activity.linkedId)
            );

            if (!task) {
                activity.linkedType = '';
                activity.linkedId = '';
                changed = true;
                return;
            }

            // Sincronizar rigorosamente o Título, Data e Prioridade de forma bidirecional
            if (task.title && task.title !== activity.title) {
                activity.title = task.title;
                changed = true;
            }
            if (task.dueDate && task.dueDate !== activity.date) {
                activity.date = task.dueDate;
                changed = true;
            }
            if (task.priority && task.priority !== activity.priority) {
                activity.priority = task.priority;
                changed = true;
            }

            const taskStatus = String(task.status || '').toLowerCase();
            const isTaskCompleted = taskStatus === 'completed' || taskStatus === 'done';

            if (isTaskCompleted && activity.status !== 'completed') {
                activity.status = 'completed';
                activity.completedAt = task.completedAt || today;
                activity.updatedAt = now;
                changed = true;
            } else if (!isTaskCompleted && activity.status === 'completed') {
                activity.status = 'planned';
                activity.completedAt = null;
                activity.updatedAt = now;
                changed = true;
            }
        });

        if (changed) {
            this.saveActivities();
        }

        this.renderAll();
    },

    updateActivityStatus(activityId, newStatus) {
        const activity = this.state.activities.find(a => a.id === activityId);
        if (!activity) return;

        activity.status = newStatus;
        activity.updatedAt = new Date().toISOString();
        this.saveActivities();
        this.addHistoryRecord(activityId, newStatus, `Status alterado para: ${newStatus}`);

        if (activity.linkedType && activity.linkedId) {
            this.syncWithOriginModule(activity, newStatus, activity.duration, {});
        }

        this.renderAll();
        this.showToast(`Atividade atualizada para ${newStatus}.`);
    },

    saveExecutionResult(formData) {
        const { activityId, status, realDuration, realEndTime, observation, realQuestions, realCorrect, realGoalValue } = formData;
        const activity = this.state.activities.find(a => a.id === activityId);
        if (!activity) return;

        const currentVersionKey = `${status}_${realDuration}_${realQuestions}_${realCorrect}_${realGoalValue}_${activity.updatedAt}`;

        activity.status = status;
        activity.realDuration = realDuration ? parseInt(realDuration, 10) : activity.duration;
        activity.realEndTime = realEndTime || '';
        activity.executionObservation = observation.trim();
        activity.updatedAt = new Date().toISOString();

        this.saveActivities();
        this.addHistoryRecord(activityId, status, `Resultado registrado: ${status}.`);

        if (activity.linkedType && activity.linkedId && activity.lastSyncedVersion !== currentVersionKey) {
            this.syncWithOriginModule(activity, status, realDuration, { realQuestions, realCorrect, realGoalValue });
            activity.lastSyncedVersion = currentVersionKey;
            this.saveActivities();
        }

        this.closeModal('execution-modal');
        this.renderAll();
        this.showToast('Resultado registrado e sincronizado com sucesso!');
    },

    syncWithOriginModule(activity, status, realDuration, extraData) {
        const { linkedType, linkedId, date } = activity;

        if (linkedType === 'task' && (status === 'completed' || status === 'partial')) {
            try {
                const tasksRaw = localStorage.getItem(this.STORAGE_KEYS.TASKS);
                if (tasksRaw) {
                    const storedTasks = JSON.parse(tasksRaw);
                    const tasks = Array.isArray(storedTasks)
                        ? storedTasks
                        : Array.isArray(storedTasks?.items)
                            ? storedTasks.items
                            : Array.isArray(storedTasks?.tasks)
                                ? storedTasks.tasks
                                : [];

                    const task = tasks.find(t => String(t.id) === String(linkedId));
                    if (!task) return;

                    const newStatus = status === 'completed' ? 'completed' : 'in-progress';

                    if (task.status !== newStatus) {
                        task.status = newStatus;
                        task.completedAt = newStatus === 'completed' ? date : null;

                        localStorage.setItem(this.STORAGE_KEYS.TASKS, JSON.stringify(storedTasks));

                        window.dispatchEvent(new CustomEvent('tasks:updated', {
                            detail: {
                                source: 'planning',
                                taskId: String(task.id)
                            }
                        }));
                    }
                }
            } catch (e) {
                console.error('Erro ao sincronizar tarefa:', e);
            }
        }

        if (linkedType === 'habit' && (status === 'completed' || status === 'partial')) {
            try {
                const habitsRaw = localStorage.getItem(this.STORAGE_KEYS.HABITS);
                const habits = habitsRaw ? JSON.parse(habitsRaw) : [];
                const habit = habits.find(h => h.id === linkedId);

                if (!habit) return;

                const targetVal = habit.target || 1;
                const execVal = status === 'completed'
                    ? targetVal
                    : Math.round(targetVal * 0.5);

                const recordsRaw = localStorage.getItem(this.STORAGE_KEYS.HABIT_RECORDS);
                let records = recordsRaw ? JSON.parse(recordsRaw) : [];
                let record = records.find(r => r.habitId === linkedId && r.date === date);

                if (record) {
                    record.value = Math.max(record.value || 0, execVal);
                    record.completed = record.value >= targetVal;
                } else {
                    records.push({
                        id: 'rec_' + Date.now(),
                        habitId: linkedId,
                        date: date,
                        completed: execVal >= targetVal,
                        value: execVal,
                        notes: activity.executionObservation || 'Concluído via Planejamento',
                        createdAt: new Date().toISOString()
                    });
                }

                localStorage.setItem(this.STORAGE_KEYS.HABIT_RECORDS, JSON.stringify(records));
            } catch (e) {
                console.error('Erro ao sincronizar hábito:', e);
            }
        }

        if (linkedType === 'study' && (status === 'completed' || status === 'partial')) {
            try {
                const studyRaw = localStorage.getItem(this.STORAGE_KEYS.STUDIES);

                if (studyRaw) {
                    let studyData = JSON.parse(studyRaw);
                    let content = studyData.contents.find(c => c.id === linkedId);

                    if (!content) return;

                    const mins = parseInt(realDuration, 10) || activity.duration || 0;
                    const addQuestions = parseInt(extraData.realQuestions, 10) || 0;
                    const addCorrect = parseInt(extraData.realCorrect, 10) || 0;

                    content.totalMinutes = (content.totalMinutes || 0) + mins;
                    content.questions = (content.questions || 0) + addQuestions;
                    content.correct = (content.correct || 0) + addCorrect;
                    content.lastStudied = date;

                    const targetTime = content.targetTime || 60;
                    const targetCorrect = content.targetCorrect || 50;

                    const timeProgress = Math.min(
                        100,
                        Math.round((content.totalMinutes / targetTime) * 100)
                    );

                    const correctProgress = Math.min(
                        100,
                        Math.round((content.correct / targetCorrect) * 100)
                    );

                    content.progress = Math.min(timeProgress, correctProgress);
                    content.status = content.progress >= 100
                        ? 'completed'
                        : (content.progress > 0 ? 'in_progress' : 'not_started');

                    if (!studyData.history) studyData.history = [];

                    studyData.history.unshift({
                        id: 'h_' + Date.now(),
                        contentId: linkedId,
                        subjectId: content.subjectId,
                        type: 'study',
                        durationMinutes: mins,
                        questions: addQuestions,
                        correct: addCorrect,
                        date: date
                    });

                    localStorage.setItem(
                        this.STORAGE_KEYS.STUDIES,
                        JSON.stringify(studyData)
                    );
                }
            } catch (e) {
                console.error('Erro ao sincronizar estudo:', e);
            }
        }

        if (linkedType === 'goal' && (status === 'completed' || status === 'partial')) {
            try {
                const goalsRaw = localStorage.getItem(this.STORAGE_KEYS.GOALS);

                if (goalsRaw) {
                    let goals = JSON.parse(goalsRaw);
                    let goal = goals.find(g => g.id === linkedId);

                    if (!goal) return;

                    if (goal.status !== 'completed') {
                        if (goal.trackingType === 'manual') {
                            goal.progress = status === 'completed'
                                ? 100
                                : Math.min(100, (goal.progress || 0) + 25);

                            if (goal.progress >= 100) goal.status = 'completed';

                        } else if (goal.trackingType === 'quantitative') {
                            const valReal = parseFloat(extraData.realGoalValue);
                            const increment = !isNaN(valReal)
                                ? valReal
                                : (status === 'completed' ? (goal.targetValue || 100) : 0);

                            goal.currentValue = (goal.currentValue || 0) + increment;

                            if (goal.currentValue >= goal.targetValue) {
                                goal.currentValue = goal.targetValue;
                                goal.status = 'completed';
                                goal.completedAt = new Date().toISOString();
                            }

                        } else if (goal.trackingType === 'steps') {
                            const stepsRaw = localStorage.getItem(this.STORAGE_KEYS.STEPS);
                            let steps = stepsRaw ? JSON.parse(stepsRaw) : [];

                            let goalSteps = steps.filter(
                                s => s.goalId === linkedId && s.status !== 'completed'
                            );

                            if (goalSteps.length > 0) {
                                goalSteps[0].status = 'completed';
                                goalSteps[0].completedAt = new Date().toISOString();

                                localStorage.setItem(
                                    this.STORAGE_KEYS.STEPS,
                                    JSON.stringify(steps)
                                );

                                const allDone = steps
                                    .filter(s => s.goalId === linkedId)
                                    .every(s => s.status === 'completed');

                                if (allDone) {
                                    goal.status = 'completed';
                                    goal.completedAt = new Date().toISOString();
                                }
                            }
                        }

                        localStorage.setItem(
                            this.STORAGE_KEYS.GOALS,
                            JSON.stringify(goals)
                        );
                    }
                }
            } catch (e) {
                console.error('Erro ao sincronizar meta:', e);
            }
        }
    },

    rescheduleActivity(formData) {
        const { activityId, newDate, newTime, reason } = formData;
        const activity = this.state.activities.find(a => a.id === activityId);

        if (!activity || !newDate) return;

        activity.date = newDate;

        if (newTime) {
            activity.startTime = newTime;

            if (activity.duration) {
                const [hrs, mins] = newTime.split(':').map(Number);
                const totalMins = hrs * 60 + mins + parseInt(activity.duration, 10);
                const endHrs = Math.floor(totalMins / 60) % 24;
                const endMins = totalMins % 60;

                activity.endTime =
                    `${String(endHrs).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
            }
        }

        activity.status = 'rescheduled';
        activity.updatedAt = new Date().toISOString();

        this.saveActivities();
        this.addHistoryRecord(
            activityId,
            'rescheduled',
            `Remarcada para ${newDate}. Motivo: ${reason || 'Não informado'}`
        );

        this.closeModal('reschedule-modal');
        this.renderAll();
        this.showToast('Atividade remarcada com sucesso!');
    },

    renderAll() {
        this.loadExternalEntities();
        this.setupDateDisplay();
        this.renderTemporalHeader();
        this.renderOverview();
        this.renderAgenda();
        this.renderExecutionList();
        this.renderUntimedList();
        this.renderHistory();
    },

    setupDateDisplay() {
        const dateElement = document.getElementById('header-date');
        const now = new Date();

        const options = {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        };

        if (dateElement) {
            dateElement.textContent = now.toLocaleDateString('pt-BR', options);
        }
    },

    renderTemporalHeader() {
        const label = document.getElementById('current-period-label');
        if (!label) return;

        const dateObj = new Date(this.state.currentDate + 'T00:00:00');

        if (this.state.currentView === 'day') {
            label.textContent = dateObj.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        } else {
            const startOfWeek = new Date(dateObj);
            startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);

            label.textContent =
                `${startOfWeek.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} — ${endOfWeek.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
    },

    renderOverview() {
        const metrics = this.calculateOverviewMetrics();

        this.setDOMText('[data-plan-stat="totalPlanned"]', metrics.totalPlanned);
        this.setDOMText('[data-plan-stat="totalCompleted"]', metrics.totalCompleted);
        this.setDOMText('[data-plan-stat="plannedMinutes"]', this.formatMinutesToHours(metrics.plannedMinutes));
        this.setDOMText('[data-plan-stat="realMinutes"]', this.formatMinutesToHours(metrics.realMinutes));
        this.setDOMText('[data-plan-stat="executionRate"]', `${metrics.executionRate}%`);
    },

    renderAgenda() {
        const container = document.getElementById('agenda-container');
        if (!container) return;

        const periodActivities = this.getFilteredActivitiesForPeriod()
            .filter(a => a.startTime)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        if (periodActivities.length === 0) {
            container.innerHTML =
                `<p class="empty-message">Nenhuma atividade horária agendada para este período.</p>`;
            return;
        }

        container.innerHTML = periodActivities.map(activity => `
            <div class="agenda-slot">
                <div class="agenda-time">${activity.startTime}</div>
                <div class="agenda-slot-content">
                    ${this.buildActivityCardHTML(activity)}
                </div>
            </div>
        `).join('');
    },

    renderExecutionList() {
        const container = document.getElementById('execution-list-container');
        if (!container) return;

        const todayActivities = this.state.activities.filter(
            a => a.date === this.state.currentDate &&
                 a.status !== 'cancelled' &&
                 a.status !== 'completed'
        );

        if (todayActivities.length === 0) {
            container.innerHTML =
                `<p class="empty-message">Nenhuma atividade pendente para hoje.</p>`;
            return;
        }

        container.innerHTML = todayActivities
            .map(activity => this.buildActivityCardHTML(activity))
            .join('');
    },

    renderUntimedList() {
        const container = document.getElementById('untimed-list-container');
        if (!container) return;

        const untimed = this.getFilteredActivitiesForPeriod()
            .filter(a => !a.startTime);

        if (untimed.length === 0) {
            container.innerHTML =
                `<p class="empty-message">Sem atividades sem horário definido.</p>`;
            return;
        }

        container.innerHTML = untimed
            .map(activity => this.buildActivityCardHTML(activity))
            .join('');
    },

    buildActivityCardHTML(activity) {
        const statusMap = {
            planned: 'Planejada',
            'in-progress': 'Em andamento',
            completed: 'Concluída',
            partial: 'Parcial',
            rescheduled: 'Remarcada',
            cancelled: 'Cancelada'
        };

        const linkedBadge = activity.linkedType
            ? `<span style="font-size: 0.68rem; background: rgba(59, 130, 246, 0.15); color: #60A5FA; padding: 0.1rem 0.35rem; border-radius: 4px; text-transform: uppercase;">🔗 ${activity.linkedType}</span>`
            : '';

        return `
            <article class="activity-card status-${activity.status}">
                <div class="activity-card-header">
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <span class="activity-category-badge">${this.escapeHTML(activity.category)}</span>
                        ${linkedBadge}
                    </div>
                    <span style="font-size: 0.72rem; color: var(--color-text-muted);">[${statusMap[activity.status] || activity.status}]</span>
                </div>
                <h4 class="activity-title">${this.escapeHTML(activity.title)}</h4>
                <div class="activity-details">
                    <span>📅 ${activity.date.split('-').reverse().join('/')}</span>
                    <span>⏱️ Planejado: ${activity.duration} min</span>
                    ${activity.realDuration ? `<span>✅ Real: ${activity.realDuration} min</span>` : ''}
                    ${activity.startTime ? `<span>🕒 ${activity.startTime}${activity.endTime ? '- ' + activity.endTime : ''}</span>` : ''}
                </div>
                <div class="activity-actions-row">
                    ${activity.status !== 'completed' ? `<button type="button" class="button button-secondary button-small" data-action="start" data-id="${activity.id}">Iniciar</button>` : ''}
                    ${activity.status !== 'completed' ? `<button type="button" class="button button-primary button-small" data-action="execute" data-id="${activity.id}">Finalizar</button>` : ''}
                    <button type="button" class="button button-secondary button-small" data-action="reschedule" data-id="${activity.id}">Remarcar</button>
                    <button type="button" class="button button-secondary button-small" data-action="edit" data-id="${activity.id}">Editar</button>
                    <button type="button" class="text-button text-danger" data-action="delete" data-id="${activity.id}" style="padding: 0 0.5rem;">Excluir</button>
                </div>
            </article>
        `;
    },

    renderHistory() {
        const container = document.getElementById('planning-history-list');
        const countDisplay = document.getElementById('planning-result-count');
        if (!container) return;

        let filtered = [...this.state.history];

        if (this.state.filters.search) {
            const term = this.state.filters.search.toLowerCase();
            filtered = filtered.filter(h => h.note.toLowerCase().includes(term));
        }

        filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        if (countDisplay) {
            countDisplay.textContent = `${filtered.length} registro(s) de histórico encontrado(s)`;
        }

        if (filtered.length === 0) {
            container.innerHTML =
                `<p class="empty-message">Nenhum registo de auditoria corresponde aos filtros aplicados.</p>`;
            return;
        }

        container.innerHTML = filtered.slice(0, 25).map(item => `
            <div class="history-item">
                <div class="history-item-info">
                    <strong>${this.escapeHTML(item.note)}</strong>
                    <span>Data do registo: ${item.date.split('-').reverse().join('/')}</span>
                </div>
                <span class="history-item-badge">${item.type.toUpperCase()}</span>
            </div>
        `).join('');
    },

    openActivityModal(activityId = null) {
        const modal = document.getElementById('activity-modal');
        const form = document.getElementById('activity-form');
        if (!modal || !form) return;

        form.reset();
        document.getElementById('activity-id').value = '';
        document.getElementById('activity-modal-title').textContent =
            activityId ? 'Editar Atividade' : 'Planejar Atividade';
        document.getElementById('conflict-warning-box').style.display = 'none';

        this.populateLinkDropdowns();

        if (activityId) {
            const act = this.state.activities.find(a => a.id === activityId);

            if (act) {
                document.getElementById('activity-id').value = act.id;
                document.getElementById('activity-title').value = act.title;
                document.getElementById('activity-description').value = act.description || '';
                document.getElementById('activity-category').value = act.category;
                document.getElementById('activity-priority').value = act.priority;
                document.getElementById('activity-date').value = act.date;
                document.getElementById('activity-duration').value = act.duration;
                document.getElementById('activity-start-time').value = act.startTime || '';
                document.getElementById('activity-end-time').value = act.endTime || '';
                document.getElementById('activity-notes').value = act.notes || '';

                const linkTypeSel = document.getElementById('activity-link-type');

                if (linkTypeSel) {
                    linkTypeSel.value = act.linkedType || '';
                    this.updateLinkEntityOptions(act.linkedType, act.linkedId);
                }
            }
        } else {
            document.getElementById('activity-date').value = this.state.currentDate;
            this.updateLinkEntityOptions('', '');
        }

        modal.hidden = false;
    },

    populateLinkDropdowns() {
        const linkTypeSelect = document.getElementById('activity-link-type');
        if (!linkTypeSelect) return;

        linkTypeSelect.innerHTML = `
            <option value="">Nenhum vínculo (Atividade independente)</option>
            <option value="task">Tarefa (Gerenciador de Tarefas)</option>
            <option value="study">Conteúdo de Estudo</option>
            <option value="habit">Hábito</option>
            <option value="goal">Meta</option>
        `;

        linkTypeSelect.onchange = (e) => {
            this.updateLinkEntityOptions(e.target.value, '');
        };
    },

    updateLinkEntityOptions(selectedType, selectedId) {
        let container = document.getElementById('activity-link-entity-container');

        if (!container) {
            const form = document.getElementById('activity-form');
            const targetDiv = form?.querySelector('.field-full');

            if (targetDiv) {
                const wrapper = document.createElement('div');
                wrapper.id = 'activity-link-entity-container';
                wrapper.className = 'field-full';
                wrapper.style.marginTop = '0.75rem';
                targetDiv.after(wrapper);
                container = wrapper;
            } else {
                return;
            }
        }

        if (!selectedType) {
            container.innerHTML = '';
            return;
        }

        let optionsHTML = '<option value="">Selecione o item correspondente...</option>';
        let entities = [];

        if (selectedType === 'task') {
            entities = this.state.externalEntities.tasks.filter(t =>
                t.status !== 'completed' || String(t.id) === String(selectedId)
            );

            optionsHTML += `<option value="NEW_TASK" style="font-weight: bold; color: #60A5FA;" ${selectedId === 'NEW_TASK' ? 'selected' : ''}>+ Criar nova tarefa automática</option>`;

            optionsHTML += entities.map(t =>
                `<option value="${this.escapeHTML(String(t.id))}" ${String(t.id) === String(selectedId) ? 'selected' : ''}>${this.escapeHTML(t.title || 'Tarefa sem título')}</option>`
            ).join('');

        } else if (selectedType === 'study') {
            entities = this.state.externalEntities.studies.filter(s => s.status !== 'completed');

            optionsHTML += entities.map(s =>
                `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${this.escapeHTML(s.name)}</option>`
            ).join('');

        } else if (selectedType === 'habit') {
            entities = this.state.externalEntities.habits.filter(h => h.status === 'active');

            optionsHTML += entities.map(h =>
                `<option value="${h.id}" ${h.id === selectedId ? 'selected' : ''}>${this.escapeHTML(h.name)}</option>`
            ).join('');

        } else if (selectedType === 'goal') {
            entities = this.state.externalEntities.goals.filter(g => g.status === 'active');

            optionsHTML += entities.map(g =>
                `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${this.escapeHTML(g.title)}</option>`
            ).join('');
        }

        container.innerHTML = `
            <label for="activity-link-id">Vincular ${selectedType.toUpperCase()}</label>
            <select id="activity-link-id">
                ${optionsHTML}
            </select>
        `;

        const entitySelect = document.getElementById('activity-link-id');

        if (entitySelect) {
            entitySelect.onchange = (e) => {
                const chosenId = e.target.value;
                if (chosenId === 'NEW_TASK') return;

                const found = entities.find(ent => String(ent.id) === String(chosenId));

                if (found) {
                    const titleInput = document.getElementById('activity-title');

                    if (titleInput && !titleInput.value) {
                        titleInput.value = found.title || found.name || '';
                    }
                }
            };
        }
    },

    openExecutionModal(activityId) {
        const modal = document.getElementById('execution-modal');
        if (!modal) return;

        document.getElementById('exec-activity-id').value = activityId;
        const act = this.state.activities.find(a => a.id === activityId);

        const studyFields = document.getElementById('exec-study-fields');
        const goalFields = document.getElementById('exec-goal-fields');

        if (studyFields) studyFields.style.display = 'none';
        if (goalFields) goalFields.style.display = 'none';

        if (act) {
            document.getElementById('exec-real-duration').value = act.duration;

            if (act.linkedType === 'study' && studyFields) {
                studyFields.style.display = 'block';
                document.getElementById('exec-real-questions').value = '';
                document.getElementById('exec-real-correct').value = '';

            } else if (act.linkedType === 'goal' && goalFields) {
                const goal = this.state.externalEntities.goals.find(
                    g => String(g.id) === String(act.linkedId)
                );

                if (goal && goal.trackingType === 'quantitative') {
                    goalFields.style.display = 'block';
                    document.getElementById('exec-goal-label').textContent =
                        `Valor Real Realizado (Alvo: ${goal.targetValue || 100})`;
                    document.getElementById('exec-real-goal-value').value = '';
                }
            }
        }

        modal.hidden = false;
    },

    openRescheduleModal(activityId) {
        const modal = document.getElementById('reschedule-modal');
        if (!modal) return;

        document.getElementById('resch-activity-id').value = activityId;
        document.getElementById('resch-new-date').value = this.state.currentDate;
        modal.hidden = false;
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.hidden = true;
    },

    setupCrossTabSync() {
        window.addEventListener('storage', (e) => {
            if (e.key === this.STORAGE_KEYS.TASKS) {
                this.loadData();
                this.syncPlanningFromTasks();
                return;
            }

            if ([
                this.STORAGE_KEYS.STUDIES,
                this.STORAGE_KEYS.HABITS,
                this.STORAGE_KEYS.GOALS
            ].includes(e.key)) {
                this.loadExternalEntities();
                this.renderAll();
            }

            if (
                e.key === this.STORAGE_KEYS.ACTIVITIES ||
                e.key === this.STORAGE_KEYS.HISTORY
            ) {
                this.loadData();
                this.renderAll();
            }
        });

        window.addEventListener('tasks:updated', (e) => {
            this.loadData();
            this.loadExternalEntities();
            this.syncPlanningFromTasks();
        });

        window.addEventListener('planning:updated', (e) => {
            this.loadData();
            this.renderAll();
        });
    },
    
    bindEvents() {
        document.addEventListener('click', (e) => {
            const closeModalBtn = e.target.closest('[data-close-modal]');

            if (closeModalBtn) {
                this.closeModal(closeModalBtn.dataset.closeModal);
                return;
            }

            const actionBtn = e.target.closest('[data-action]');

            if (actionBtn) {
                const action = actionBtn.dataset.action;
                const id = actionBtn.dataset.id;

                if (action === 'start') this.updateActivityStatus(id, 'in-progress');
                if (action === 'execute') this.openExecutionModal(id);
                if (action === 'reschedule') this.openRescheduleModal(id);
                if (action === 'edit') this.openActivityModal(id);
                if (action === 'delete') this.deleteActivity(id);

                return;
            }
        });

        document.getElementById('new-activity-button')
            ?.addEventListener('click', () => this.openActivityModal());

        document.getElementById('activity-form')
            ?.addEventListener('submit', (e) => {
                e.preventDefault();

                this.saveActivityFromModal({
                    id: document.getElementById('activity-id').value,
                    title: document.getElementById('activity-title').value,
                    description: document.getElementById('activity-description').value,
                    category: document.getElementById('activity-category').value,
                    priority: document.getElementById('activity-priority').value,
                    date: document.getElementById('activity-date').value,
                    duration: document.getElementById('activity-duration').value,
                    startTime: document.getElementById('activity-start-time').value,
                    endTime: document.getElementById('activity-end-time').value,
                    notes: document.getElementById('activity-notes').value,
                    linkedType: document.getElementById('activity-link-type')?.value || '',
                    linkedId: document.getElementById('activity-link-id')?.value || ''
                });
            });

        const checkConflictInput = () => {
            const date = document.getElementById('activity-date').value;
            const start = document.getElementById('activity-start-time').value;
            const end = document.getElementById('activity-end-time').value;
            const id = document.getElementById('activity-id').value;
            const warningBox = document.getElementById('conflict-warning-box');

            if (date && start && end && warningBox) {
                const hasConflict = this.checkTimeOverlap(date, start, end, id || null);
                warningBox.style.display = hasConflict ? 'block' : 'none';
            } else if (warningBox) {
                warningBox.style.display = 'none';
            }
        };

        document.getElementById('activity-date')
            ?.addEventListener('change', checkConflictInput);

        document.getElementById('activity-start-time')
            ?.addEventListener('change', checkConflictInput);

        document.getElementById('activity-end-time')
            ?.addEventListener('change', checkConflictInput);

        document.getElementById('execution-form')
            ?.addEventListener('submit', (e) => {
                e.preventDefault();

                this.saveExecutionResult({
                    activityId: document.getElementById('exec-activity-id').value,
                    status: document.getElementById('exec-status').value,
                    realDuration: document.getElementById('exec-real-duration').value,
                    realEndTime: document.getElementById('exec-real-end-time').value,
                    observation: document.getElementById('exec-observation').value,
                    realQuestions: document.getElementById('exec-real-questions')?.value || 0,
                    realCorrect: document.getElementById('exec-real-correct')?.value || 0,
                    realGoalValue: document.getElementById('exec-real-goal-value')?.value || 0
                });
            });

        document.getElementById('reschedule-form')
            ?.addEventListener('submit', (e) => {
                e.preventDefault();

                this.rescheduleActivity({
                    activityId: document.getElementById('resch-activity-id').value,
                    newDate: document.getElementById('resch-new-date').value,
                    newTime: document.getElementById('resch-new-time').value,
                    reason: document.getElementById('resch-reason').value
                });
            });

        document.getElementById('today-jump-btn')
            ?.addEventListener('click', () => {
                this.state.currentDate = this.getLocalDateString();
                this.renderAll();
            });

        document.getElementById('prev-period-btn')
            ?.addEventListener('click', () => {
                const d = new Date(this.state.currentDate + 'T00:00:00');
                d.setDate(d.getDate() - (this.state.currentView === 'week' ? 7 : 1));
                this.state.currentDate = this.getLocalDateString(d);
                this.renderAll();
            });

        document.getElementById('next-period-btn')
            ?.addEventListener('click', () => {
                const d = new Date(this.state.currentDate + 'T00:00:00');
                d.setDate(d.getDate() + (this.state.currentView === 'week' ? 7 : 1));
                this.state.currentDate = this.getLocalDateString(d);
                this.renderAll();
            });

        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.state.currentView = e.target.dataset.view;
                this.renderAll();
            });
        });

        document.getElementById('plan-search')
            ?.addEventListener('input', (e) => {
                this.state.filters.search = e.target.value;
                this.renderHistory();
            });

        document.getElementById('clear-plan-filters')
            ?.addEventListener('click', () => {
                this.state.filters = {
                    search: '',
                    category: 'all',
                    status: 'all'
                };

                document.getElementById('plan-search').value = '';
                this.renderHistory();
            });
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