const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Capture console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    console.log(`[CONSOLE ${msg.type()}] ${msg.text()}`);
  });

  // Capture errors
  page.on('error', err => {
    console.log('[PAGE ERROR]', err);
  });

  // Capture dialog
  page.on('dialog', async dialog => {
    console.log('[DIALOG]', dialog.message());
    await dialog.dismiss();
  });

  try {
    console.log('🔄 Navigating to localhost:4200...');
    await page.goto('http://localhost:4200/builder', { waitUntil: 'networkidle' });

    console.log('✅ Page loaded');

    // Wait for available columns to load
    await page.waitForSelector('.col-item', { timeout: 5000 });
    console.log('✅ Available columns loaded');

    // Select order_id column
    console.log('📍 Clicking order_id column...');
    await page.click('text=order_id');
    await page.waitForTimeout(500);

    // Select sales column
    console.log('📍 Clicking sales column...');
    await page.click('text=sales');
    await page.waitForTimeout(500);

    // Add filter
    console.log('📍 Clicking + Add filter...');
    await page.click('text=+ Add filter');
    await page.waitForTimeout(1000);

    // Set filter value to sales > 600
    console.log('📍 Setting filter operator to >...');
    const operatorSelect = await page.$('.af-op');
    if (operatorSelect) {
      await operatorSelect.selectOption('gt');
    }
    await page.waitForTimeout(500);

    console.log('📍 Entering filter value 600...');
    const valueInput = await page.$('.af-val');
    if (valueInput) {
      await valueInput.type('600');
    }
    await page.waitForTimeout(500);

    // Click Table - should work
    console.log('📍 Clicking TABLE...');
    const startTable = Date.now();
    await page.click('text=TABLE');

    // Wait a bit to see if it loads
    await page.waitForTimeout(3000);
    const tableTime = Date.now() - startTable;
    console.log(`✅ TABLE clicked, responded in ${tableTime}ms`);

    // Click Bar Chart - this hangs
    console.log('📍 Clicking BAR CHART (this is where it hangs)...');
    const startBar = Date.now();

    // Set a timeout to catch if it hangs
    const chartClickPromise = page.click('text=BAR CHART');
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Bar chart click timeout after 10 seconds')), 10000)
    );

    try {
      await Promise.race([chartClickPromise, timeoutPromise]);
      await page.waitForTimeout(3000);
      const barTime = Date.now() - startBar;
      console.log(`✅ BAR CHART clicked, responded in ${barTime}ms`);
    } catch (err) {
      const barTime = Date.now() - startBar;
      console.log(`❌ BAR CHART HUNG after ${barTime}ms - ${err.message}`);

      // Try to check page state
      console.log('\n📋 DEBUGGING INFO:');

      // Check if page is responsive
      try {
        const title = await page.title();
        console.log(`📄 Page title: ${title}`);
      } catch (e) {
        console.log('❌ Cannot read page title - page might be unresponsive');
      }

      // Take screenshot
      console.log('📸 Taking screenshot...');
      await page.screenshot({ path: 'debug_screenshot.png' });
      console.log('✅ Screenshot saved to debug_screenshot.png');

      // Try to get console logs even during hang
      console.log('\n📋 Console logs so far:');
      consoleLogs.forEach(log => console.log('  ' + log));
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);
  } finally {
    console.log('\n🔴 Closing browser in 5 seconds...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
})();
