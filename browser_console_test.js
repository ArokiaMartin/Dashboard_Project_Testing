// Run this in your browser console (F12 > Console tab)
// Copy and paste this entire script

console.clear();
console.log('🔴 HANG TEST STARTED - Sales > 600 Filter');
console.log('========================================');

// Capture all logs
const allLogs = [];
const originalLog = console.log;
const originalError = console.error;

console.log = function(...args) {
  originalLog.apply(console, args);
  allLogs.push('[LOG] ' + args.join(' '));
};

console.error = function(...args) {
  originalError.apply(console, args);
  allLogs.push('[ERROR] ' + args.join(' '));
};

// Wait a moment, then look for Bar Chart button
setTimeout(() => {
  originalLog('📍 Looking for BAR CHART button...');
  const buttons = document.querySelectorAll('button');
  let barChartBtn = null;

  for (let btn of buttons) {
    if (btn.textContent.includes('BAR CHART')) {
      barChartBtn = btn;
      originalLog('✅ Found BAR CHART button');
      break;
    }
  }

  if (!barChartBtn) {
    originalLog('❌ BAR CHART button not found');
    originalLog('Available buttons:', Array.from(buttons).map(b => b.textContent.trim()).join(', '));
    return;
  }

  // Click it and measure
  originalLog('\n🔴 CLICKING BAR CHART at', new Date().toLocaleTimeString());
  const clickTime = Date.now();
  const startLogs = allLogs.length;

  barChartBtn.click();

  // Check every 100ms for 30 seconds
  let responseDetected = false;
  const checkInterval = setInterval(() => {
    const elapsed = Date.now() - clickTime;
    const newLogs = allLogs.slice(startLogs);

    if (newLogs.length > 0 && !responseDetected) {
      responseDetected = true;
      originalLog(`\n✅ PAGE RESPONDING after ${elapsed}ms`);
      originalLog('Recent logs:', newLogs.slice(-3));
    }

    if (elapsed > 30000) {
      clearInterval(checkInterval);
      originalLog(`\n❌ HANG CONFIRMED after ${elapsed}ms (30 seconds)`);
      originalLog('\n📋 ALL CAPTURED LOGS:');
      originalLog(allLogs.join('\n'));

      // Try to show error
      originalLog('\n📋 Page error listeners:');
      window.addEventListener('error', (e) => {
        originalLog('PAGE ERROR:', e.message);
      });
    }
  }, 100);

}, 100);

originalLog('⏳ Test initiated. Monitoring for response...');
