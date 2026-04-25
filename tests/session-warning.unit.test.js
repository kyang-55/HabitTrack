const fs = require("fs");
const path = require("path");
const { assert, runTest } = require("./helpers/test-harness");

module.exports = async function runSessionWarningUnitTests() {
    let failed = 0;
    const filePath = path.join(process.cwd(), "public", "scripts", "session-warning.js");
    const source = fs.readFileSync(filePath, "utf8");

    failed += Number(!(await runTest("session-warning.js unit tests: inactivity warning copy mentions 10 minutes and lost progress prevention", () => {
        assert.match(source, /about 10 minutes of inactivity/i);
        assert.match(source, /do not lose your progress/i);
    })));

    failed += Number(!(await runTest("session-warning.js unit tests: activity listeners include typing and focus changes", () => {
        assert.match(source, /"input"/);
        assert.match(source, /"focusin"/);
    })));

    failed += Number(!(await runTest("session-warning.js unit tests: warning dispatches a session-warning event", () => {
        assert.match(source, /habittrack:session-warning/);
        assert.match(source, /warningEndsAt/);
    })));

    return failed;
};
