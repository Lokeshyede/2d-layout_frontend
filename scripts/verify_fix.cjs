const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        await page.setViewport({ width: 1920, height: 1080 });
        console.log('Navigating to product preview...');
        
        await page.goto('http://localhost:5173/dev/product-preview/RF-PRD-0008', { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Wait for 3D model to fully load and render
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Capture a screenshot
        await page.screenshot({ path: 'corner_fix_verification.png', fullPage: true });
        console.log('Screenshot saved to corner_fix_verification.png');
        
        // Capture browser console logs for our GAP DETECTED message
        const logs = await page.evaluate(() => {
            return window.console.logs || []; // assuming Vite / dev environment doesn't strictly buffer all, let's just dump
        });
        
        await browser.close();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
