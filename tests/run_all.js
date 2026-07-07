/*
 * 测试聚合运行器
 * 创作者：夜
 */

var path = require("path");
var fs = require("fs");

var TESTS = [
  "test_event_bus.js",
  "test_metrics.js",
  "test_evolution_core.js",
  "test_module_manager.js",
  "test_stability_signal.js",
  "test_ipc_compat.js"
];

var passed = 0, failed = 0, total = 0;

TESTS.forEach(function (testFile) {
  var full = path.resolve(__dirname, testFile);
  if (!fs.existsSync(full)) {
    console.log("SKIP  " + testFile + " (不存在)");
    return;
  }
  console.log("=== " + testFile + " ===");
  // 子进程方式运行，隔离每个测试文件
  try {
    var { execSync } = require("child_process");
    var out = execSync('node "' + full + '"', { encoding: "utf8", cwd: path.resolve(__dirname, "..") });
    process.stdout.write(out);
    // 统计 PASS/FAIL
    var lines = out.split("\n");
    lines.forEach(function (line) {
      if (/\bPASS\b/.test(line)) { passed++; total++; }
      if (/\bFAIL\b/.test(line)) { failed++; total++; }
    });
  } catch (e) {
    process.stdout.write(e.stdout || "");
    process.stderr.write(e.stderr || "");
    console.log("ERROR  " + testFile + " 进程异常退出 code=" + e.status);
    failed++;
    total++;
  }
  console.log("");
});

console.log("=== 汇总 ===");
console.log("总计: " + total + "  通过: " + passed + "  失败: " + failed);
if (failed > 0) {
  process.exit(1);
}
