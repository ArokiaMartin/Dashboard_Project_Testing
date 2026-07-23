const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Capture all network requests and responses
  const networkErrors = [];
  page.on('response', resp => {
    if (!resp.ok() && resp.status() !== 304) {
      networkErrors.push(`${resp.status()} ${resp.url()}`);
      console.log(`[NETWORK ERROR] ${resp.status()} - ${resp.url()}`);
    }
  });

  // Capture console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });

  // Capture page errors and exceptions
  page.on('pageerror', error => {
    console.log(`[PAGE ERROR] ${error.message}`);
    console.log(`[PAGE ERROR STACK] ${error.stack}`);
  });

  try {
    console.log('🔄 Navigating to localhost:4200/builder...');
    await page.goto('http://localhost:4200/builder', { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log('✅ Page loaded');

    // Wait for the dataset dropdown to appear
    console.log('⏳ Waiting for page to fully initialize...');
    await page.waitForTimeout(3000);

    // Get all text content to understand page structure
    const bodyText = await page.textContent('body');
    if (bodyText.includes('AVAILABLE COLUMNS')) {
      console.log('✅ AVAILABLE COLUMNS section found');
    } else {
      console.log('⚠️  AVAILABLE COLUMNS section NOT found');
    }

    if (bodyText.includes('order_id')) {
      console.log('✅ order_id column found');
    } else {
      console.log('⚠️  order_id column NOT found');
    }

    if (bodyText.includes('sales')) {
      console.log('✅ sales column found');
    } else {
      console.log('⚠️  sales column NOT found');
    }

    // Try to select columns by finding them in the page
    console.log('\n📍 Trying to select columns...');

    const colButtons = await page.$$('.col-item');
    console.log(`Found ${colButtons.length} column buttons`);

    if (colButtons.length > 0) {
      // Find and click order_id
      for (let btn of colButtons) {
        const text = await btn.textContent();
        if (text.includes('order_id')) {
          console.log('📍 Clicking order_id...');
          await btn.click();
          await page.waitForTimeout(500);
          break;
        }
      }

      // Find and click sales
      for (let btn of colButtons) {
        const text = await btn.textContent();
        if (text.includes('sales')) {
          console.log('📍 Clicking sales...');
          await btn.click();
          await page.waitForTimeout(500);
          break;
        }
      }
    }

    // Look for "Add filter" button
    console.log('\n📍 Looking for "+ Add filter" button...');
    const addFilterBtn = await page.$('text=+ Add filter');

    if (addFilterBtn) {
      console.log('✅ Found "+ Add filter" button');
      console.log('📍 Clicking "+ Add filter"...');
      await addFilterBtn.click();
      await page.waitForTimeout(1000);

      // Now try to set filter values
      console.log('📍 Setting filter value to 600...');
      const inputs = await page.$$('input');
      if (inputs.length > 0) {
        // Try to find the filter value input
        for (let input of inputs) {
          const type = await input.getAttribute('type');
          const placeholder = await input.getAttribute('placeholder');
          if (placeholder && placeholder.includes('Value')) {
            console.log('📍 Found filter value input, typing 600...');
            await input.type('600');
            await page.waitForTimeout(500);
            break;
          }
        }
      }

      // Try to find TABLE button
      console.log('\n📍 Looking for TABLE visualization...');
      const tableBtn = await page.$('text=TABLE');
      if (tableBtn) {
        console.log('✅ Found TABLE button');
        console.log('📍 Clicking TABLE...');
        await tableBtn.click();
        await page.waitForTimeout(3000);
        console.log('✅ TABLE clicked successfully');

        // Now try BAR CHART
        console.log('\n🔴 NOW TESTING BAR CHART (this is where it hangs)...');
        const barBtn = await page.$('text=BAR CHART');
        if (barBtn) {
          console.log('✅ Found BAR CHART button');
          console.log('📍 Clicking BAR CHART...');

          const clickStart = Date.now();
          const clickPromise = barBtn.click();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('BAR CHART click timed out after 10 seconds')), 10000)
          );

          try {
            await Promise.race([clickPromise, timeoutPromise]);
            console.log(`✅ BAR CHART click responded in ${Date.now() - clickStart}ms`);
            await page.waitForTimeout(3000);
            console.log(`✅ BAR CHART loaded successfully`);
          } catch (err) {
            console.log(`\n❌ ERROR: ${err.message}`);
            console.log(`⏱️  BAR CHART hang detected after ${Date.now() - clickStart}ms`);

            // Try to get page info
            console.log('\n📋 DEBUGGING - Checking page state:');
            const netErrors = networkErrors;
            if (netErrors.length > 0) {
              console.log('🌐 Network errors detected:');
              netErrors.forEach(err => console.log('  - ' + err));
            }

            // Take screenshot
            await page.screenshot({ path: 'error_screenshot.png' });
            console.log('📸 Screenshot saved to error_screenshot.png');
          }
        } else {
          console.log('❌ BAR CHART button not found');
        }
      } else {
        console.log('❌ TABLE button not found');
      }
    } else {
      console.log('❌ "+ Add filter" button not found');
    }

  } catch (error) {
    console.error('\n❌ Critical test error:', error.message);
  } finally {
    console.log('\n🔴 Closing browser in 3 seconds...');
    await page.waitForTimeout(3000);
    await browser.close();
  }
})();
