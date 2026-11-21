// Приёмочный сценарий из раздела 8 спецификации, раздела 8 дополнения «Свои роли» (шаг 12)
// и этапов 1 и 2 дополнения «Механики партии и новые роли» (шаги 13 и 14) на собранном dist/index.html, открытом с диска (file://).
// Запуск: npm run build && npm run acceptance
// Управляет установленным Chrome без окна через протокол DevTools: настоящие клики мыши и клавиши.
// Зависимостей нет. Раздача случайная, поэтому сценарий читает роли со стола и подбирает номера сам.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const FILE = resolve('dist/index.html')
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(FILE)) throw new Error('Нет dist/index.html: сначала npm run build')
if (!existsSync(CHROME)) throw new Error(`Не найден Chrome: ${CHROME} (путь можно задать переменной CHROME_PATH)`)

const profile = mkdtempSync(join(tmpdir(), 'mafia-acceptance-'))
const problems = []      // ошибки консоли и исключения страницы
const network = []       // любые запросы не к file:
let chrome, ws, nextId = 1
const pending = new Map()

async function launch() {
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--window-size=1440,900', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
  let target
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(150)
    try {
      target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')
    } catch { /* Chrome ещё поднимается */ }
  }
  if (!target) throw new Error('Chrome не ответил по протоколу DevTools')
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail })
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
    if (msg.method === 'Runtime.exceptionThrown') problems.push('исключение: ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text))
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') problems.push('консоль: ' + msg.params.entry.text)
    if (msg.method === 'Network.requestWillBeSent' && !/^(file|data|blob|about):/.test(msg.params.request.url)) network.push(msg.params.request.url)
  }
  for (const domain of ['Page', 'Runtime', 'Log', 'Network']) await cdp(`${domain}.enable`)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
}

function cdp(method, params = {}) {
  const id = nextId++
  return new Promise((ok, fail) => {
    pending.set(id, (msg) => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function quit() {
  const exited = new Promise((r) => chrome.once('exit', r))
  try { await cdp('Browser.close') } catch { chrome.kill() }
  await Promise.race([exited, sleep(5000)])
}

async function js(expression) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
  return r.result.value
}

const HELPERS = `
  // Имя кнопки, как его слышит программа чтения: без подсказок клавиш и значков (aria-hidden).
  window.__label = (e) => (e.getAttribute('aria-label') || [...e.childNodes]
    .filter((n) => !(n.nodeType === 1 && n.getAttribute('aria-hidden') === 'true')).map((n) => n.textContent).join(' ')).trim().replace(/\\s+/g, ' ');
  window.__find = (name) => {
    const root = document.querySelector('[role=dialog]') || document;
    const els = [...root.querySelectorAll('button,[role=menuitem],[role=radio]')]
      .filter((e) => !e.disabled && e.getAttribute('aria-disabled') !== 'true' && e.getClientRects().length > 0);
    return els.find((e) => __label(e) === name) || els.find((e) => __label(e).startsWith(name)) || null;
  };
  window.__rect = (name) => {
    const e = __find(name); if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  true`

async function open() {
  await cdp('Page.navigate', { url: pathToFileURL(FILE).href })
  for (let i = 0; i < 60; i++) {
    await sleep(100)
    if (await js(`document.readyState === 'complete' && document.querySelectorAll('button').length > 0`).catch(() => false)) break
  }
  await js(HELPERS)
}

/** Настоящий клик мышью по кнопке с таким названием (точное совпадение, затем по началу). */
async function click(name) {
  const p = await js(`__rect(${JSON.stringify(name)})`)
  if (!p) throw new Error(`на экране нет кнопки «${name}»`)
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await cdp('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 })
  }
  await sleep(90)
}
/** Главная кнопка не реагирует 0,4 с после смены подписи — ждём, как ждал бы ведущий. */
async function main(name) { await sleep(460); await click(name) }
async function key(key, code, vk) {
  await sleep(460)
  for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, text: type === 'keyDown' && key.length === 1 ? key : undefined })
  await sleep(90)
}
const enter = () => key('Enter', 'Enter', 13)
// textContent, а не innerText: заголовки набраны заглавными через CSS, а сверяем исходный текст.
const has = (text) => js(`document.body.textContent.includes(${JSON.stringify(text)})`)
const exists = (name) => js(`!!__find(${JSON.stringify(name)})`)
const txt = (selector) => js(`(document.querySelector(${JSON.stringify(selector)})?.textContent ?? '').trim()`)
/** Кто начинает круг: №5, а если он к этому дню выбыл — следующий по кругу игрок в игре. Раздача случайная. */
const firstFrom5 = (alive) => alive.find((s) => s >= 5) ?? alive[0]
const where = async () => `${await txt('.game-phase .page-name')} · ${await txt('.game-phase .page-step')}`
const seconds = async () => { const [m, s] = (await txt('.timer-digits span')).split(':').map(Number); return m * 60 + s }
/** Роли и статусы со стола игрового экрана. */
const table = () => js(`[...document.querySelectorAll('.table-grid .card')].map((c) => ({
  seat: Number(c.querySelector('.card-num').innerText), role: (c.querySelector('.card-role')?.innerText ?? '').trim(), out: c.classList.contains('card-out') }))`)
const stepNav = (name) => js(`(() => { const b = [...document.querySelectorAll('.steps .step, .night-step')].find((e) => e.innerText.trim().startsWith(${JSON.stringify(name)})); if (!b) return false; b.click(); return true })()`)

/** Настоящий клик мышью по элементу, который вернуло выражение (для элементов без названия: отметки, выключатели формы). */
async function clickEl(expression) {
  const p = await js(`(() => { const e = ${expression}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  if (!p) throw new Error(`на экране нет элемента: ${expression}`)
  for (const kind of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await cdp('Input.dispatchMouseEvent', { type: kind, x: p.x, y: p.y, button: kind === 'mouseMoved' ? 'none' : 'left', clickCount: 1 })
  }
  await sleep(90)
}
// Итог ночи: строки «Покидают стол» (номер, отметка, причина, подпись), «Остаются в игре» и строка «Никто не покидает стол».
const ROW = `(r) => ({ seat: Number(r.querySelector('.result-seat').textContent.replace('№', '')), checked: r.querySelector('input')?.checked ?? null,
  text: r.querySelector('.result-main')?.textContent ?? '', note: r.querySelector('.result-note')?.textContent ?? '' })`
const leavingRows = () => js(`[...document.querySelectorAll('.result-row-out')].map(${ROW})`)
const stayingRows = () => js(`[...document.querySelectorAll('.result-row-stay')].map(${ROW})`)
const nobodyLeaves = () => txt('.result-row-empty')
const toggleMark = (seat) => clickEl(`document.querySelector('input[aria-label="№${seat} покидает стол"]')`)
// Окно утра «Объяви столу»: текст окна, строки под объявлением; «Объявил» нажимается после защиты от двойного нажатия.
const morning = () => js(`(() => { const d = document.querySelector('[role=dialog][aria-label="Объяви столу"]'); return d ? d.textContent : null })()`)
const morningLines = () => js(`[...document.querySelectorAll('.morning-line')].map((li) => [...li.children].map((c) => c.textContent).join(' '))`)
async function announce() {
  if ((await morning()) === null) throw new Error('окно утра не открылось')
  await main('Объявил')
}

const results = []
function check(step, what, ok, detail = '') {
  results.push({ step, what, ok: !!ok, detail })
  console.log(`${ok ? '  ok ' : ' FAIL'} шаг ${step}: ${what}${detail ? ' — ' + detail : ''}`)
}

async function run() {
  await launch()
  await open()

  // ── Шаг 1: создать игру, раздать, поменять роли двум номерам, начать День 1 с №5 ──
  await click('Новая игра')
  while (Number(await txt('.stepper-big .stepper-value')) < 11) await click('Больше игроков')
  while (Number(await txt('.stepper-big .stepper-value')) > 11) await click('Меньше игроков')
  await click('Мафия: больше')
  check(1, 'состав: 11 игроков, чёрных 3, красных 8', (await has('чёрных 3')) && (await has('красных 8')) && (await has('из них крёстный отец: 1')))
  await click('Раздать роли')
  const dealt = () => js(`[...document.querySelectorAll('.deal-card')].map((c) => c.querySelector('.deal-card-name')?.innerText.trim() + (c.innerText.includes('глава') ? ' · глава' : ''))`)
  const before = await dealt()
  const count = (list, role) => list.filter((r) => r === role).length
  check(1, 'раздача по составу: мафия, глава, проститутка, шериф, доктор, 6 мирных',
    count(before, 'мафия') === 1 && count(before, 'мафия · глава') === 1 && count(before, 'проститутка') === 1 && count(before, 'шериф') === 1 && count(before, 'доктор') === 1 && count(before, 'мирный житель') === 6, before.join(', '))
  // Меняем роли первому номеру и первому номеру с другой ролью.
  const other = before.findIndex((r) => r !== before[0]) + 1
  await click('Поменять роли двум номерам'); await click('Выбрать игрока №1'); await click(`Выбрать игрока №${other}`)
  const after = await dealt()
  check(1, `роли №1 и №${other} поменялись`, after[0] === before[other - 1] && after[other - 1] === before[0], `№1: ${before[0]} → ${after[0]}`)
  await main('Город просыпается: День 1')
  // Начинающего первый круг выбрало приложение; сценарию нужен №5 — ведущий выбирает другого.
  await click('Выбрать другого…'); await click('Выбрать игрока №5')
  await main('Дать слово №5')
  check(1, 'День 1 начат с №5, таймер речи идёт', (await where()) === 'День 1 · Круг речей' && (await txt('.timer-label')) === 'Речь №5' && (await has('говорит сейчас')))
  check(1, 'в День 1 нет кнопки «выставляет…»', !(await js(`[...document.querySelectorAll('button')].some((b) => b.innerText.includes('выставляет'))`)))
  for (let i = 0; i < 10; i++) await enter()                      // остальные десять речей — клавишей Enter
  check(1, 'круг пройден клавишей Enter, первые двое получают доп. минуту', (await exists('Доп. минута №5')) && (await has('Круг закрывают первые двое')), await txt('.facts'))
  await enter(); await enter()                                    // доп. минуты №5 и №6 — тоже клавишей Enter
  check(1, 'после доп. минут главная кнопка ведёт в ночь', await exists('Город засыпает: Ночь 1'), await txt('.facts'))
  await main('Город засыпает: Ночь 1')

  const t0 = await table()
  const seatOf = (role) => t0.find((p) => p.role === role).seat
  const S = seatOf('шериф'), G = seatOf('мафия · глава'), D = seatOf('доктор'), M = seatOf('мафия'), P = seatOf('проститутка')
  const C = t0.filter((p) => p.role === 'мирный житель').map((p) => p.seat)
  console.log(`   стол: шериф №${S}, глава №${G}, мафия №${M}, проститутка №${P}, доктор №${D}, мирные ${C.join(', ')}`)
  const healed = D === 4 ? 4 : C[2]                                 // в сценарии доктор лечит №4; если №4 не подходит — мирного

  // ── Шаг 2: Ночь 1 ──
  check(2, 'ночь начинается с проститутки', (await where()) === 'Ночь 1 · Проститутка', await where())
  await click('Никого')                                             // проститутка никого не блокирует
  await main('Дальше: Мафия'); await click(`Выбрать игрока №${C[0]}`)   // выстрел не в того
  await main('Дальше: Крёстный отец'); await click(`Выбрать игрока №${C[1]}`)
  check(2, 'крёстный отец ищет шерифа — ответ «не шериф»', (await txt('.answer-big')) === `№${C[1]} — не шериф`, await txt('.answer-big'))
  await main('Дальше: Шериф'); await click(`Выбрать игрока №${M}`)
  check(2, 'шериф проверил мафию — «чёрный»', (await txt('.answer-big')) === `№${M} — чёрный`)
  await main('Дальше: Доктор'); await click(`Выбрать игрока №${healed}`)
  await main('Итог ночи')
  const left2 = await leavingRows()
  const stay2 = await stayingRows()
  check(2, 'итог ночи: застреленный в списке «Покидают стол» с отметкой, вылеченный — в «Остаются в игре»',
    left2.length === 1 && left2[0].seat === C[0] && left2[0].checked && left2[0].text === 'Застрелен мафией'
    && stay2.length === 1 && stay2[0].seat === healed && stay2[0].text === 'Вылечен доктором' && stay2[0].note === 'в него не стреляли', JSON.stringify([left2, stay2]))
  await main(`№${C[0]} выбывает · начать День 2`)
  check(2, 'утром открыто окно «Объяви столу»: «Стол покидает игрок №…»', ((await morning()) ?? '').includes(`Стол покидает игрок №${C[0]}`), await morning())
  await announce()
  check(2, 'День 2 начат, застреленный выбыл', (await where()) === 'День 2 · Балаган' && (await table()).find((p) => p.seat === C[0]).out && (await morning()) === null)
  // Утром роли и журнал скрыты: чтобы исправить запись выстрела, ведущий открывает роли кнопкой.
  await click('Показать роли')
  await click('Ночь 1'); await click(`Мафия → №${C[0]}`); await click(`Выбрать игрока №${C[3]}`)
  check(2, 'после правки записи статусы не поменялись сами, есть предложение пересчитать',
    (await has(`Итог Ночи 1 теперь другой: выбыть должен №${C[3]}`)) && (await table()).find((p) => p.seat === C[0]).out && (await has('испр.')))
  await click('Исправить')
  const t2 = await table()
  check(2, 'принято: прежний в игре, новый застрелен', !t2.find((p) => p.seat === C[0]).out && t2.find((p) => p.seat === C[3]).out)
  await click('Ночь 1')                                             // свернуть группу обратно

  // ── Шаг 3: День 2 ──
  await main('Запустить балаган')
  check(3, 'балаган: таймер 60 с идёт', (await txt('.timer-label')) === 'Балаган' && (await txt('.timer-state')).startsWith('идёт'))
  await main('Выбрать, кто начинает круг')
  const alive2 = (await table()).filter((p) => !p.out).map((p) => p.seat)
  const first2 = firstFrom5(alive2)
  await click(`Выбрать игрока №${first2}`)
  const circle = [...alive2.filter((s) => s >= first2), ...alive2.filter((s) => s < first2)]
  const nominees = [C[0], M, P, C[1], C[2]]                         // пятеро выставленных, порядок важен
  const speak = async (i) => main(i === 0 ? 'Дать слово' : 'Следующий')
  for (let i = 0; i < 5; i++) {
    await speak(i)
    await click(`№${circle[i]} выставляет…`); await click(`Выбрать игрока №${nominees[i]}`)
  }
  check(3, 'выставлены пятеро в порядке выставления', (await js(`[...document.querySelectorAll('.nomination-seat')].map((e) => e.innerText).join(' ')`)) === nominees.map((n) => `№${n}`).join(' '))
  await speak(5)                                                    // этот говорящий никого не выставил
  await speak(6); await click(`№${circle[6]} выставляет…`); await click(`Выбрать игрока №${nominees[1]}`)
  check(3, 'попытка выставить уже выставленного', (await has(`№${nominees[1]} уже выставлен`)) && (await js(`document.querySelectorAll('.nomination').length`)) === 5)
  await sleep(2600)
  const s1 = await seconds()
  await click('+10 с'); const s2 = await seconds()
  check(3, 'таймер идёт по часам; «+10 с» добавляет десять секунд', s1 <= 58 && s1 >= 54 && s2 - s1 >= 9 && s2 - s1 <= 10, `${s1} с → ${s2} с`)
  await click('Пауза'); const s3 = await seconds(); await sleep(1300); const s4 = await seconds()
  check(3, 'пауза таймера посреди речи', s3 === s4 && (await txt('.timer-state')).startsWith('пауза') && (await exists('Продолжить')), `${s3} с и через 1,3 с ${s4} с`)
  await click('Продолжить')
  for (let i = 7; i < circle.length; i++) await speak(i)            // речи заканчиваются раньше нуля — следующим нажатием
  check(3, 'конец круга: «К оправданиям (выставлено 5)»', await exists('К оправданиям (выставлено 5)'))

  // ── Шаг 4: обновление страницы и закрытие браузера посреди оправдания ──
  await main('К оправданиям'); await main(`Оправдание №${nominees[0]}`)
  await sleep(1200)
  const r1 = await seconds(), at1 = Date.now()
  await cdp('Page.reload'); await sleep(900); await js(HELPERS)
  const r2 = await seconds(), gone = (Date.now() - at1) / 1000
  check(4, 'после обновления страницы тот же шаг и тот же говорящий', (await where()) === 'День 2 · Оправдания' && (await txt('.timer-label')) === `Оправдание №${nominees[0]}`)
  check(4, 'таймер после обновления идёт по реальному времени', Math.abs((r1 - r2) - gone) <= 1.2, `было ${r1} с, стало ${r2} с за ${gone.toFixed(1)} с`)
  await quit(); await launch(); await open()                        // браузер закрыт и открыт заново, файл открыт с диска
  check(4, 'после закрытия браузера и нового открытия файла игра на месте', (await where()) === 'День 2 · Оправдания' && (await txt('.timer-label')) === `Оправдание №${nominees[0]}`, await where())
  check(4, 'журнал и стол восстановлены', (await js(`document.querySelectorAll('.nomination, .card-badge').length`)) >= 5 && (await table()).filter((p) => p.out).length === 1)
  for (let i = 1; i < 5; i++) await main('Следующий')

  // ── Шаг 5: голосование ──
  await main('К голосованию')
  const buttons = () => js(`[...document.querySelectorAll('.vote-button')].map((b) => Number(b.innerText))`)
  check(5, 'голосуют 10; кнопок больше числа голосующих нет', (await has('голосуют 10 · осталось 10')) && Math.max(...(await buttons())) === 10)
  const vote = async (n) => js(`[...document.querySelectorAll('.vote-button')].find((b) => b.innerText === '${n}').click()`)
  await vote(4); await vote(1)
  check(5, 'ввести больше остатка невозможно', Math.max(...(await buttons())) === 5 && (await has('осталось 5')), `кнопки 0…${Math.max(...(await buttons()))}`)
  await vote(1); await key('4', 'Digit4', 52)                       // последнее число — клавишей
  check(5, 'остаток (0) подставлен последнему; ничья двоих', await exists(`Ничья №${nominees[0]} и №${nominees[3]}`), await txt('.vote-list'))
  await main('Ничья'); await main(`Речь №${nominees[0]}`); await main(`Речь №${nominees[3]}`); await main('К переголосованию')
  check(5, 'переголосование: голосуют 8, без ничейных', await has(`Переголосование · голосуют 8, без №${nominees[0]} и №${nominees[3]}`))
  await vote(4)
  check(5, 'вторая ничья: исход не предложен, решает ведущий', (await has('Снова ничья')) && (await exists('Выгнать одного…')) && (await exists('Выгнать обоих')) && !(await js(`!!document.querySelector('.main-button')`)))
  await click('Выгнать одного…'); await click(`Выбрать игрока №${nominees[3]}`)
  check(5, '«Выгнать одного…»: выгнан, шаг «Прощание»', (await where()) === 'День 2 · Прощание' && (await table()).find((p) => p.seat === nominees[3]).out && (await has(`выгнан · День 2`)))
  await main(`Прощание №${nominees[3]}`); await main('Город засыпает: Ночь 2')

  // ── Шаг 6: Ночь 2 ──
  await stepNav('Мафия'); await sleep(200); await click(`Выбрать игрока №${C[4]}`)
  await stepNav('Доктор'); await sleep(200)
  check(6, 'на шаге доктора видно решение прошлой ночи', await has(`Прошлой ночью: №${healed}`))
  await click(`Выбрать игрока №${healed}`)
  check(6, 'доктор снова лечит того же — предупреждение, запись не сделана', (await has('Этого игрока лечили прошлой ночью')) && (await exists('Записать всё равно')))
  await click(`Выбрать игрока №${C[4]}`)
  await stepNav('Проститутка'); await sleep(200); await click(`Выбрать игрока №${S}`)
  await stepNav('Шериф'); await sleep(200)
  check(6, 'шериф заблокирован: красный блок с номером и «Проверка этой ночью не состоится»',
    (await txt('.block-box-big')) === `№${S} заблокирован` && (await has('Проверка этой ночью не состоится.')), await txt('.block-box'))
  await click(`Выбрать игрока №${G}`)
  check(6, 'заблокированному шерифу ответ не показан', !(await js(`!!document.querySelector('.answer')`)))
  await stepNav('Итог ночи'); await sleep(200)
  const stay6 = await stayingRows()
  check(6, 'итог: никто не покидает стол — цель вылечена, вылеченный в «Остаются в игре»',
    (await nobodyLeaves()) === 'Никто не покидает столцель вылечена' && stay6.length === 1 && stay6[0].seat === C[4] && stay6[0].note === 'в него стреляла мафия',
    `${await nobodyLeaves()} · ${JSON.stringify(stay6)}`)
  await main('Никто не выбыл · начать День 3')
  await announce()

  // ── Шаг 7: День 3 — выставлен один игрок, шериф ──
  await click('Пропустить балаган')
  const first3 = firstFrom5((await table()).filter((p) => !p.out).map((p) => p.seat))
  await click(`Выбрать игрока №${first3}`)
  await main('Дать слово'); await click(`№${first3} выставляет…`); await click(`Выбрать игрока №${S}`)
  await stepNav('Оправдания'); await sleep(200)
  await main(`Оправдание №${S}`)
  check(7, 'один кандидат: голосования нет, главная кнопка «выгнан → прощание»', await exists(`№${S} выгнан → прощание`))
  await main(`№${S} выгнан → прощание`)
  check(7, 'шериф выгнан, шаг «Прощание»', (await where()) === 'День 3 · Прощание' && (await table()).find((p) => p.seat === S).out)
  await main(`Прощание №${S}`); await main('Город засыпает: Ночь 3')

  // ── Шаг 8: Ночь 3 и День 4 ──
  check(8, 'шаг шерифа серый: «выбыл · разбудить для вида»', await js(`[...document.querySelectorAll('.night-step')].some((b) => b.innerText.includes('Шериф') && b.innerText.includes('выбыл · разбудить для вида'))`))
  await stepNav('Мафия'); await sleep(200); await click(`Выбрать игрока №${C[4]}`)
  await stepNav('Проститутка'); await sleep(200); await click(`Выбрать игрока №${G}`)
  await stepNav('Итог ночи'); await sleep(200)
  check(8, 'блок крёстного отца: никто не покидает стол — стрелявший заблокирован',
    (await nobodyLeaves()) === 'Никто не покидает столстрелявший заблокирован — выстрела не было', await nobodyLeaves())
  await main('Никто не выбыл · начать День 4')
  await announce()
  await click('Пропустить балаган')
  const seats4 = (await table()).filter((p) => !p.out).map((p) => p.seat)
  await click(`Выбрать игрока №${firstFrom5(seats4)}`)
  const alive4 = seats4.length
  await main('Дать слово'); for (let i = 1; i < alive4; i++) await enter()
  check(8, 'День 4: никто не выставлен — главная кнопка сразу ведёт в Ночь 4', await exists('Никто не выставлен → Ночь 4'))
  await main('Никто не выставлен → Ночь 4')
  check(8, 'Ночь 4 начата', (await where()).startsWith('Ночь 4'))

  // ── Шаг 9: ошибочный статус и возврат; обмен ролями посреди игры ──
  await click(`Панель игрока №${C[0]}`); await click('Застрелен')
  const outNow = (await table()).find((p) => p.seat === C[0]).out
  await click(`Панель игрока №${C[0]}`); await click('Вернуть в игру')
  check(9, 'игрок отмечен выбывшим и возвращён', outNow && !(await table()).find((p) => p.seat === C[0]).out)
  await click(`Панель игрока №${C[0]}`); await click('Поменять роль с…'); await click(`Выбрать игрока №${D}`)
  const t9 = await table()
  check(9, 'обмен ролями посреди игры', t9.find((p) => p.seat === C[0]).role === 'доктор' && t9.find((p) => p.seat === D).role === 'мирный житель')
  await click('Отменить')
  check(9, '«Отменить» вернул обмен', (await table()).find((p) => p.seat === D).role === 'доктор')

  // ── Шаг 10: скрыть роли, пауза, язык ──
  await click('Скрыть роли')
  check(10, 'роли, счётчик сторон, ночные записи и журнал скрыты', (await has('роль скрыта')) && (await has('Журнал скрыт вместе с ролями')) && !(await has('чёрных'))
    && !(await js(`!!document.querySelector('.card-role, .answer, .card-picked, .card-mark-night, .card-mark-block')`)) && !(await has('Просыпается проститутка —')) && (await has('Просыпается проститутка')))
  await click('Показать роли')
  await click('Пауза игры')
  check(10, 'пауза: шторка без стола', (await has('Игра на паузе')) && !(await js(`!!document.querySelector('.table-grid')`)))
  await click('Продолжить игру')
  await click('Меню'); await click('Українська')
  check(10, 'язык переключён на украинский', (await txt('.game-phase .page-name')) === 'Ніч 4' && (await has('хрещений батько') || await has('мафія')))
  await click('Меню'); await click('Русский')

  // ── Шаг 11: остановить игру, победитель, журнал, новая игра с тем же составом ──
  await click('Меню'); await click('Остановить игру')
  check(11, 'кнопка завершения неактивна, пока сторона не выбрана', !(await exists('Завершить игру')) && (await has('Остановить игру?')))
  await click('Чёрные'); await click('Завершить: победа чёрных')
  check(11, 'итоги: победитель, таблица игроков, журнал от распределения', (await txt('.summary-winner')) === 'Победа чёрных' && (await js(`document.querySelectorAll('.summary-table tbody tr').length`)) === 11 && (await has('Распределение')) && (await has('Игра остановлена: победа чёрных')))
  await click('Новая игра с тем же составом')
  check(11, 'новая игра с тем же составом: 11 игроков, 2 мафии', Number(await txt('.stepper-big .stepper-value')) === 11 && (await has('из них крёстный отец: 1')) && (await has('чёрных 3')))
  await click('На главную')
  check(11, 'завершённая игра в списке на главной', (await has('Завершённые игры')) && (await has('Победа чёрных')))

  // ── Шаг 12: свои роли (дополнение к спецификации, раздел 8, пункты 1–10) ──
  const type = async (text) => { await cdp('Input.insertText', { text }); await sleep(90) }
  /** Enter в поле ввода — с символом возврата каретки, как от настоящей клавиатуры: без него браузер форму не отправляет. */
  const enterInField = async () => {
    for (const kind of ['keyDown', 'keyUp']) {
      await cdp('Input.dispatchKeyEvent', { type: kind, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: kind === 'keyDown' ? '\r' : undefined })
    }
    await sleep(90)
  }
  const texts = (selector) => js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => e.innerText.replace(/\\s+/g, ' ').trim())`)
  const customRows = () => texts('.role-row-custom')
  const summaryRows = () => texts('.summary-table tbody tr')

  // 8.1: добавить «Журналист», красные, ходит ночью.
  await click('Новая игра')
  await click('Добавить свою роль'); await type('Журналист'); await click('Красные'); await click('Добавить роль')
  const rows1 = await customRows()
  check(12, 'роль «Журналист» в перечне: пометка «своя роль», красные, ходит ночью, количество 1',
    rows1.length === 1 && rows1[0].startsWith('Журналист своя роль красные · ходит ночью, выбор записывается') && rows1[0].endsWith(' 1'), rows1.join(' | '))
  const order1 = await texts('.night-order li')
  check(12, 'роль в колоде и последней в блоке «Ночью просыпаются»',
    (await texts('.setup-total .chips li')).includes('журналист') && order1.length === 6 && order1.at(-1) === '6 · журналист', order1.join(', '))

  // 8.2: занятое название; «Маньяк», чёрные, ночью спит.
  await click('Добавить свою роль'); await type('шериф'); await enterInField()
  check(12, 'название «шериф» занято: ошибка под полем, Enter карты не раздал',
    (await has('Роль с таким названием уже есть.')) && (await txt('.page-step')) === 'Состав' && (await customRows()).length === 1)
  await js(`document.querySelector('.role-form-input').select()`); await type('Маньяк')
  await click('Чёрные'); await clickEl(`document.querySelector('.role-form [role=switch]')`); await click('Добавить роль')
  const rows2 = await customRows()
  check(12, '«Маньяк», чёрные, ночью спит: счётчик чёрных вырос на 1, шагов ночи по-прежнему шесть',
    rows2.length === 2 && rows2[1].startsWith('Маньяк своя роль чёрные · ночью спит') && (await has('чёрных 4')) && (await has('красных 7')) && (await texts('.night-order li')).length === 6, rows2.join(' | '))

  // 8.3: уйти на главную и вернуться.
  await click('На главную'); await click('Новая игра')
  const rows3 = await customRows()
  check(12, 'после ухода на главную обе роли в перечне и в составе',
    rows3.length === 2 && rows3.every((r) => r.endsWith(' 1')) && (await has('чёрных 4')) && (await texts('.setup-total .chips li')).includes('маньяк'), rows3.join(' | '))

  // 8.4: раздать.
  await click('Раздать роли')
  const dealt12 = await dealt()
  check(12, 'распределение называет обе роли, состав сошёлся',
    dealt12.length === 11 && count(dealt12, 'журналист') === 1 && count(dealt12, 'маньяк') === 1 && (await has('журналист 1, маньяк 1, мирных 4')), dealt12.join(', '))
  await main('Город просыпается: День 1')
  await click('Выбрать другого…'); await click('Выбрать игрока №1')
  await main('Дать слово №1'); for (let i = 0; i < 10; i++) await enter()
  await click('Пропустить доп. минуту'); await click('Пропустить доп. минуту')
  await main('Город засыпает: Ночь 1')

  // 8.5: Ночь 1 — шаг журналиста после доктора, запись, журнал, подсказка итога без изменений.
  const t12 = await table()
  const seat12 = (role) => t12.find((p) => p.role === role).seat
  const J = seat12('журналист'), X = seat12('маньяк'), S12 = seat12('шериф'), P12 = seat12('проститутка')
  const C12 = t12.filter((p) => p.role === 'мирный житель').map((p) => p.seat)
  console.log(`   стол: журналист №${J}, маньяк №${X}, шериф №${S12}, проститутка №${P12}, мирные ${C12.join(', ')}`)
  const nav12 = await texts('.night-step .night-step-name')
  check(12, 'Ночь 1: шаг «Журналист» идёт после доктора и помечен «своя роль»',
    nav12.join(' · ') === 'Проститутка · Мафия · Крёстный отец · Шериф · Доктор · Журналист своя роль · Итог ночи', nav12.join(' · '))
  await stepNav('Мафия'); await sleep(200); await click(`Выбрать игрока №${C12[0]}`)   // выстрел мафии
  await stepNav('Итог ночи'); await sleep(200)
  const hint12 = await txt('.result-group')
  await stepNav('Журналист'); await sleep(200)
  check(12, 'стол спрашивает: «Кого выбирает журналист?»', (await txt('.table-question')) === 'Кого выбирает журналист?', await txt('.table-question'))
  await click(`Выбрать игрока №${X}`)
  check(12, 'выбор записан: блок «Записано», метка на карточке, запись в журнале',
    (await has('Записано · Журналист')) && (await txt('.answer-big')) === `→ №${X}` && (await has('Приложение только записывает выбор'))
    && (await has('выбор: журналист')) && (await has(`Журналист → №${X}`)), await txt('.answer-big'))
  await stepNav('Итог ночи'); await sleep(200)
  check(12, 'подсказка итога ночи та же, что без записи своей роли',
    hint12 === `Покидают стол№${C12[0]}Застрелен мафиейникто не лечил` && (await txt('.result-group')) === hint12, `${hint12} → ${await txt('.result-group')}`)
  await cdp('Page.reload'); await sleep(900); await js(HELPERS)
  check(12, 'после обновления страницы роль и запись на месте',
    (await where()) === 'Ночь 1 · Итог ночи' && (await has(`Журналист → №${X}`)) && (await table()).find((p) => p.seat === J).role === 'журналист', await where())
  await main(`№${C12[0]} выбывает · начать День 2`)
  await announce()
  await click('Пропустить балаган'); await click(`Выбрать игрока №${J}`)
  const alive12 = (await table()).filter((p) => !p.out).length
  await main('Дать слово'); for (let i = 1; i < alive12; i++) await enter()
  await main('Никто не выставлен → Ночь 2')

  // 8.6: Ночь 2 — блок журналиста, проверка маньяка.
  await stepNav('Проститутка'); await sleep(200); await click(`Выбрать игрока №${J}`)
  await stepNav('Журналист'); await sleep(200)
  check(12, 'Ночь 2: журналист заблокирован — красный блок; виден выбор прошлой ночи',
    (await txt('.block-box-big')) === `№${J} заблокирован` && (await has('Действие этой ночью не состоится.')) && (await has(`Прошлой ночью: №${X}`)), await txt('.block-box'))
  await click(`Выбрать игрока №${C12[1]}`)
  check(12, 'записать выбор заблокированной роли всё равно можно', (await txt('.answer-big')) === `→ №${C12[1]}` && (await has(`Журналист → №${C12[1]}`)), await txt('.answer-big'))
  await stepNav('Шериф'); await sleep(200); await click(`Выбрать игрока №${X}`)
  check(12, 'шериф проверяет маньяка — «чёрный»', (await txt('.answer-big')) === `№${X} — чёрный`, await txt('.answer-big'))

  // 8.7: язык и скрытие ролей.
  await click('Меню'); await click('Українська')
  const uk12 = await table()
  check(12, 'украинский: названия своих ролей те же, остальной текст переведён',
    uk12.find((p) => p.seat === J).role === 'журналист' && uk12.find((p) => p.seat === X).role === 'маньяк' && uk12.find((p) => p.seat === S12).role === 'шериф'
    && (await txt('.game-phase .page-name')) === 'Ніч 2' && (await has('мирний житель')) && (await has('вибір: журналист')), await txt('.game-phase .page-name'))
  await click('Меню'); await click('Русский')
  await click('Скрыть роли')
  check(12, 'скрытые роли: названий, пометок и записей своих ролей не видно',
    (await has('роль скрыта')) && !(await has('маньяк')) && !(await has('Маньяк')) && !(await has('своя роль')) && !(await has('выбор: журналист')) && !(await has('Журналист →'))
    && !(await js(`!!document.querySelector('.card-role, .answer, .card-mark-night, .night-step-tag')`)))
  await click('Показать роли')

  // 8.8: остановить игру.
  await click('Меню'); await click('Остановить игру')
  const sides12 = await texts('.stop-option')
  check(12, 'окно остановки: «маньяк» в списке чёрных, «журналист» — красных',
    sides12.find((x) => x.startsWith('Чёрные')).includes('маньяк') && sides12.find((x) => x.startsWith('Красные')).includes('журналист'), sides12.join(' | '))
  await click('Красные'); await click('Завершить: победа красных')
  const sum12 = await summaryRows()
  check(12, 'итоги называют свои роли, журнал хранит запись своей роли',
    (await txt('.summary-winner')) === 'Победа красных' && sum12.some((r) => r.startsWith(`${J} журналист`)) && sum12.some((r) => r.startsWith(`${X} маньяк`)) && (await has(`Журналист → №${X}`)), sum12.join(' | '))

  // 8.9: удалить роль из перечня; завершённая игра её помнит; «с тем же составом» возвращает.
  await click('Новая игра'); await click('Удалить роль «Журналист»')
  const rows9 = await customRows()
  await click('На главную'); await click('Открыть')                 // первая в списке — только что завершённая
  check(12, 'роль удалена из перечня, а завершённая игра открывается и называет её',
    rows9.length === 1 && rows9[0].startsWith('Маньяк') && (await txt('.summary-winner')) === 'Победа красных' && (await summaryRows()).some((r) => r.startsWith(`${J} журналист`)), rows9.join(' | '))
  await click('Новая игра с тем же составом')
  const rows10 = await customRows()
  check(12, '«Новая игра с тем же составом» возвращает роль в перечень и в состав',
    rows10.length === 2 && rows10.some((r) => r.startsWith('Журналист своя роль') && r.endsWith(' 1')) && (await texts('.setup-total .chips li')).includes('журналист'), rows10.join(' | '))
  await click('На главную')

  // 8.10: игра, сохранённая до обновления, — в её настройках нет поля customRoles.
  const stripped = await js(`(() => {
    const meta = JSON.parse(localStorage.getItem('mafia:index')).find((m) => m.winner === 'black')
    const key = 'mafia:session:' + meta.id
    const session = JSON.parse(localStorage.getItem(key))
    delete session.config.customRoles
    localStorage.setItem(key, JSON.stringify(session))
    return !('customRoles' in JSON.parse(localStorage.getItem(key)).config)
  })()`)
  await cdp('Page.reload'); await sleep(900); await js(HELPERS)
  await clickEl(`[...[...document.querySelectorAll('.home-item')].find((i) => i.innerText.includes('Победа чёрных')).querySelectorAll('button')].find((b) => b.innerText.trim() === 'Открыть')`)
  check(12, 'игра, сохранённая до обновления, открывается как раньше',
    stripped && (await txt('.summary-winner')) === 'Победа чёрных' && (await summaryRows()).length === 11 && (await has('Игра остановлена: победа чёрных')) && !(await has('своя роль')))
  await click('На главную')

  // ── Шаг 13: правила партии и ход дня (дополнение «Механики партии и новые роли», этап 1) ──
  const switchOn = (label) => js(`document.querySelector('[role=switch][aria-label=${JSON.stringify(label)}]')?.getAttribute('aria-checked') === 'true'`)
  const radioOn = (label) => js(`__find(${JSON.stringify(label)})?.getAttribute('aria-checked') === 'true'`)
  const nightOrderChips = () => texts('.night-order li')
  const noSeatInPanel = () => js(`!/№\\s*\\d/.test(document.querySelector('.step-panel').textContent)`)
  const navNames = () => texts('.night-step .night-step-name')
  const LATE = 'ответ на поиск к этому моменту уже показан'

  await click('Новая игра'); await click('Сбросить к стандарту'); await click('Мафия: больше')
  check(13, 'правила партии по умолчанию: балаган и прощание после голосования включены, после ночи — нет, проститутка первой',
    (await switchOn('Балаган перед кругом речей')) && (await switchOn('Прощание после голосования')) && !(await switchOn('Прощание после ночной смерти'))
    && (await radioOn('Первой')) && (await nightOrderChips())[0] === '1 · проститутка' && (await radioOn('Выстрел')), (await nightOrderChips()).join(', '))
  await click('Балаган перед кругом речей'); await click('Прощание после голосования')
  await click('После мафии'); await click('Выстрел и поиск')
  check(13, 'проститутка «после мафии» и отмена поиска: порядок ночи изменился, под опцией предупреждение',
    (await nightOrderChips()).join(', ').startsWith('1 · мафия, 2 · крёстный отец, 3 · проститутка') && (await has(LATE)), (await nightOrderChips()).join(', '))
  await click('Первой')
  check(13, 'проститутка «первой»: предупреждение ушло, она снова первая', !(await has(LATE)) && (await nightOrderChips())[0] === '1 · проститутка'
    && !(await switchOn('Балаган перед кругом речей')) && !(await switchOn('Прощание после голосования')) && (await radioOn('Выстрел и поиск')))
  await click('Раздать роли')

  // День 1: случайный начинающий, роли скрыты, доп. минуты первых двоих.
  await main('Город просыпается: День 1')
  const note13 = await txt('.steps-note')
  const opener13 = Number(/^День 1 · круг начал №(\d+), выбран случайно$/.exec(note13)?.[1] ?? 0)
  const second13 = opener13 % 11 + 1
  check(13, 'День 1: начинающего выбрало приложение, есть «Выбрать другого…»',
    opener13 >= 1 && opener13 <= 11 && (await exists(`Дать слово №${opener13}`)) && (await exists('Выбрать другого…')) && !(await exists('Выбрать, кто начинает')), note13)
  check(13, 'утром роли скрыты сами', (await has('роль скрыта')) && (await has('Журнал скрыт вместе с ролями')) && !(await js(`!!document.querySelector('.card-role')`)))
  await main(`Дать слово №${opener13}`); for (let i = 0; i < 10; i++) await enter()
  check(13, 'конец первого круга: доп. минута начинавшему и следующему за ним',
    (await exists(`Доп. минута №${opener13}`)) && (await has(`№${opener13} и №${second13} говорили первыми и получают ещё по минуте`)), await txt('.closing-note'))
  await main(`Доп. минута №${opener13}`)
  check(13, 'доп. минута идёт: таймер 60 с, следующая — второму', (await txt('.timer-label')) === `Доп. минута №${opener13}` && (await txt('.timer-state')).startsWith('идёт')
    && (await exists(`Доп. минута №${second13}`)), await txt('.timer-label'))
  await click('Пропустить доп. минуту')
  check(13, '«Пропустить доп. минуту»: главная кнопка ведёт в ночь', (await exists('Город засыпает: Ночь 1')) && !(await exists('Пропустить доп. минуту')))
  await main('Город засыпает: Ночь 1')

  // Ночь 1: роли открыты, проститутка первой, блок шерифа виден на его шаге и при скрытых ролях.
  const t13 = await table()
  const seat13 = (role) => t13.find((p) => p.role === role).seat
  const S13 = seat13('шериф'), G13 = seat13('мафия · глава')
  const C13 = t13.filter((p) => p.role === 'мирный житель').map((p) => p.seat)
  console.log(`   стол: шериф №${S13}, глава №${G13}, мирные ${C13.join(', ')}`)
  check(13, 'ночью роли открыты сами, первый шаг — проститутка',
    !(await has('роль скрыта')) && t13.every((p) => p.role !== '') && (await where()) === 'Ночь 1 · Проститутка' && (await navNames())[0] === 'Проститутка', (await navNames()).join(' · '))
  await click(`Выбрать игрока №${S13}`)                             // проститутка блокирует шерифа
  await click('Скрыть роли'); await stepNav('Шериф'); await sleep(200)
  check(13, 'роли скрыты: блок шерифа виден на его шаге, но номер и карточку не выдаёт',
    (await txt('.block-box-big')) === 'Исполнитель заблокирован' && (await has('Проверка этой ночью не состоится.'))
    && (await js(`document.querySelector('.night-step[aria-current=step]').hasAttribute('data-blocked')`)) && (await noSeatInPanel())
    && !(await js(`!!document.querySelector('.card-blocked, .card-mark-block, .card-role')`)), await txt('.block-box'))
  await click('Показать роли')
  check(13, 'роли открыты: блок называет номер, карточка шерифа с красной меткой «заблокирован»',
    (await txt('.block-box-big')) === `№${S13} заблокирован` && (await has('Блок проститутки'))
    && (await js(`document.querySelectorAll('.table-grid .card')[${S13 - 1}].classList.contains('card-blocked')`)) && (await txt('.card-mark-block')) === 'заблокирован', await txt('.block-box'))
  await stepNav('Мафия'); await sleep(200); await click(`Выбрать игрока №${C13[0]}`)
  await stepNav('Итог ночи'); await sleep(200)
  check(13, 'итог ночи: строка «Заблокированы: … — покажи игроку»', await has(`Заблокированы: №${S13} — покажи игроку`), await txt('.block-line'))
  await main(`№${C13[0]} выбывает · начать День 2`)
  await announce()

  // День 2: балагана нет, роли снова скрыты, выгнанный уходит без прощания.
  const steps13 = await texts('.steps .step')
  check(13, 'День 2 без балагана: сразу круг речей, начинающего выбирает ведущий, роли снова скрыты',
    (await where()) === 'День 2 · Круг речей' && !steps13.includes('Балаган') && (await exists('Выбрать, кто начинает')) && (await has('роль скрыта')), steps13.join(' · '))
  const alive13 = (await table()).filter((p) => !p.out).map((p) => p.seat)
  const first13 = firstFrom5(alive13)
  await main('Выбрать, кто начинает'); await click(`Выбрать игрока №${first13}`)
  await main('Дать слово'); await click(`№${first13} выставляет…`); await click(`Выбрать игрока №${C13[1]}`)
  await stepNav('Оправдания'); await sleep(200)
  await main(`Оправдание №${C13[1]}`)
  check(13, 'прощание выключено: главная кнопка «выгнан → Ночь 2», про прощание ни слова',
    (await exists(`№${C13[1]} выгнан → Ночь 2`)) && !(await js(`[...document.querySelectorAll('button')].some((b) => /рощани/.test(b.innerText))`)))
  await main(`№${C13[1]} выгнан → Ночь 2`)
  check(13, 'выгнанный выбыл, сразу Ночь 2, роли открыты', (await where()) === 'Ночь 2 · Проститутка' && (await table()).find((p) => p.seat === C13[1]).out
    && (await has('выгнан · День 2')) && !(await has('роль скрыта')), await where())

  // Ночь 2: блок крёстного отца по опции «выстрел и поиск».
  await click(`Выбрать игрока №${G13}`)
  await stepNav('Мафия'); await sleep(200)
  const shotBlocked = (await txt('.block-box-big')) === `№${G13} заблокирован` && (await has('Выстрела этой ночью не будет.'))
  await click(`Выбрать игрока №${C13[2]}`)
  await stepNav('Крёстный отец'); await sleep(200); await click(`Выбрать игрока №${S13}`)
  check(13, 'блок крёстного отца при опции «выстрел и поиск»: выстрела не будет, поиск не состоится, ответа нет',
    shotBlocked && (await has('Поиск шерифа этой ночью не состоится.')) && !(await js(`!!document.querySelector('.answer')`)), await txt('.block-box'))

  // Та же игра, как будто её сохранили до обновления: правил партии и опций ролей в ней нет.
  const legacy = await js(`(() => {
    const key = 'mafia:session:' + localStorage.getItem('mafia:active')
    const session = JSON.parse(localStorage.getItem(key))
    session.config.rules = { nominationsFromDay: session.config.rules.nominationsFromDay, balaganFromDay: session.config.rules.balaganFromDay }
    delete session.config.roleOptions
    localStorage.setItem(key, JSON.stringify(session))
    return Object.keys(JSON.parse(localStorage.getItem(key)).config.rules).length === 2
  })()`)
  await cdp('Page.reload'); await sleep(900); await js(HELPERS)
  const navOld = await navNames()
  await stepNav('Крёстный отец'); await sleep(200)
  check(13, 'игра без новых правил открывается по-старому: проститутка после мафии, блок крёстного отца поиск не отменяет',
    legacy && (await where()).startsWith('Ночь 2') && navOld.join(' · ') === 'Мафия · Крёстный отец · Проститутка · Шериф · Доктор · Итог ночи'
    && (await txt('.answer-big')) === `№${S13} — шериф` && (await has('На поиск шерифа это не влияет.')), navOld.join(' · '))
  await stepNav('Итог ночи'); await sleep(200)
  check(13, 'по старым правилам блок крёстного отца отменяет выстрел',
    (await nobodyLeaves()) === 'Никто не покидает столстрелявший заблокирован — выстрела не было', await nobodyLeaves())
  await main('Никто не выбыл · начать День 3')
  await announce()
  check(13, 'по старым правилам день открывается балаганом', (await where()) === 'День 3 · Балаган', await where())
  await click('Меню'); await click('На главную')

  // ── Шаг 14: итог ночи списком, утреннее объявление, прощание после ночной смерти (этап 2 дополнения) ──
  const dayNav = () => texts('.steps .step')
  await click('Новая игра'); await click('Сбросить к стандарту'); await click('Мафия: больше')
  await click('Прощание после ночной смерти')
  check(14, 'правило «Прощание после ночной смерти» включено на экране состава', await switchOn('Прощание после ночной смерти'))
  await click('Раздать роли')
  await main('Город просыпается: День 1')
  const opener14 = Number(/круг начал №(\d+)/.exec(await txt('.steps-note'))?.[1] ?? 0)
  await main(`Дать слово №${opener14}`); for (let i = 0; i < 10; i++) await enter()
  await click('Пропустить доп. минуту'); await click('Пропустить доп. минуту')
  await main('Город засыпает: Ночь 1')

  // Ночь 1: выстрел в мирного, второго выбывшего ведущий добавляет сам.
  const t14 = await table()
  const C14 = t14.filter((p) => p.role === 'мирный житель').map((p) => p.seat)
  const [shot14, extra14, other14] = C14
  const pair14 = [shot14, extra14].sort((a, b) => a - b)
  console.log(`   стол: мирные ${C14.join(', ')}; выстрел в №${shot14}, вручную №${extra14}`)
  await click('Никого')
  await stepNav('Мафия'); await sleep(200); await click(`Выбрать игрока №${shot14}`)
  await stepNav('Итог ночи'); await sleep(200)
  const rows14 = await leavingRows()
  check(14, 'итог ночи: «Покидают стол» — застреленный с отметкой и причиной, кнопка называет его',
    (await has('Итог Ночи 1')) && rows14.length === 1 && rows14[0].seat === shot14 && rows14[0].checked && rows14[0].text === 'Застрелен мафией' && rows14[0].note === 'никто не лечил'
    && (await exists(`№${shot14} выбывает · начать День 2`)), JSON.stringify(rows14))
  await click('Добавить выбывшего…')
  // Того, кто уже в списке, выбрать нельзя: его карточка заперта. (Имя кнопки не сверяем: «№1» — начало «№10».)
  const asked14 = (await txt('.table-question')) === 'Кто ещё выбыл этой ночью?'
    && (await js(`document.querySelectorAll('.table-grid .card')[${shot14 - 1}].classList.contains('card-locked')`))
  await click(`Выбрать игрока №${extra14}`)
  const rows14b = await leavingRows()
  check(14, '«Добавить выбывшего…»: выбор на столе добавил строку «Отмечен ведущим», статусы до подтверждения не изменились',
    asked14 && rows14b.map((r) => r.seat).join() === pair14.join() && rows14b.every((r) => r.checked) && rows14b.find((r) => r.seat === extra14).text === 'Отмечен ведущим'
    && (await exists('Выбывают двое · начать День 2')) && (await table()).every((p) => !p.out), JSON.stringify(rows14b))
  await toggleMark(shot14)
  const off14 = (await exists(`№${extra14} выбывает · начать День 2`)) && !(await leavingRows()).find((r) => r.seat === shot14).checked
  await toggleMark(shot14)
  check(14, 'отметка снимается и возвращается: кнопка считает отмеченных', off14 && (await exists('Выбывают двое · начать День 2')))
  await main('Выбывают двое · начать День 2')

  // Утро: окно называет обоих и прощания, ролей и причин в нём нет; Enter под окном — «Объявил», а не кнопка шага.
  const said14 = (await morning()) ?? ''
  const lines14 = await morningLines()
  check(14, 'окно утра: «Стол покидают игроки №… и №…», оба прощаются, ролей и причин нет',
    said14.includes(`Стол покидают игроки №${pair14[0]} и №${pair14[1]}`) && lines14.join(' | ') === pair14.map((n) => `№${n} прощается со столом — 30 с`).join(' | ')
    && !/мафи|застрел|доктор|шериф|проститут|мирн/i.test(said14) && (await has('роль скрыта')), `${said14} · ${lines14.join(' | ')}`)
  await enter()
  check(14, 'Enter под окном закрыл окно, а главную кнопку шага не нажал: прощание не началось',
    (await morning()) === null && (await where()) === 'День 2 · Прощание' && (await txt('.timer-state')).startsWith('готов')
    && (await table()).filter((p) => p.out).map((p) => p.seat).join() === pair14.join(), `${await where()} · ${await txt('.timer-state')}`)
  await cdp('Page.reload'); await sleep(900); await js(HELPERS)
  const quiet14 = (await morning()) === null && (await where()) === 'День 2 · Прощание'
  await click('Отменить')
  check(14, 'после обновления страницы окно утра не вернулось, после «Отменить» — вернулось', quiet14 && ((await morning()) ?? '').includes('Стол покидают игроки'), await morning())
  await announce()

  // Прощание после ночной смерти: первый шаг дня, по возрастанию номеров.
  check(14, 'шаг «Прощание» — первый в дне, перед балаганом', (await dayNav()).join(' · ') === 'Прощание · Балаган · Круг речей · Оправдания · Голосование'
    && (await has(`№${pair14[0]} и №${pair14[1]}: выбыли ночью · прощание`)), (await dayNav()).join(' · '))
  await main(`Прощание №${pair14[0]}`)
  check(14, 'прощание выбывшего ночью: таймер 30 с идёт, следующий — второй выбывший',
    (await txt('.timer-label')) === `Прощание №${pair14[0]}` && (await txt('.timer-state')) === 'идёт · из 0:30' && (await exists(`Прощание №${pair14[1]}`)), `${await txt('.timer-label')} · ${await txt('.timer-state')}`)
  await main(`Прощание №${pair14[1]}`); await main('Дальше: балаган')
  check(14, 'после прощаний — балаган', (await where()) === 'День 2 · Балаган' && (await exists('Запустить балаган')), await where())
  await click('Объявление утра')
  const again14 = ((await morning()) ?? '').includes(`№${pair14[0]} и №${pair14[1]}`)
  await announce()
  check(14, '«Объявление утра» открывает окно снова и закрывает без следа', again14 && (await morning()) === null && (await where()) === 'День 2 · Балаган')

  // Ночь 2 без смертей: «Город просыпается в полном составе», шага прощания нет.
  await click('Пропустить балаган')
  const alive14 = (await table()).filter((p) => !p.out).map((p) => p.seat)
  await click(`Выбрать игрока №${alive14[0]}`)
  await main('Дать слово'); for (let i = 1; i < alive14.length; i++) await enter()
  await main('Никто не выставлен → Ночь 2')
  await click('Никого'); await stepNav('Мафия'); await sleep(200); await click('Никого')
  await stepNav('Итог ночи'); await sleep(200)
  check(14, 'ночь без выстрела: «Никто не покидает стол — этой ночью никто не стрелял»',
    (await nobodyLeaves()) === 'Никто не покидает столэтой ночью никто не стрелял' && (await leavingRows()).length === 0, await nobodyLeaves())
  await main('Никто не выбыл · начать День 3')
  const calm14 = (await morning()) ?? ''
  check(14, 'окно утра после тихой ночи: «Город просыпается в полном составе», строк нет',
    calm14.includes('Город просыпается в полном составе') && calm14.includes('Этой ночью никто не покинул стол.') && (await morningLines()).length === 0 && !/№\d/.test(calm14), calm14)
  await announce()
  check(14, 'после тихой ночи шага прощания нет: день открывается балаганом', (await where()) === 'День 3 · Балаган' && !(await dayNav()).includes('Прощание'), (await dayNav()).join(' · '))

  // Правка прошлой ночи: итог — набором; предложение исправить — только когда набор отличается от отмеченного.
  const outNow14 = async () => (await table()).filter((p) => p.out).map((p) => p.seat).join()
  await click('Показать роли')
  await click('Ночь 1'); await click(`Итог ночи: выбыли №${pair14[0]} и №${pair14[1]}`)
  const pressed14 = await js(`[...document.querySelectorAll('[role=dialog] .seat-btn[aria-pressed=true]')].map((b) => Number(b.textContent)).join()`)
  await click(`Выбрать игрока №${shot14}`)
  const kept14 = await outNow14()
  await click('Сохранить')
  check(14, 'редактор итога прошлой ночи правит набор: отметка снята, статусы меняет «Сохранить»',
    pressed14 === pair14.join() && kept14 === pair14.join() && (await outNow14()) === String(extra14) && (await has(`Итог ночи: №${extra14} застрелен`)) && (await has('испр.')), `${pressed14} → ${await outNow14()}`)
  await click(`Мафия → №${shot14}`); await click(`Выбрать игрока №${extra14}`)
  const silent14 = !(await has('теперь другой')) && (await outNow14()) === String(extra14)
  await click(`Мафия → №${extra14}`); await click(`Выбрать игрока №${other14}`)
  check(14, 'правка записи выстрела: набор совпал с отмеченным — предложения нет; не совпал — «выбыть должен №…», статусы не тронуты',
    silent14 && (await has(`Итог Ночи 1 теперь другой: выбыть должен №${other14}`)) && (await outNow14()) === String(extra14), await outNow14())
  await click('Исправить')
  check(14, '«Исправить»: прежний выбывший в игре, новый застрелен', (await outNow14()) === String(other14) && !(await has('теперь другой')), await outNow14())

  // Та же игра, как будто её сохранили до обновления: отметка итога ночи — один номер или null, события «объявил» нет.
  const old14 = await js(`(() => {
    const key = 'mafia:session:' + localStorage.getItem('mafia:active')
    const session = JSON.parse(localStorage.getItem(key))
    const one = (v) => (Array.isArray(v) ? (v.length > 0 ? v[0] : null) : v)
    session.log = session.log.filter((e) => e.type !== 'morning_announced')
      .map((e) => (e.type === 'night_confirmed' ? { ...e, hinted: one(e.hinted), chosen: one(e.chosen) } : e))
    localStorage.setItem(key, JSON.stringify(session))
    return JSON.parse(localStorage.getItem(key)).log.filter((e) => e.type === 'night_confirmed').map((e) => JSON.stringify(e.chosen)).join()
  })()`)
  await cdp('Page.reload'); await sleep(900); await js(HELPERS)
  const shown14 = (await morning()) ?? ''
  await announce()
  check(14, 'игра со старой записью итога ночи (один номер) открывается: тот же день, тот же выбывший, итог ночи читается',
    old14 === `${other14},null` && shown14.includes('Город просыпается в полном составе') && (await where()) === 'День 3 · Балаган'
    && (await outNow14()) === String(other14) && (await has(`Выстрел в №${other14} → №${other14} застрелен`)) && !(await has('теперь другой')), `${old14} · ${await outNow14()}`)
  await click('Меню'); await click('На главную')

  check('—', 'за весь сценарий нет ошибок в консоли и исключений', problems.length === 0, problems.slice(0, 3).join(' | '))
  check('—', 'страница не сделала ни одного сетевого запроса', network.length === 0, network.slice(0, 3).join(' | '))
  check('—', 'сохранение в хранилище браузера работает с диска', (await js(`Object.keys(localStorage).filter((k) => k.startsWith('mafia:')).length`)) >= 3)
}

try {
  await run()
} catch (e) {
  check('!', 'сценарий прерван', false, e.message)
} finally {
  await quit().catch(() => {})
  rmSync(profile, { recursive: true, force: true })
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length} из ${results.length} проверок прошли · Chrome: ${CHROME.split('/').at(-1)} · файл: ${pathToFileURL(FILE).href}`)
process.exit(failed.length > 0 ? 1 : 0)
