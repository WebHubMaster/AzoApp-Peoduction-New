// Puppeteer harness: log in as a partner on the Expo-web build and capture screens.
// Usage: node /app/scripts/pshot.js
const puppeteer = require('/tmp/node_modules/puppeteer-core');

const BASE = 'https://customer-booking-ui.preview.emergentagent.com';
const CHROME = '/usr/bin/google-chrome';
const OUT = '/tmp';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function shot(page, name) {
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot', name);
}

async function waitTid(page, tid, timeout = 60000) {
  const sel = `[data-testid="${tid}"]`;
  await page.waitForSelector(sel, { timeout });
  return sel;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=412,900'],
    defaultViewport: { width: 412, height: 900 },
  });
  const page = await browser.newPage();
  page.on('console', m => { const t = m.type(); if (t === 'error') console.log('PAGE-ERR:', m.text().slice(0,160)); });

  try {
    console.log('goto welcome...');
    await page.goto(`${BASE}/(auth)/welcome`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitTid(page, 'welcome-login-btn');
    await shot(page, '01_welcome');
    await page.click('[data-testid="welcome-login-btn"]');

    const phoneSel = await waitTid(page, 'login-phone-input');
    await page.click(phoneSel);
    await page.type(phoneSel, '9000000003', { delay: 40 });
    await shot(page, '02_login_phone');
    await page.click('[data-testid="send-otp-btn"]');

    // OTP step — demo mode auto-fills dev otp into state; ensure value then verify.
    await waitTid(page, 'login-otp-input');
    await sleep(1500);
    // type the otp explicitly in case auto-fill differs
    const otpVal = await page.$eval('[data-testid="login-otp-input"]', el => el.value).catch(() => '');
    if (!otpVal || otpVal.length < 4) {
      await page.click('[data-testid="login-otp-input"]');
      await page.type('[data-testid="login-otp-input"]', '123456', { delay: 40 });
    }
    await shot(page, '03_otp');
    await page.click('[data-testid="verify-otp-btn"]');
    await sleep(6000);
    await shot(page, '04_after_login');
    console.log('URL after login:', page.url());

    // Capture partner screens by client-side navigation via direct URL (token persists in localStorage)
    const routes = [
      ['/(partner)', '05_partner_home'],
      ['/(partner)/partner/rewards', '06_rewards'],
      ['/(partner)/partner/availability', '07_availability'],
      ['/(partner)/partner/starter-kit', '08_starter_kit'],
    ];
    for (const [r, name] of routes) {
      try {
        await page.goto(`${BASE}${r}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await sleep(5000);
        await shot(page, name);
        console.log('captured', r, '->', page.url());
      } catch (e) { console.log('route fail', r, String(e).slice(0,120)); }
    }
  } catch (e) {
    console.log('FATAL', String(e).slice(0, 300));
    await page.screenshot({ path: `${OUT}/99_fatal.png` }).catch(()=>{});
  } finally {
    await browser.close();
  }
})();
