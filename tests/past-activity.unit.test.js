const { loadFunctions } = require("./helpers/source-loader");
const { assert, runTest } = require("./helpers/test-harness");

const pastActivityFunctions = loadFunctions("public/scripts/past-activity.js", [
    "escapeHtml",
    "buildActivitySearchText",
    "getActivityCategories",
    "filterActivityItems",
    "buildFilteredActivitySummary",
    "dateDiffInDays",
    "getChartLayout",
    "buildCategoryBreakdown",
    "getUniqueActivityDates",
    "calculateLongestStreakFromDates",
    "calculateLatestStreakFromDates",
    "buildStreakProgress",
    "describePercentage",
    "buildDonutChartSvg",
    "buildProgressDonutSvg"
]);

module.exports = async function runPastActivityUnitTests() {
    let failed = 0;

    failed += Number(!(await runTest("past-activity.js unit tests: filterActivityItems matches category and live search text", () => {
        const activity = [
            { habitId: 1, habitName: "Morning Run", category: "Fitness", completionDate: "2026-04-20", entryType: "full" },
            { habitId: 2, habitName: "Budget Review", category: "Finance", completionDate: "2026-04-19", entryType: "low_effort" },
            { habitId: 3, habitName: "Read", category: "Learning", completionDate: "2026-04-18", entryType: "full" }
        ];

        assert.equal(pastActivityFunctions.filterActivityItems(activity, { category: "Finance" }).length, 1);
        assert.equal(pastActivityFunctions.filterActivityItems(activity, { search: "budget" }).length, 1);
        assert.equal(pastActivityFunctions.filterActivityItems(activity, { search: "streak protected" }).length, 1);
        assert.equal(pastActivityFunctions.filterActivityItems(activity, { category: "Learning", search: "read" }).length, 1);
    })));

    failed += Number(!(await runTest("past-activity.js unit tests: buildFilteredActivitySummary recomputes visible totals", () => {
        const summary = {
            stats: { totalEntries: 3, fullCompletions: 2, lowEffortDays: 1, oldestKeptDate: "2026-04-18" },
            activity: [
                { id: 1, habitId: 1, habitName: "Morning Run", category: "Fitness", completionDate: "2026-04-20", entryType: "full" },
                { id: 2, habitId: 2, habitName: "Budget Review", category: "Finance", completionDate: "2026-04-19", entryType: "low_effort" },
                { id: 3, habitId: 2, habitName: "Budget Review", category: "Finance", completionDate: "2026-04-18", entryType: "full" }
            ]
        };

        const filtered = pastActivityFunctions.buildFilteredActivitySummary(summary, { category: "Finance", search: "budget" });

        assert.equal(filtered.stats.totalEntries, 2);
        assert.equal(filtered.stats.fullCompletions, 1);
        assert.equal(filtered.stats.lowEffortDays, 1);
        assert.equal(filtered.stats.visibleHabitCount, 1);
        assert.equal(filtered.stats.oldestKeptDate, "2026-04-18");
    })));

    failed += Number(!(await runTest("past-activity.js unit tests: chart layout gives bar charts more axis breathing room", () => {
        const lineLayout = pastActivityFunctions.getChartLayout("line");
        const barLayout = pastActivityFunctions.getChartLayout("bar");

        assert.equal(barLayout.plotLeft > lineLayout.plotLeft, true);
        assert.equal(barLayout.plotWidth < lineLayout.plotWidth, true);
    })));

    failed += Number(!(await runTest("past-activity.js unit tests: category breakdown sorts counts and exposes percentages", () => {
        const breakdown = pastActivityFunctions.buildCategoryBreakdown([
            { category: "Fitness" },
            { category: "Fitness" },
            { category: "Learning" },
            { category: "" }
        ]);

        assert.deepEqual(
            JSON.parse(JSON.stringify(breakdown)),
            [
                { category: "Fitness", count: 2, percentage: 50 },
                { category: "Learning", count: 1, percentage: 25 },
                { category: "Uncategorized", count: 1, percentage: 25 }
            ]
        );
        assert.equal(pastActivityFunctions.describePercentage(49.6), "50%");
    })));

    failed += Number(!(await runTest("past-activity.js unit tests: streak helpers calculate latest and best streak progress", () => {
        const dates = pastActivityFunctions.getUniqueActivityDates([
            { completionDate: "2026-04-01" },
            { completionDate: "2026-04-02" },
            { completionDate: "2026-04-03" },
            { completionDate: "2026-04-06" },
            { completionDate: "2026-04-07" }
        ]);
        const progress = pastActivityFunctions.buildStreakProgress([
            { completionDate: "2026-04-01" },
            { completionDate: "2026-04-02" },
            { completionDate: "2026-04-03" },
            { completionDate: "2026-04-06" },
            { completionDate: "2026-04-07" }
        ]);

        assert.deepEqual([...dates], ["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-06", "2026-04-07"]);
        assert.equal(pastActivityFunctions.calculateLongestStreakFromDates(dates), 3);
        assert.equal(pastActivityFunctions.calculateLatestStreakFromDates(dates), 2);
        assert.deepEqual(
            JSON.parse(JSON.stringify(progress)),
            { latestStreak: 2, bestStreak: 3, percentage: 67, activeDays: 5 }
        );
    })));

    failed += Number(!(await runTest("past-activity.js unit tests: donut chart svg includes category percentages", () => {
        const markup = pastActivityFunctions.buildDonutChartSvg([
            { category: "Fitness", count: 3, percentage: 60 },
            { category: "Learning", count: 2, percentage: 40 }
        ]);

        assert.match(markup, /Fitness/);
        assert.match(markup, /60%/);
        assert.match(markup, /chart-donut-slice/);
        assert.match(markup, /chart-donut-total/);
    })));

    failed += Number(!(await runTest("past-activity.js unit tests: progress donut svg includes streak summary values", () => {
        const markup = pastActivityFunctions.buildProgressDonutSvg({
            latestStreak: 4,
            bestStreak: 5,
            percentage: 80,
            activeDays: 9
        });

        assert.match(markup, /4d/);
        assert.match(markup, /80% of best/);
        assert.match(markup, /Best streak in view/);
        assert.match(markup, /chart-donut-progress/);
    })));

    return failed;
};
