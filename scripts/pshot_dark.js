const puppeteer = require('/tmp/node_modules/puppeteer-core');
const BASE = 'https://full-width-booking.preview.emergentagent.com';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--window-size=412,900'],
    defaultViewport: { width: 412, height: 900 } });
  const page = await browser.newPage();
  const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('#root').firstElementChild || document.body).backgroundColor).catch(()=> '?');
  try {
    await page.goto(`${BASE}/(auth)/welcome`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('[data-testid="welcome-login-btn"]', { timeout: 60000 });
    await page.click('[data-testid="welcome-login-btn"]');
    await page.waitForSelector('[data-testid="login-phone-input"]', { timeout: 60000 });
    await page.click('[data-testid="login-phone-input"]');
    await page.type('[data-testid="login-phone-input"]', '9000000003', { delay: 30 });
    await page.click('[data-testid="send-otp-btn"]');
    await page.waitForSelector('[data-testid="login-otp-input"]', { timeout: 60000 });
    await sleep(1200);
    await page.click('[data-testid="verify-otp-btn"]');
    await sleep(6000);
    // FIRST click on theme toggle should flip to dark
    await page.waitForSelector('[data-testid="theme-toggle"]', { timeout: 30000 });
    await page.click('[data-testid="theme-toggle"]');
    await sleep(1500);
    await page.screenshot({ path: '/tmp/t1_dashboard_dark.png' });
    const ovr = await page.evaluate(() => window.localStorage.getItem('azo_theme_override'));
    console.log('localStorage azo_theme_override =', ovr);
    // Now full-page navigate to rewards — dark must persist
    await page.goto(`${BASE}/(partner)/partner/rewards`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(6000);
    await page.screenshot({ path: '/tmp/t2_rewards_after_reload.png' });
    console.log('done');
  } catch (e) { console.log('ERR', String(e).slice(0,200)); await page.screenshot({path:'/tmp/t_err.png'}).catch(()=>{}); }
  finally { await browser.close(); }
})();
