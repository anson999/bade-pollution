const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSU08cMkQD3qG0_wn4GxHH9Ebo8J3cyDB7oOk1GOjEVi55aB-2_Ks81gYKKoR86I4Ey2oGGX-ZFF3JR/pub?output=csv';

const state = {
    rawData: [],
    filteredData: [],
    charts: {},
    filtersBound: false,
    refreshTimer: null,
};

const ui = {
    locationFilter: document.getElementById('location-filter'),
    concentrationFilter: document.getElementById('concentration-filter'),
    dateStart: document.getElementById('date-start'),
    dateEnd: document.getElementById('date-end'),
    resetButton: document.getElementById('reset-button'),
    exportButton: document.getElementById('export-button'),
    printButton: document.getElementById('print-button'),
    themeToggle: document.getElementById('theme-toggle'),
    loadingOverlay: document.getElementById('loading-overlay'),
    lastUpdated: document.getElementById('last-updated'),
    errorMessage: document.getElementById('error-message'),
    errorText: document.getElementById('error-text'),
    resultSummary: document.getElementById('result-summary'),
    dataStatus: document.getElementById('data-status'),
};

const CHART_COLORS = {
    light: '#10b981',
    medium: '#f59e0b',
    heavy: '#ef4444',
    primary: '#3b82f6',
    secondary: '#4f46e5',
    accent: '#10b981',
    neutral: '#9ca3af',
};

const chartBaseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
        legend: { position: 'top' },
        tooltip: { enabled: true },
    },
};

const setLoading = (isLoading) => {
    ui.loadingOverlay.classList.toggle('hidden', !isLoading);
};

const displayError = (message) => {
    ui.errorText.textContent = message;
    ui.errorMessage.classList.remove('hidden');
    window.clearTimeout(displayError.timeoutId);
    displayError.timeoutId = window.setTimeout(() => {
        ui.errorMessage.classList.add('hidden');
    }, 10000);
};

const clearError = () => {
    ui.errorMessage.classList.add('hidden');
    ui.errorText.textContent = '';
};

const normalizeDateRange = (value) => (value ? value.replace(/-/g, '/') : '');

const dateToInputValue = (dateString) => {
    if (!dateString) return '';
    const normalized = String(dateString).trim();
    if (normalized.includes('/')) {
        const [year, month, day] = normalized.split('/');
        return `${year}-${month}-${day}`;
    }
    return normalized;
};

const escapeCsvCell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const formatDateKey = (date) => {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}/${m}/${d}`;
};

const formatHourLabel = (hour24) => {
    const hour = Number(hour24);
    if (Number.isNaN(hour)) return '—';

    let hour12 = hour % 12;
    const suffix = hour >= 12 ? ' PM' : ' AM';
    if (hour12 === 0) hour12 = 12;
    return `${hour12}${suffix}`;
};

const normalizeDate = (dateString) => {
    if (!dateString) return null;

    const datePart = dateString.split(' ')[0];
    const parts = datePart.split(/[-\/]/).map((p) => p.trim());

    if (parts.length === 3) {
        let year, month, day;

        if (parts[0].length === 4) {
            year = parts[0];
            month = parts[1];
            day = parts[2];
        } else if (parts[2].length === 4) {
            year = parts[2];
            month = parts[0];
            day = parts[1];
        } else {
            return dateString;
        }

        return `${year}/${month.padStart(2, '0')}/${day.padStart(2, '0')}`;
    }

    return dateString;
};

const convertTo24Hour = (timeString) => {
    if (!timeString) return NaN;

    const trimmedTime = timeString.toUpperCase().trim();
    const match12 = trimmedTime.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/);

    if (match12) {
        let hour = parseInt(match12[1], 10);
        const ampm = match12[3];

        if (ampm === 'PM' && hour !== 12) {
            hour += 12;
        } else if (ampm === 'AM' && hour === 12) {
            hour = 0;
        }
        return hour;
    }

    const match24 = trimmedTime.match(/(\d{1,2}):(\d{2})/);
    if (match24) {
        const hour = parseInt(match24[1], 10);
        if (hour >= 0 && hour <= 23) {
            return hour;
        }
    }

    return NaN;
};

const buildDateSeries = (daysBack) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const labels = [];
    const keys = [];

    for (let offset = daysBack; offset >= 0; offset -= 1) {
        const date = new Date(today);
        date.setDate(today.getDate() - offset);
        labels.push(`${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`);
        keys.push(formatDateKey(date));
    }

    return { labels, keys };
};

const buildMonthSeries = (monthsBack = 11) => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);

    const labels = [];
    const keys = [];

    for (let offset = 0; offset <= monthsBack; offset += 1) {
        const date = new Date(start.getFullYear(), start.getMonth() + offset, 1);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        labels.push(`${year}/${month}`);
        keys.push(`${year}/${month}`);
    }

    return { labels, keys };
};

const getMonthKey = (dateString) => {
    if (!dateString) return null;
    const normalized = String(dateString).trim();
    const [year, month] = normalized.split('/');
    if (!year || !month) return null;
    return `${year}/${String(month).padStart(2, '0')}`;
};

const countByKey = (data, getter) => {
    const counts = new Map();
    data.forEach((item) => {
        const key = getter(item);
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
};

const updateTimestamp = () => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    ui.lastUpdated.textContent = `上次更新時間: ${timeString}。數據將在背景中每 10 分鐘自動更新。`;
};

const fetchData = async () => {
    clearError();
    setLoading(true);

    try {
        const response = await fetch(CSV_URL);
        if (!response.ok) {
            throw new Error('無法載入 CSV 資料。請檢查網路連線或連結是否有效。');
        }

        const csvText = await response.text();

        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (header) => header.trim(),
                complete: (results) => {
                    const data = results.data;
                    const fields = results.meta.fields || [];
                    const findKey = (partialName) => fields.find((field) => field && field.includes(partialName));

                    const dateKey = findKey('發生日期');
                    const timeKey = findKey('發生時間');
                    const locationKey = findKey('空氣異味確切發生位置');
                    const concentrationKey = findKey('氣味濃度');
                    const typeKey = findKey('空氣異味類型');

                    if (!dateKey || !locationKey) {
                        console.error('Critical headers not found:', fields);
                        displayError(`CSV 檔案的關鍵欄位 ('發生日期' 或 '空氣異味確切發生位置') 不存在或無法辨識。`);
                        resolve([]);
                        return;
                    }

                    state.rawData = data
                        .map((row) => {
                            const rawDate = row[dateKey] ? String(row[dateKey]).trim() : null;
                            const date = normalizeDate(rawDate);
                            const time = row[timeKey] ? String(row[timeKey]).trim() : null;
                            const location = row[locationKey] ? String(row[locationKey]).trim() : null;
                            const concentration = row[concentrationKey] ? String(row[concentrationKey]).trim() : null;
                            const type = row[typeKey] ? String(row[typeKey]).trim() : null;
                            const hour24 = convertTo24Hour(time);

                            return { date, time, location, concentration, type, hour24 };
                        })
                        .filter((row) => row.date && row.location && !Number.isNaN(row.hour24));

                    if (state.rawData.length === 0) {
                        displayError('資料已成功讀取，但未包含有效的回報數據。請檢查試算表內容是否至少有一筆完整的日期、位置和時間資訊。');
                    }

                    updateDateFilterBounds();
                    resolve(state.rawData);
                },
                error: (error) => reject(error),
            });
        });
    } catch (error) {
        console.error('資料獲取或解析錯誤:', error);
        displayError(`無法載入或解析數據：${error.message} (錯誤碼: ${error.message.includes('Failed to fetch') ? '網路/CORS' : '解析失敗'})`);
        return [];
    } finally {
        setLoading(false);
        updateTimestamp();
    }
};

const updateDateFilterBounds = () => {
    const validDates = state.rawData
        .map((row) => row.date)
        .filter(Boolean)
        .sort();

    if (!validDates.length) {
        ui.dateStart.value = '';
        ui.dateEnd.value = '';
        ui.dateStart.min = '';
        ui.dateStart.max = '';
        ui.dateEnd.min = '';
        ui.dateEnd.max = '';
        return;
    }

    const minDate = validDates[0];
    const maxDate = validDates[validDates.length - 1];
    ui.dateStart.min = dateToInputValue(minDate);
    ui.dateStart.max = dateToInputValue(maxDate);
    ui.dateEnd.min = dateToInputValue(minDate);
    ui.dateEnd.max = dateToInputValue(maxDate);

    if (!ui.dateStart.value) {
        ui.dateStart.value = ui.dateStart.min;
    }
    if (!ui.dateEnd.value) {
        ui.dateEnd.value = ui.dateEnd.max;
    }

    if (ui.dateStart.value && ui.dateStart.value < ui.dateStart.min) {
        ui.dateStart.value = ui.dateStart.min;
    }
    if (ui.dateEnd.value && ui.dateEnd.value > ui.dateEnd.max) {
        ui.dateEnd.value = ui.dateEnd.max;
    }
};

const applyFilters = () => {
    const selectedLocation = ui.locationFilter.value;
    const selectedConcentration = ui.concentrationFilter.value;
    const selectedStart = normalizeDateRange(ui.dateStart.value);
    const selectedEnd = normalizeDateRange(ui.dateEnd.value);

    state.filteredData = state.rawData.filter((row) => {
        const locationMatch = selectedLocation === 'all' || row.location === selectedLocation;
        const concentrationMatch = selectedConcentration === 'all' || row.concentration === selectedConcentration;
        const dateMatch = (!selectedStart || row.date >= selectedStart) && (!selectedEnd || row.date <= selectedEnd);
        return locationMatch && concentrationMatch && dateMatch;
    });

    const total = state.rawData.length;
    const visible = state.filteredData.length;
    ui.resultSummary.textContent = `目前顯示 ${visible.toLocaleString()} / ${total.toLocaleString()} 筆回報`;
    ui.dataStatus.textContent = visible ? '資料已更新' : '沒有符合條件的資料';
    renderDashboard(state.filteredData);
};

const exportCurrentDataCsv = () => {
    const rows = state.filteredData.length ? state.filteredData : state.rawData;

    if (!rows.length) {
        displayError('目前沒有可匯出的資料。請先調整篩選條件。');
        return;
    }

    const headers = ['日期', '時間', '位置', '濃度', '類型', '小時'];
    const data = rows.map((row) => [
        row.date || '',
        row.time || '',
        row.location || '',
        row.concentration || '',
        row.type || '',
        row.hour24 ?? '',
    ]);

    const csvContent = [headers, ...data]
        .map((row) => row.map((cell) => escapeCsvCell(cell)).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = 'air-odor-report.csv';
    link.click();
    URL.revokeObjectURL(url);
};

const toggleDarkMode = () => {
    const isDark = document.body.classList.toggle('dark-theme');
    ui.themeToggle.textContent = isDark ? '淺色模式' : '深色模式';
    localStorage.setItem('bade-dashboard-theme', isDark ? 'dark' : 'light');
};

const calculateKPIs = (data) => {
    const totalCount = data.length;
    const uniqueDates = new Set(data.map((row) => row.date));
    const heavyReports = data.filter((row) => row.concentration === '重度').length;
    const heavyRatio = totalCount > 0 ? ((heavyReports / totalCount) * 100).toFixed(1) : 0;

    let peakHour = '--';
    let maxCount = 0;

    if (totalCount > 0) {
        const hourCounts = countByKey(data, (row) => row.hour24);
        let peakHour24 = null;

        hourCounts.forEach((count, hour) => {
            if (count > maxCount) {
                maxCount = count;
                peakHour24 = hour;
            }
        });

        if (peakHour24 !== null) {
            peakHour = `${formatHourLabel(peakHour24)} (1小時)`;
        }
    }

    document.getElementById('kpi-total').textContent = totalCount.toLocaleString();
    document.getElementById('kpi-days').textContent = uniqueDates.size.toLocaleString();
    document.getElementById('kpi-heavy-ratio').textContent = `${heavyRatio}%`;
    document.getElementById('kpi-peak-time').textContent = peakHour;
};

const initializeChart = (chartId, type, config) => {
    const canvas = document.getElementById(chartId);
    const existingChart = state.charts[chartId];
    const nextOptions = { ...chartBaseOptions, ...(config.options || {}) };

    if (existingChart) {
        existingChart.data = config.data;
        existingChart.options = nextOptions;
        existingChart.update('none');
        return;
    }

    state.charts[chartId] = new Chart(canvas.getContext('2d'), {
        type,
        options: nextOptions,
        data: config.data,
    });
};

const renderTypeChart = (data) => {
    const typeCounts = countByKey(data, (row) => row.type || '未知異味');
    const labels = [...typeCounts.keys()];
    const counts = [...typeCounts.values()];

    initializeChart('typeChart', 'pie', {
        data: {
            labels,
            datasets: [{
                data: counts,
                backgroundColor: ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#6366f1', '#f97316'],
                hoverOffset: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                title: { display: false },
            },
        },
    });
};

const renderTimeChart = (data) => {
    const hourCounts = Array(24).fill(0);
    data.forEach((row) => {
        const hour = row.hour24;
        if (!Number.isNaN(hour) && hour >= 0 && hour <= 23) {
            hourCounts[hour] += 1;
        }
    });

    initializeChart('timeChart', 'bar', {
        data: {
            labels: Array.from({ length: 24 }, (_, hour) => formatHourLabel(hour)),
            datasets: [{
                label: '回報筆數',
                data: hourCounts,
                backgroundColor: CHART_COLORS.secondary,
                borderColor: '#3730a3',
                borderWidth: 1,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, title: { display: true, text: '回報筆數' } },
                x: {
                    title: { display: true, text: '時間 (12小時制)' },
                    ticks: { autoSkip: true, maxTicksLimit: 12 },
                },
            },
            plugins: { legend: { display: false } },
        },
    });
};

const renderLocationConcentrationChart = (data) => {
    const locations = [...new Set(data.map((row) => row.location).filter(Boolean))].sort();
    const concentrations = ['輕度', '中度', '重度'];
    const counts = Object.fromEntries(
        locations.map((location) => [
            location,
            Object.fromEntries(concentrations.map((concentration) => [concentration, 0])),
        ])
    );

    data.forEach((row) => {
        if (row.location && row.concentration && concentrations.includes(row.concentration)) {
            counts[row.location][row.concentration] += 1;
        }
    });

    const datasets = concentrations.map((concentration) => ({
        label: concentration,
        data: locations.map((location) => counts[location][concentration]),
        backgroundColor: {
            輕度: CHART_COLORS.light,
            中度: CHART_COLORS.medium,
            重度: CHART_COLORS.heavy,
        }[concentration] || CHART_COLORS.neutral,
    }));

    initializeChart('locationConcentrationChart', 'bar', {
        data: {
            labels: locations,
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, title: { display: true, text: '發生位置' } },
                y: { stacked: true, beginAtZero: true, title: { display: true, text: '回報筆數' } },
            },
            plugins: { legend: { position: 'top' } },
        },
    });
};

const renderTrendChart = (chartId, data, daysBack, backgroundColor, borderColor) => {
    const { labels, keys } = buildDateSeries(daysBack);
    const counts = new Map(keys.map((key) => [key, 0]));

    data.forEach((row) => {
        if (counts.has(row.date)) {
            counts.set(row.date, counts.get(row.date) + 1);
        }
    });

    initializeChart(chartId, 'line', {
        data: {
            labels,
            datasets: [{
                label: '回報筆數',
                data: keys.map((key) => counts.get(key) || 0),
                backgroundColor,
                borderColor,
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointRadius: 5,
                pointHoverRadius: 7,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '回報筆數' },
                    ticks: { precision: 0 },
                },
                x: { title: { display: true, text: '日期' } },
            },
            plugins: {
                legend: { position: 'top' },
                title: { display: false },
            },
        },
    });
};

const renderWeeklyTrendChart = (data) => {
    renderTrendChart('weeklyTrendChart', data, 6, 'rgba(59, 130, 246, 0.5)', '#3b82f6');
};

const renderMonthlyTrendChart = (data) => {
    renderTrendChart('monthlyTrendChart', data, 29, 'rgba(16, 185, 129, 0.5)', '#10b981');
};

const renderYearlyTrendChart = (data) => {
    const { labels, keys } = buildMonthSeries(11);
    const counts = new Map(keys.map((key) => [key, 0]));

    data.forEach((row) => {
        const monthKey = getMonthKey(row.date);
        if (monthKey && counts.has(monthKey)) {
            counts.set(monthKey, counts.get(monthKey) + 1);
        }
    });

    initializeChart('yearlyTrendChart', 'line', {
        data: {
            labels,
            datasets: [{
                label: '回報筆數',
                data: keys.map((key) => counts.get(key) || 0),
                backgroundColor: 'rgba(99, 102, 241, 0.45)',
                borderColor: '#6366f1',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointRadius: 5,
                pointHoverRadius: 7,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: '回報筆數' },
                    ticks: { precision: 0 },
                },
                x: { title: { display: true, text: '月份' } },
            },
            plugins: {
                legend: { position: 'top' },
                title: { display: false },
            },
        },
    });
};

const renderDashboard = (data) => {
    calculateKPIs(data);
    renderTypeChart(data);
    renderTimeChart(data);
    renderLocationConcentrationChart(data);
    renderWeeklyTrendChart(data);
    renderMonthlyTrendChart(data);
    renderYearlyTrendChart(data);
};

const setupFilters = () => {
    const locations = [...new Set(state.rawData.map((row) => row.location).filter(Boolean))].sort();

    while (ui.locationFilter.options.length > 1) {
        ui.locationFilter.remove(1);
    }

    const fragment = document.createDocumentFragment();
    locations.forEach((location) => {
        const option = document.createElement('option');
        option.value = location;
        option.textContent = location;
        fragment.appendChild(option);
    });
    ui.locationFilter.appendChild(fragment);
    updateDateFilterBounds();

    if (!state.filtersBound) {
        ui.locationFilter.addEventListener('change', applyFilters);
        ui.concentrationFilter.addEventListener('change', applyFilters);
        ui.dateStart.addEventListener('change', applyFilters);
        ui.dateEnd.addEventListener('change', applyFilters);
        ui.resetButton.addEventListener('click', () => {
            ui.locationFilter.value = 'all';
            ui.concentrationFilter.value = 'all';
            ui.dateStart.value = ui.dateStart.min || '';
            ui.dateEnd.value = ui.dateEnd.max || '';
            applyFilters();
        });
        ui.exportButton.addEventListener('click', exportCurrentDataCsv);
        ui.printButton.addEventListener('click', () => window.print());
        ui.themeToggle.addEventListener('click', toggleDarkMode);
        state.filtersBound = true;
    }
};

const scheduleRefresh = () => {
    if (state.refreshTimer) {
        window.clearInterval(state.refreshTimer);
    }

    state.refreshTimer = window.setInterval(async () => {
        console.log('自動更新中...');
        await fetchData();
        setupFilters();
        applyFilters();
    }, 600000);
};

const init = async () => {
    const storedTheme = localStorage.getItem('bade-dashboard-theme');
    if (storedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        ui.themeToggle.textContent = '淺色模式';
    }

    await fetchData();
    setupFilters();
    applyFilters();
    scheduleRefresh();
};

window.addEventListener('load', init);
