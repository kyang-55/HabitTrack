const LOCAL_SERVER_ORIGIN = "http://localhost:3000";
const useLocalServer = window.location.protocol === "file:"
    || (
        ["localhost", "127.0.0.1"].includes(window.location.hostname)
        && window.location.port
        && window.location.port !== "3000"
    );
const API = useLocalServer ? LOCAL_SERVER_ORIGIN : "";
const PAGE_BASE = useLocalServer ? `${LOCAL_SERVER_ORIGIN}/pages` : ".";
const DEFAULT_THEME_PREFERENCE = "light";
const chartViewState = {
    metric: "completed",
    chartType: "line"
};
const activityViewState = {
    habitId: "all",
    category: "all",
    search: ""
};
const HABIT_ICON_CATALOG = {
    spark: { emoji: "✨", label: "Spark" },
    heart: { emoji: "❤️", label: "Heart" },
    dumbbell: { emoji: "🏋️", label: "Dumbbell" },
    apple: { emoji: "🍎", label: "Apple" },
    moon: { emoji: "🌙", label: "Moon" },
    leaf: { emoji: "🍃", label: "Leaf" },
    book: { emoji: "📚", label: "Book" },
    briefcase: { emoji: "💼", label: "Briefcase" },
    clock: { emoji: "⏰", label: "Clock" },
    wallet: { emoji: "💰", label: "Wallet" },
    users: { emoji: "🤝", label: "People" },
    home: { emoji: "🏠", label: "Home" },
    check: { emoji: "✅", label: "Check" }
};

let currentSummary = null;

function normalizeThemePreference(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "light" || normalized === "dark") {
        return normalized;
    }

    return DEFAULT_THEME_PREFERENCE;
}

function applyThemePreference(themePreference) {
    const normalized = normalizeThemePreference(themePreference);
    document.body.dataset.theme = normalized;
    document.documentElement.style.colorScheme = normalized;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeHabitIcon(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    return HABIT_ICON_CATALOG[normalized] ? normalized : "";
}

function renderHabitIcon(iconKey) {
    const icon = HABIT_ICON_CATALOG[normalizeHabitIcon(iconKey)] || HABIT_ICON_CATALOG.check;
    return `<span class="habit-inline-icon" aria-hidden="true" title="${escapeHtml(icon.label)}">${escapeHtml(icon.emoji)}</span>`;
}

function readJson(res) {
    return res.text().then((text) => {
        try {
            return text ? JSON.parse(text) : {};
        } catch {
            return {};
        }
    });
}

async function authFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API}${url}`, {
        ...options,
        credentials: "include",
        headers
    });

    if (res.status === 401) {
        window.location.replace(`${PAGE_BASE}/login.html`);
        throw new Error("Authentication required.");
    }

    return res;
}

function showFeedback(message, success = false) {
    const feedback = document.getElementById("activityFeedback");
    feedback.textContent = message;
    feedback.className = success ? "profile-feedback is-success" : "profile-feedback";
}

function formatRetentionLabel(value) {
    const labels = {
        "7_days": "Keep 7 days",
        "9_days": "Keep 9 days",
        "30_days": "Keep 30 days",
        monthly: "Keep current month"
    };

    return labels[String(value || "").trim()] || "Keep 30 days";
}

function formatActivityDate(isoDate) {
    const [year, month, day] = String(isoDate || "").split("-").map(Number);
    if (!year || !month || !day) {
        return "Unknown date";
    }

    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addDays(isoDate, amount) {
    const [year, month, day] = String(isoDate || "").split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + amount);
    return formatIsoDate(date);
}

function dateDiffInDays(startIso, endIso) {
    const [startYear, startMonth, startDay] = String(startIso || "").split("-").map(Number);
    const [endYear, endMonth, endDay] = String(endIso || "").split("-").map(Number);
    const start = Date.UTC(startYear, startMonth - 1, startDay);
    const end = Date.UTC(endYear, endMonth - 1, endDay);
    return Math.round((end - start) / 86400000);
}

function getActivityDateRange(activity) {
    const dates = (Array.isArray(activity) ? activity : [])
        .map((item) => item.completionDate)
        .filter(Boolean)
        .sort();

    if (dates.length === 0) {
        const today = formatIsoDate(new Date());
        return { start: today, end: today, days: [today] };
    }

    const start = dates[0];
    const end = dates[dates.length - 1];
    const totalDays = Math.max(0, dateDiffInDays(start, end));
    const days = Array.from({ length: totalDays + 1 }, (_, index) => addDays(start, index));
    return { start, end, days };
}

function formatMetricValue(value, metric) {
    if (metric === "rate") {
        return `${Math.round(Number(value) || 0)}%`;
    }

    return String(Math.round(Number(value) || 0));
}

function getChartMeta(metric) {
    if (metric === "rate") {
        return {
            label: "Daily Consistency Rate",
            description: "Percent of shown habits with a saved log on each day in this view."
        };
    }

    if (metric === "cumulative") {
        return {
            label: "Cumulative Logged Days",
            description: "Running total of retained logs in the selected activity view."
        };
    }

    return {
        label: "Logged Habits Per Day",
        description: "How many retained habit logs appear on each day in the selected view."
    };
}

function buildActivitySearchText(item) {
    return [
        item?.habitName,
        item?.category,
        item?.completionDate,
        item?.entryType === "low_effort" ? "streak protected low effort" : "full completion completed"
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function getActivityCategories(activity) {
    return [...new Set(
        (Array.isArray(activity) ? activity : [])
            .map((item) => String(item?.category || "").trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function filterActivityItems(activity, filters) {
    const items = Array.isArray(activity) ? activity : [];
    const activeFilters = filters && typeof filters === "object" ? filters : {};
    const category = String(activeFilters.category || "all").trim();
    const search = String(activeFilters.search || "").trim().toLowerCase();

    return items.filter((item) => {
        if (category !== "all" && String(item?.category || "").trim() !== category) {
            return false;
        }

        if (search && !buildActivitySearchText(item).includes(search)) {
            return false;
        }

        return true;
    });
}

function buildFilteredActivitySummary(summary, filters) {
    const baseSummary = summary && typeof summary === "object" ? summary : {};
    const activity = filterActivityItems(baseSummary.activity, filters);
    const fullCompletions = activity.filter((item) => item.entryType === "full").length;
    const lowEffortDays = activity.filter((item) => item.entryType === "low_effort").length;
    const oldestKeptDate = activity.length > 0 ? activity[activity.length - 1].completionDate : null;
    const visibleHabitCount = new Set(activity.map((item) => Number(item.habitId)).filter(Number.isInteger)).size;

    return {
        ...baseSummary,
        activity,
        stats: {
            ...(baseSummary.stats || {}),
            totalEntries: activity.length,
            fullCompletions,
            lowEffortDays,
            oldestKeptDate,
            visibleHabitCount
        }
    };
}

function buildConsistencySeries(summary) {
    const activity = Array.isArray(summary?.activity) ? summary.activity : [];
    const habits = Array.isArray(summary?.habits) ? summary.habits : [];
    const range = getActivityDateRange(activity);
    const logsByDay = activity.reduce((counts, item) => {
        counts[item.completionDate] = (counts[item.completionDate] || 0) + 1;
        return counts;
    }, {});
    const habitCount = Math.max(1, habits.length || 1);
    let cumulative = 0;

    return {
        metric: chartViewState.metric,
        meta: getChartMeta(chartViewState.metric),
        points: range.days.map((date) => {
            const count = logsByDay[date] || 0;
            cumulative += count;
            const value = chartViewState.metric === "rate"
                ? Math.round((count / habitCount) * 100)
                : chartViewState.metric === "cumulative"
                    ? cumulative
                    : count;

            return {
                date,
                label: formatActivityDate(date).replace(/, \d{4}$/, ""),
                value
            };
        })
    };
}

function getChartLayout(chartType = "line") {
    const width = 780;
    const height = 290;
    const padding = { top: 20, right: 24, bottom: 42, left: 58 };
    const axisGap = chartType === "bar" ? 18 : 8;
    const plotLeft = padding.left + axisGap;
    const plotRight = width - padding.right;
    const plotBottom = height - padding.bottom;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - padding.top;

    return {
        width,
        height,
        padding,
        axisGap,
        plotLeft,
        plotRight,
        plotBottom,
        plotWidth,
        plotHeight
    };
}

function buildChartSvg(series, chartType = "line") {
    const layout = getChartLayout(chartType);
    const {
        width,
        height,
        padding,
        plotLeft,
        plotRight,
        plotBottom,
        plotWidth,
        plotHeight
    } = layout;
    const points = Array.isArray(series?.points) ? series.points : [];
    const maxValue = Math.max(1, ...points.map((point) => Number(point.value) || 0));
    const xSpan = Math.max(1, points.length - 1);
    const plotted = points.map((point, index) => ({
        ...point,
        x: plotLeft + (plotWidth * index) / xSpan,
        y: padding.top + plotHeight - ((Number(point.value) || 0) / maxValue) * plotHeight
    }));
    const gridValues = [0, Math.ceil(maxValue / 2), maxValue];
    const grid = gridValues.map((value) => {
        const y = padding.top + plotHeight - (value / maxValue) * plotHeight;
        return `
            <line x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" class="chart-grid-line"></line>
            <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" class="chart-axis-label">${escapeHtml(formatMetricValue(value, series.metric))}</text>
        `;
    }).join("");
    const labelStep = Math.max(1, Math.ceil(plotted.length / 6));
    const labels = plotted.filter((_, index) => index % labelStep === 0 || index === plotted.length - 1).map((point) => `
        <text x="${point.x}" y="${height - 14}" text-anchor="middle" class="chart-axis-label">${escapeHtml(point.label)}</text>
    `).join("");
    const linePath = plotted.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    const areaPath = plotted.length
        ? `${linePath} L ${plotted[plotted.length - 1].x} ${height - padding.bottom} L ${plotted[0].x} ${height - padding.bottom} Z`
        : "";
    const barWidth = Math.max(8, Math.min(34, plotWidth / Math.max(1, plotted.length) - 6));
    const bars = chartType === "bar" ? plotted.map((point) => {
        const barHeight = plotBottom - point.y;
        const x = point.x - barWidth / 2;
        return `<rect x="${x}" y="${point.y}" width="${barWidth}" height="${Math.max(barHeight, 0)}" rx="7" class="chart-bar"><title>${escapeHtml(point.label)}: ${escapeHtml(formatMetricValue(point.value, series.metric))}</title></rect>`;
    }).join("") : "";
    const dots = chartType === "line" ? plotted.map((point) => `
        <circle cx="${point.x}" cy="${point.y}" r="4" class="chart-dot">
            <title>${escapeHtml(point.label)}: ${escapeHtml(formatMetricValue(point.value, series.metric))}</title>
        </circle>
    `).join("") : "";

    return `
        <svg viewBox="0 0 ${width} ${height}" class="chart-svg" aria-hidden="true">
            <defs>
                <linearGradient id="pastActivityChartFillGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stop-color="rgba(93, 107, 255, 0.24)"></stop>
                    <stop offset="100%" stop-color="rgba(93, 107, 255, 0)"></stop>
                </linearGradient>
            </defs>
            ${grid}
            <line x1="${plotLeft}" y1="${plotBottom}" x2="${plotRight}" y2="${plotBottom}" class="chart-axis-line"></line>
            ${chartType === "line" ? `<path d="${areaPath}" class="chart-area"></path><path d="${linePath}" class="chart-line"></path>${dots}` : bars}
            ${labels}
        </svg>
    `;
}

function buildCategoryBreakdown(activity) {
    const items = Array.isArray(activity) ? activity : [];
    const total = items.length;
    const counts = items.reduce((map, item) => {
        const category = String(item?.category || "").trim() || "Uncategorized";
        map.set(category, Number(map.get(category) || 0) + 1);
        return map;
    }, new Map());

    return [...counts.entries()]
        .map(([category, count]) => ({
            category,
            count,
            percentage: total > 0 ? Math.round((count / total) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, undefined, { sensitivity: "base" }));
}

function getUniqueActivityDates(activity) {
    return [...new Set(
        (Array.isArray(activity) ? activity : [])
            .map((item) => String(item?.completionDate || "").trim())
            .filter(Boolean)
    )].sort();
}

function calculateLongestStreakFromDates(dates) {
    const orderedDates = Array.isArray(dates) ? [...dates].sort() : [];

    if (orderedDates.length === 0) {
        return 0;
    }

    let longest = 1;
    let current = 1;

    for (let index = 1; index < orderedDates.length; index += 1) {
        if (dateDiffInDays(orderedDates[index - 1], orderedDates[index]) === 1) {
            current += 1;
            longest = Math.max(longest, current);
        } else {
            current = 1;
        }
    }

    return longest;
}

function calculateLatestStreakFromDates(dates) {
    const orderedDates = Array.isArray(dates) ? [...dates].sort() : [];

    if (orderedDates.length === 0) {
        return 0;
    }

    let streak = 1;

    for (let index = orderedDates.length - 1; index > 0; index -= 1) {
        if (dateDiffInDays(orderedDates[index - 1], orderedDates[index]) === 1) {
            streak += 1;
            continue;
        }

        break;
    }

    return streak;
}

function buildStreakProgress(activity) {
    const dates = getUniqueActivityDates(activity);
    const latestStreak = calculateLatestStreakFromDates(dates);
    const bestStreak = calculateLongestStreakFromDates(dates);
    const percentage = bestStreak > 0
        ? Math.max(0, Math.min(100, Math.round((latestStreak / bestStreak) * 100)))
        : 0;

    return {
        latestStreak,
        bestStreak,
        percentage,
        activeDays: dates.length
    };
}

function describePercentage(value) {
    return `${Math.round(Number(value) || 0)}%`;
}

function buildDonutChartSvg(breakdown) {
    const items = Array.isArray(breakdown) ? breakdown : [];
    const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0);

    if (total <= 0) {
        return '<div class="chart-empty">No category breakdown yet. Add logs to see where your effort is going.</div>';
    }

    const width = 520;
    const height = 420;
    const centerX = 260;
    const centerY = 128;
    const outerRadius = 98;
    const innerRadius = 58;
    const colors = ["#5d6bff", "#2fa7a0", "#ffb44d", "#ff7a7a", "#8a79ff", "#5dbb63", "#56a3ff", "#d97aff"];
    let runningAngle = -Math.PI / 2;

    const arcPath = (startAngle, endAngle) => {
        const startOuterX = centerX + Math.cos(startAngle) * outerRadius;
        const startOuterY = centerY + Math.sin(startAngle) * outerRadius;
        const endOuterX = centerX + Math.cos(endAngle) * outerRadius;
        const endOuterY = centerY + Math.sin(endAngle) * outerRadius;
        const startInnerX = centerX + Math.cos(endAngle) * innerRadius;
        const startInnerY = centerY + Math.sin(endAngle) * innerRadius;
        const endInnerX = centerX + Math.cos(startAngle) * innerRadius;
        const endInnerY = centerY + Math.sin(startAngle) * innerRadius;
        const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

        return [
            `M ${startOuterX} ${startOuterY}`,
            `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuterX} ${endOuterY}`,
            `L ${startInnerX} ${startInnerY}`,
            `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${endInnerX} ${endInnerY}`,
            "Z"
        ].join(" ");
    };

    const segments = items.map((item, index) => {
        const sliceAngle = (Number(item.count || 0) / total) * Math.PI * 2;
        const startAngle = runningAngle;
        const endAngle = runningAngle + sliceAngle;
        runningAngle = endAngle;
        const color = colors[index % colors.length];

        return `
            <path d="${arcPath(startAngle, endAngle)}" fill="${color}" class="chart-donut-slice">
                <title>${escapeHtml(item.category)}: ${item.count} logs (${describePercentage(item.percentage)})</title>
            </path>
        `;
    }).join("");

    const legend = items.map((item, index) => {
        const color = colors[index % colors.length];
        const y = 258 + (index * 28);
        return `
            <g transform="translate(72, ${y})">
                <rect width="12" height="12" rx="4" fill="${color}"></rect>
                <text x="20" y="10" class="chart-axis-label">${escapeHtml(item.category)} • ${item.count} • ${escapeHtml(describePercentage(item.percentage))}</text>
            </g>
        `;
    }).join("");

    return `
        <svg viewBox="0 0 ${width} ${height}" class="chart-svg chart-svg--donut" aria-hidden="true">
            <circle cx="${centerX}" cy="${centerY}" r="${outerRadius}" fill="rgba(93, 107, 255, 0.08)"></circle>
            ${segments}
            <circle cx="${centerX}" cy="${centerY}" r="${innerRadius - 2}" fill="var(--surface-strong)"></circle>
            <text x="${centerX}" y="${centerY - 8}" text-anchor="middle" class="chart-donut-total">${total}</text>
            <text x="${centerX}" y="${centerY + 16}" text-anchor="middle" class="chart-axis-label">logs</text>
            ${legend}
        </svg>
    `;
}

function buildProgressDonutSvg(progress) {
    const latestStreak = Number(progress?.latestStreak || 0);
    const bestStreak = Number(progress?.bestStreak || 0);
    const percentage = Number(progress?.percentage || 0);
    const activeDays = Number(progress?.activeDays || 0);

    if (activeDays <= 0) {
        return '<div class="chart-empty">No streak data yet. Log on consecutive days to start building momentum.</div>';
    }

    const width = 520;
    const height = 420;
    const centerX = 260;
    const centerY = 128;
    const radius = 94;
    const strokeWidth = 28;
    const circumference = 2 * Math.PI * radius;
    const progressLength = circumference * (Math.max(0, Math.min(100, percentage)) / 100);
    const trackLength = Math.max(0, circumference - progressLength);

    return `
        <svg viewBox="0 0 ${width} ${height}" class="chart-svg chart-svg--donut" aria-hidden="true">
            <circle
                cx="${centerX}"
                cy="${centerY}"
                r="${radius}"
                fill="none"
                stroke="rgba(93, 107, 255, 0.12)"
                stroke-width="${strokeWidth}">
            </circle>
            <circle
                cx="${centerX}"
                cy="${centerY}"
                r="${radius}"
                fill="none"
                stroke="url(#pastActivityStreakGradient)"
                stroke-width="${strokeWidth}"
                stroke-linecap="round"
                stroke-dasharray="${progressLength} ${trackLength}"
                transform="rotate(-90 ${centerX} ${centerY})"
                class="chart-donut-progress">
            </circle>
            <defs>
                <linearGradient id="pastActivityStreakGradient" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stop-color="#5d6bff"></stop>
                    <stop offset="100%" stop-color="#2fa7a0"></stop>
                </linearGradient>
            </defs>
            <text x="${centerX}" y="${centerY - 10}" text-anchor="middle" class="chart-donut-total">${latestStreak}d</text>
            <text x="${centerX}" y="${centerY + 16}" text-anchor="middle" class="chart-axis-label">${escapeHtml(describePercentage(percentage))} of best</text>
            <g transform="translate(56, 262)">
                <text x="0" y="0" class="chart-donut-metric-label">Latest visible streak</text>
                <text x="0" y="30" class="chart-donut-metric-value">${latestStreak} day${latestStreak === 1 ? "" : "s"}</text>
                <text x="0" y="72" class="chart-donut-metric-label">Best streak in view</text>
                <text x="0" y="102" class="chart-donut-metric-value">${bestStreak} day${bestStreak === 1 ? "" : "s"}</text>
                <text x="244" y="0" class="chart-donut-metric-label">Active days retained</text>
                <text x="244" y="30" class="chart-donut-metric-value">${activeDays}</text>
                <text x="244" y="72" class="chart-donut-metric-label">Progress to best</text>
                <text x="244" y="102" class="chart-donut-metric-value">${escapeHtml(describePercentage(percentage))}</text>
            </g>
        </svg>
    `;
}

function renderChartSummary(summary, series) {
    const activity = Array.isArray(summary?.activity) ? summary.activity : [];
    const daysWithLogs = new Set(activity.map((item) => item.completionDate)).size;
    const totalLogs = activity.length;
    const protectedDays = activity.filter((item) => item.entryType === "low_effort").length;
    const average = series.points.length ? totalLogs / series.points.length : 0;
    const cards = document.getElementById("chartSummaryCards");

    if (!cards) return;

    cards.innerHTML = `
        <article class="analytics-card">
            <span>Logs charted</span>
            <strong>${totalLogs}</strong>
            <p>Saved in this view</p>
        </article>
        <article class="analytics-card">
            <span>Active days</span>
            <strong>${daysWithLogs}</strong>
            <p>Days with activity</p>
        </article>
        <article class="analytics-card">
            <span>Protected</span>
            <strong>${protectedDays}</strong>
            <p>Low-effort saves</p>
        </article>
        <article class="analytics-card">
            <span>Daily average</span>
            <strong>${average.toFixed(1)}</strong>
            <p>Logs per day</p>
        </article>
    `;
}

function renderConsistencyChart(summary) {
    const chartCanvas = document.getElementById("chartCanvas");
    const chartTitle = document.getElementById("chartTitle");
    const chartDescription = document.getElementById("chartDescription");
    const summaryText = document.getElementById("chartSummaryText");

    if (!chartCanvas || !chartTitle || !chartDescription || !summaryText) return;

    const activity = Array.isArray(summary?.activity) ? summary.activity : [];
    const series = buildConsistencySeries(summary);

    chartTitle.textContent = series.meta.label;
    chartDescription.textContent = series.meta.description;
    summaryText.textContent = activity.length
        ? "Trends reflect the retained logs currently shown by your filters."
        : "No retained logs match this view yet.";
    renderChartSummary(summary, series);

    if (activity.length === 0) {
        chartCanvas.setAttribute("aria-label", "Habit consistency chart unavailable because no activity matches this view");
        chartCanvas.innerHTML = '<div class="chart-empty">No chart data yet. Try another habit or time range.</div>';
        return;
    }

    chartCanvas.setAttribute("aria-label", `${series.meta.label} for the selected Past Activity view`);
    chartCanvas.innerHTML = buildChartSvg(series, chartViewState.chartType);
}

function renderCategoryFilterOptions(activity, selectedCategory = "all") {
    const select = document.getElementById("activityCategoryFilter");
    if (!select) {
        return;
    }

    const categories = getActivityCategories(activity);
    const nextValue = categories.includes(selectedCategory) ? selectedCategory : "all";
    select.innerHTML = `<option value="all">All categories</option>${categories
        .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
        .join("")}`;
    select.value = nextValue;
    activityViewState.category = nextValue;
}

function renderCategoryBreakdown(summary) {
    const chartCanvas = document.getElementById("categoryChartCanvas");
    const chartTitle = document.getElementById("categoryChartTitle");
    const chartDescription = document.getElementById("categoryChartDescription");

    if (!chartCanvas || !chartTitle || !chartDescription) {
        return;
    }

    const activity = Array.isArray(summary?.activity) ? summary.activity : [];
    const breakdown = buildCategoryBreakdown(activity);

    chartTitle.textContent = "Category Breakdown";
    chartDescription.textContent = activity.length
        ? "Percentages reflect the share of retained logs in each visible category."
        : "Add or reveal some activity to see your category split.";
    chartCanvas.setAttribute("aria-label", "Habit category breakdown for the selected Past Activity view");
    chartCanvas.innerHTML = buildDonutChartSvg(breakdown);
}

function renderStreakProgress(summary) {
    const chartCanvas = document.getElementById("streakChartCanvas");
    const chartTitle = document.getElementById("streakChartTitle");
    const chartDescription = document.getElementById("streakChartDescription");

    if (!chartCanvas || !chartTitle || !chartDescription) {
        return;
    }

    const activity = Array.isArray(summary?.activity) ? summary.activity : [];
    const progress = buildStreakProgress(activity);

    chartTitle.textContent = "Streak Progress";
    chartDescription.textContent = activity.length
        ? "The ring shows how your latest visible streak compares with your best streak in the current filtered view."
        : "Add or reveal some activity to see your streak momentum.";
    chartCanvas.setAttribute("aria-label", "Habit streak progress for the selected Past Activity view");
    chartCanvas.innerHTML = buildProgressDonutSvg(progress);
}

function renderHabitFilterOptions(habits, selectedHabitId = "all") {
    const select = document.getElementById("activityHabitFilter");
    if (!select) {
        return;
    }

    const options = (Array.isArray(habits) ? habits : [])
        .map((habit) => `<option value="${escapeHtml(String(habit.id))}">${escapeHtml(habit.name)}</option>`)
        .join("");

    select.innerHTML = `<option value="all">All habits</option>${options}`;
    select.value = selectedHabitId;
}

function renderActivityList(activity) {
    const list = document.getElementById("activityList");
    const items = Array.isArray(activity) ? activity : [];

    if (!list) {
        return;
    }

    if (items.length === 0) {
        list.innerHTML = '<div class="empty-state">No activity found. Try another habit or time range.</div>';
        return;
    }

    list.innerHTML = items.map((item) => `
        <article class="activity-row">
            <div class="activity-row__main">
                <div class="activity-row__title-line">
                    ${renderHabitIcon(item.icon)}
                    <p class="activity-row__title">${escapeHtml(item.habitName)}</p>
                    ${item.isFavorite ? '<span class="habit-row__favorite">★ Favorite</span>' : ""}
                    ${item.category ? `<span class="activity-row__category">${escapeHtml(item.category)}</span>` : ""}
                </div>
                <p class="activity-row__meta">${escapeHtml(formatActivityDate(item.completionDate))}</p>
                ${item.entryType === "low_effort" ? '<p class="activity-row__note">Protected by a low-effort day, so the streak stayed alive.</p>' : ""}
            </div>
            <div class="activity-row__status ${item.entryType === "low_effort" ? "activity-row__status--low-effort" : ""}">
                ${item.entryType === "low_effort" ? "Streak protected" : "Full completion"}
            </div>
        </article>
    `).join("");
}

function renderSummary(summary, selectedHabitId = "all") {
    currentSummary = summary;
    activityViewState.habitId = selectedHabitId;
    document.getElementById("activityRetentionBadge").textContent = `Window: ${formatRetentionLabel(summary?.retention).toLowerCase()}`;
    document.getElementById("retentionSelect").value = summary?.retention || "30_days";
    renderHabitFilterOptions(summary?.habits, selectedHabitId);
    renderCategoryFilterOptions(summary?.activity, activityViewState.category);
    document.getElementById("activitySearchInput").value = activityViewState.search;
    renderFilteredView();
}

function renderFilteredView() {
    const filteredSummary = buildFilteredActivitySummary(currentSummary, activityViewState);
    const stats = filteredSummary?.stats || {};
    const hasFilters = activityViewState.category !== "all" || Boolean(activityViewState.search.trim());

    document.getElementById("activityOldestBadge").textContent = stats.oldestKeptDate
        ? `Oldest saved log: ${formatActivityDate(stats.oldestKeptDate)}`
        : "No saved history yet";
    document.getElementById("activityTotalEntries").textContent = String(stats.totalEntries || 0);
    document.getElementById("activityFullEntries").textContent = String(stats.fullCompletions || 0);
    document.getElementById("activityLowEffortEntries").textContent = String(stats.lowEffortDays || 0);
    document.getElementById("activityVisibleHabits").textContent = String(stats.visibleHabitCount || 0);
    document.getElementById("activityListCopy").textContent = stats.totalEntries > 0
        ? hasFilters
            ? "Retained activity below updates instantly as you narrow the view."
            : "Retained activity appears below, newest first."
        : "No retained activity is available in this view yet.";

    renderCategoryFilterOptions(currentSummary?.activity, activityViewState.category);
    renderActivityList(filteredSummary?.activity);
    renderConsistencyChart(filteredSummary);
    renderCategoryBreakdown(filteredSummary);
    renderStreakProgress(filteredSummary);
}

async function loadPastActivity(selectedHabitId = "all") {
    const query = selectedHabitId && selectedHabitId !== "all"
        ? `?habitId=${encodeURIComponent(selectedHabitId)}`
        : "";
    const res = await authFetch(`/past-activity${query}`);
    const data = await readJson(res);

    if (!res.ok) {
        throw new Error(data.error || "Unable to load past activity.");
    }

    renderSummary(data.summary, selectedHabitId);
    window.HabitTrackSessionWarning?.init({
        api: API,
        pageBase: PAGE_BASE,
        idleTimeoutMs: 10 * 60 * 1000,
        warningDurationMs: 60 * 1000
    });
}

async function loadCurrentUserTheme() {
    const res = await authFetch("/auth/me");
    const data = await readJson(res);

    if (!res.ok) {
        throw new Error(data.error || "Unable to load appearance.");
    }

    applyThemePreference(data.user?.themePreference);
}

async function updateRetention() {
    const retention = document.getElementById("retentionSelect").value;
    const selectedHabitId = activityViewState.habitId || "all";
    showFeedback("");

    const res = await authFetch("/past-activity/retention", {
        method: "PATCH",
        body: JSON.stringify({ retention })
    });
    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to update retention.");
        return;
    }

    renderSummary(data.summary, selectedHabitId);
    if (selectedHabitId !== "all") {
        await loadPastActivity(selectedHabitId);
    }
    showFeedback(data.message || "Retention window updated.", true);
}

document.getElementById("retentionSelect").addEventListener("change", updateRetention);
document.getElementById("activityHabitFilter").addEventListener("change", async (event) => {
    try {
        showFeedback("");
        await loadPastActivity(event.target.value);
    } catch (error) {
        showFeedback(error.message || "Unable to load past activity.");
    }
});
document.getElementById("activityCategoryFilter")?.addEventListener("change", (event) => {
    activityViewState.category = event.target.value || "all";
    renderFilteredView();
});
document.getElementById("activitySearchInput")?.addEventListener("input", (event) => {
    activityViewState.search = event.target.value || "";
    renderFilteredView();
});
document.getElementById("chartMetricFilter")?.addEventListener("change", (event) => {
    chartViewState.metric = event.target.value;
    renderFilteredView();
});
document.getElementById("chartTypeFilter")?.addEventListener("change", (event) => {
    chartViewState.chartType = event.target.value;
    renderFilteredView();
});

async function initializePastActivityPage() {
    await loadCurrentUserTheme();
    await loadPastActivity();
}

initializePastActivityPage().catch((error) => {
    showFeedback(error.message || "Unable to load past activity.");
});
