// Promotional artwork embeds unmodified screenshots of the tested extension UI.
const fs = require('node:fs');
const path = require('node:path');
const slides = [
  { title: 'Hear the time.<br>Keep your flow.', intro: 'Airplane-style chimes for your day,<br>without popup notifications.', tag: 'A familiar sound. A useful reminder.', panel: '#singleSoundSection', chips: ['Preview your chime', 'Choose your volume'], note: 'Choose a quieter sound and lower volume for a gentle cue.' },
  { title: 'Your timing.<br>Your sound.', intro: 'Choose a custom interval or daily reminder.<br>Add your own audio.', tag: 'Make room for your next small pause.', panel: '#singleTimerSection', chips: ['1–1,440 minutes', 'One-time or daily'], note: 'Example: a 25-minute repeating reminder, not an automatic 25/5 cycle.' },
  { title: 'Two timers.<br>One clear cue.', intro: 'Give each interval its own sound.<br>Stay aware of short and long stretches.', tag: 'Two rhythms, without overlapping chimes.', panel: '#dualTimerSection', chips: ['Two intervals', 'Different sounds'], note: 'When both timers are due, the longer timer takes priority.' }
];
async function captureStoreArtwork(source, context, output, index) {
  const slide = slides[index];
  const status = await source.locator('.section').first().screenshot();
  const details = await source.locator(slide.panel).screenshot();
  const icon = fs.readFileSync(path.join(__dirname, '..', 'icons/icon128.png')).toString('base64');
  const png = bytes => `data:image/png;base64,${bytes.toString('base64')}`;
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<!doctype html><html lang="en"><meta charset="UTF-8"><style>
  *{box-sizing:border-box} body{margin:0;width:1280px;height:800px;overflow:hidden;background:#f3f4ef;color:#182e36;font-family:Arial,sans-serif}
  .art{position:relative;width:1280px;height:800px;padding:58px 64px;background:radial-gradient(ellipse at 100% 0%,#d8eee5 0%,transparent 57%)}
  .brand{display:flex;align-items:center;gap:13px;font-size:20px;font-weight:700;letter-spacing:-.4px}.brand img{width:38px;height:38px;border-radius:10px}.eyebrow{margin-top:76px;color:#28766a;font-size:15px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase}
  h1{font-size:63px;line-height:1.04;letter-spacing:-2.8px;margin:20px 0 25px;width:600px} .intro{font-size:22px;line-height:1.5;margin:0;color:#40565b;max-width:590px}.chips{display:flex;gap:10px;margin-top:32px}.chip{border:1px solid #b9d4c9;border-radius:24px;padding:12px 18px;font-size:15px;font-weight:700;background:#fff8}
  .note{position:absolute;left:64px;bottom:100px;font-size:15px;line-height:1.5;max-width:530px;color:#456065}.footer{position:absolute;bottom:38px;left:64px;right:64px;display:flex;justify-content:space-between;border-top:1px solid #ccdad4;padding-top:19px;font-size:13px;color:#52696b}
  .ui{position:absolute;right:78px;top:115px;width:376px;display:flex;flex-direction:column;gap:18px;align-items:center}.ui img{display:block;width:auto;max-width:376px;object-fit:contain;filter:drop-shadow(0 12px 16px #193f3220);border-radius:9px}.ui .status{max-height:284px}.ui .details{max-height:305px}.ui-label{font-size:12px;color:#5d7373;letter-spacing:.25px;margin-top:0}
  </style><div class="art"><div class="brand"><img src="data:image/png;base64,${icon}">Airplane Chime Timer</div><div class="eyebrow">${slide.tag}</div><h1>${slide.title}</h1><p class="intro">${slide.intro}</p><div class="chips">${slide.chips.map(t=>`<div class="chip">${t}</div>`).join('')}</div><p class="note">${slide.note}</p><div class="ui"><img class="status" src="${png(status)}"><img class="details" src="${png(details)}"><div class="ui-label">Actual extension interface · selected sections</div></div><div class="footer"><span>Chrome running + device awake. Close the popup after setup.</span><span>No account · No product analytics</span></div></div></html>`);
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  await page.screenshot({ path: path.join(output, `store-${index + 1}.png`), fullPage: false });
  if (index === 0) {
    await page.setViewportSize({ width: 440, height: 280 });
    await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;background:#e8f2ed;font-family:Arial,sans-serif;color:#183c40;width:440px;height:280px;padding:26px 30px}.brand{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:700}img{width:32px;height:32px;border-radius:8px}h1{font-size:42px;line-height:1.04;letter-spacing:-1.5px;margin:27px 0 19px}p{font-size:15px;margin:0;color:#37605e}</style><div class=brand><img src="data:image/png;base64,${icon}">Airplane Chime Timer</div><h1>Hear the time.<br>Keep your flow.</h1><p>Hourly · Custom · Daily reminders</p>`);
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    await page.screenshot({ path: path.join(output, 'store-small-tile.png') });
    await page.setViewportSize({ width: 1400, height: 560 });
    await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;background:linear-gradient(110deg,#f3f4ef,#dceee5);font-family:Arial,sans-serif;color:#183c40;width:1400px;height:560px;padding:48px 70px}.brand{display:flex;align-items:center;gap:14px;font-size:22px;font-weight:700}.brand img{width:42px;height:42px;border-radius:10px}h1{font-size:68px;line-height:1.04;letter-spacing:-2px;margin:48px 0 24px}p{font-size:24px;line-height:1.5;margin:0;color:#37605e}.ui{position:absolute;right:100px;top:66px;text-align:center}.ui img{height:375px;border-radius:12px;filter:drop-shadow(0 20px 22px #193f3228)}.caption{font-size:13px;margin-top:18px;color:#52696b}.footer{position:absolute;left:70px;bottom:35px;font-size:14px;color:#52696b}</style><div class=brand><img src="data:image/png;base64,${icon}">Airplane Chime Timer</div><h1>Hear the time.<br>Keep your flow.</h1><p>Hourly, custom, and daily chimes.<br>No popup notifications.</p><div class=ui><img src="${png(status)}"><div class=caption>Actual extension interface · selected section</div></div><div class=footer>Chrome running + device awake · No account · No product analytics</div>`);
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    await page.screenshot({ path: path.join(output, 'store-marquee.png') });
  }
  await page.close();
}
module.exports = { captureStoreArtwork };
