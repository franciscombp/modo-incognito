import { chromium } from 'playwright';

const builders = [
  { name: 'personajes', url: 'http://localhost:4173/creador/personajes/' },
  { name: 'mapas', url: 'http://localhost:4173/creador/mapas/' },
  { name: 'musica', url: 'http://localhost:4173/creador/musica/' },
  { name: 'pantallas', url: 'http://localhost:4173/creador/pantallas/' }
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium'
});

for (const { name, url } of builders) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `/tmp/builder-${name}.png`, fullPage: true });
  await page.close();
  console.log(`Screenshot: builder-${name}.png`);
}

await browser.close();
