// Minimal promotional artwork with unmodified, high-density captures of the real UI.
const fs = require('node:fs');
const path = require('node:path');
const slides = [
  { title: 'Hear the time. Keep your flow.', panel: '#singleSoundSection' },
  { title: 'Your timing. Your sound.', panel: '#singleTimerSection' },
  { title: 'Two timers. One clear cue.', panel: '#dualTimerSection' }
];
async function captureStoreArtwork(source, context, output, index) {
  const slide = slides[index];
  const status = await source.locator('.section').first().screenshot();
  const details = await source.locator(slide.panel).screenshot();
  const icon = fs.readFileSync(path.join(__dirname, '..', 'icons/icon128.png')).toString('base64');
  const png = bytes => `data:image/png;base64,${bytes.toString('base64')}`;
  const page = await context.newPage();
  const render = async (width, height, html, filename) => {
    await page.setViewportSize({ width, height });
    await page.setContent(html);
    await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
    await page.screenshot({ path: path.join(output, filename), fullPage: false, scale: 'css' });
  };
  await render(1280, 800, `<!doctype html><html lang="en"><meta charset="UTF-8"><style>
  *{box-sizing:border-box}body{margin:0;width:1280px;height:800px;overflow:hidden;background:radial-gradient(ellipse at 100% 0%,#d8eee5,#f3f4ef 68%);color:#182e36;font-family:Arial,sans-serif;padding:42px 64px}
  .brand{display:flex;align-items:center;gap:11px;font-size:18px;font-weight:700}.brand img{width:32px;height:32px;border-radius:8px}h1{font-size:49px;line-height:1.1;letter-spacing:-1.8px;margin:30px 0 0}
  .ui{position:absolute;top:215px;left:128px;right:128px;bottom:72px;display:flex;justify-content:center;align-items:center;gap:64px}.ui img{display:block;width:420px;max-height:490px;object-fit:contain;filter:drop-shadow(0 16px 22px #193f3222);border-radius:12px}.caption{position:absolute;bottom:29px;left:64px;font-size:12px;color:#627772}
  </style><div class="brand"><img src="data:image/png;base64,${icon}">Airplane Chime Timer</div><h1>${slide.title}</h1><div class="ui"><img src="${png(status)}"><img src="${png(details)}"></div><div class="caption">Actual interface · selected sections</div></html>`, `store-${index+1}.png`);
  if (index === 0) {
    await render(440,280,`<!doctype html><style>*{box-sizing:border-box}body{margin:0;background:#e8f2ed;font-family:Arial,sans-serif;color:#183c40;width:440px;height:280px;padding:26px 30px}.brand{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:700}img{width:32px;height:32px;border-radius:8px}h1{font-size:42px;line-height:1.04;letter-spacing:-1.5px;margin:36px 0 0}</style><div class=brand><img src="data:image/png;base64,${icon}">Airplane Chime Timer</div><h1>Hear the time.<br>Keep your flow.</h1>`,'store-small-tile.png');
    await render(1400,560,`<!doctype html><style>*{box-sizing:border-box}body{margin:0;background:linear-gradient(110deg,#f3f4ef,#dceee5);font-family:Arial,sans-serif;color:#183c40;width:1400px;height:560px;padding:48px 70px}.brand{display:flex;align-items:center;gap:14px;font-size:21px;font-weight:700}.brand img{width:40px;height:40px;border-radius:10px}h1{font-size:66px;line-height:1.05;letter-spacing:-2px;margin:80px 0 0}.ui{position:absolute;right:100px;top:66px;text-align:center}.ui img{height:390px;border-radius:12px;filter:drop-shadow(0 20px 22px #193f3228)}.caption{font-size:12px;margin-top:20px;color:#627772}</style><div class=brand><img src="data:image/png;base64,${icon}">Airplane Chime Timer</div><h1>Hear the time.<br>Keep your flow.</h1><div class=ui><img src="${png(status)}"><div class=caption>Actual interface · selected section</div></div>`,'store-marquee.png');
  }
  await page.close();
}
module.exports = { captureStoreArtwork };
