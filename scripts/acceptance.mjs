// Приёмочный сценарий из раздела 8 спецификации на собранном dist/index.html, открытом с диска (file://).
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
const where = async () => `${await txt('.game-phase .page-name')} · ${await txt('.game-phase .page-step')}`
const seconds = async () => { const [m, s] = (await txt('.timer-digits span')).split(':').map(Number); return m * 60 + s }
/** Роли и статусы со стола игрового экрана. */
const table = () => js(`[...document.querySelectorAll('.table-grid .card')].map((c) => ({
  seat: Number(c.querySelector('.card-num').innerText), role: (c.querySelector('.card-role')?.innerText ?? '').trim(), out: c.classList.contains('card-out') }))`)
const stepNav = (name) => js(`(() => { const b = [...document.querySelectorAll('.steps .step, .night-step')].find((e) => e.innerText.trim().startsWith(${JSON.stringify(name)})); if (!b) return false; b.click(); return true })()`)

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
  await click('Выбрать, кто начинает'); await click('Выбрать игрока №5')
  await main('Дать слово №5')
  check(1, 'День 1 начат с №5, таймер речи идёт', (await where()) === 'День 1 · Круг речей' && (await txt('.timer-label')) === 'Речь №5' && (await has('говорит сейчас')))
  check(1, 'в День 1 нет кнопки «выставляет…»', !(await js(`[...document.querySelectorAll('button')].some((b) => b.innerText.includes('выставляет'))`)))
  for (let i = 0; i < 10; i++) await enter()                      // остальные десять речей — клавишей Enter
  check(1, 'круг пройден клавишей Enter, главная кнопка ведёт в ночь', await exists('Город засыпает: Ночь 1'), await txt('.facts'))
  await main('Город засыпает: Ночь 1')

  const t0 = await table()
  const seatOf = (role) => t0.find((p) => p.role === role).seat
  const S = seatOf('шериф'), G = seatOf('мафия · глава'), D = seatOf('доктор'), M = seatOf('мафия'), P = seatOf('проститутка')
  const C = t0.filter((p) => p.role === 'мирный житель').map((p) => p.seat)
  console.log(`   стол: шериф №${S}, глава №${G}, мафия №${M}, проститутка №${P}, доктор №${D}, мирные ${C.join(', ')}`)
  const healed = D === 4 ? 4 : C[2]                                 // в сценарии доктор лечит №4; если №4 не подходит — мирного

  // ── Шаг 2: Ночь 1 ──
  await click(`Выбрать игрока №${C[0]}`)                            // выстрел не в того
  await main('Дальше: Крёстный отец'); await click(`Выбрать игрока №${C[1]}`)
  check(2, 'крёстный отец ищет шерифа — ответ «не шериф»', (await txt('.answer-big')) === `№${C[1]} — не шериф`, await txt('.answer-big'))
  await main('Дальше: Проститутка'); await click('Никого')
  await main('Дальше: Шериф'); await click(`Выбрать игрока №${M}`)
  check(2, 'шериф проверил мафию — «чёрный»', (await txt('.answer-big')) === `№${M} — чёрный`)
  await main('Дальше: Доктор'); await click(`Выбрать игрока №${healed}`)
  await main('Итог ночи')
  check(2, 'итог ночи: подсказка «застрелен»', (await txt('.answer-big')) === `№${C[0]} застрелен`, await txt('.answer-big'))
  await main(`№${C[0]} застрелен · начать День 2`)
  check(2, 'День 2 начат, застреленный выбыл', (await where()) === 'День 2 · Балаган' && (await table()).find((p) => p.seat === C[0]).out)
  // Утром исправляем запись выстрела в журнале.
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
  await main('Выбрать, кто начинает круг'); await click('Выбрать игрока №5')
  const alive2 = (await table()).filter((p) => !p.out).map((p) => p.seat)
  const circle = [...alive2.filter((s) => s >= 5), ...alive2.filter((s) => s < 5)]
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
  await click(`Выбрать игрока №${C[4]}`)
  await stepNav('Доктор'); await sleep(200)
  check(6, 'на шаге доктора видно решение прошлой ночи', await has(`Прошлой ночью: №${healed}`))
  await click(`Выбрать игрока №${healed}`)
  check(6, 'доктор снова лечит того же — предупреждение, запись не сделана', (await has('Этого игрока лечили прошлой ночью')) && (await exists('Записать всё равно')))
  await click(`Выбрать игрока №${C[4]}`)
  await stepNav('Проститутка'); await sleep(200); await click(`Выбрать игрока №${S}`)
  await stepNav('Шериф'); await sleep(200)
  check(6, 'шериф заблокирован: плашка «заблокирован — проверка не состоялась»', await has('заблокирован — проверка не состоялась'))
  await click(`Выбрать игрока №${G}`)
  check(6, 'заблокированному шерифу ответ не показан', !(await js(`!!document.querySelector('.answer')`)))
  await stepNav('Итог ночи'); await sleep(200)
  check(6, 'итог: никто не выбыл, доктор вылечил', (await txt('.answer-big')) === `Никто не выбыл: доктор вылечил №${C[4]}`, await txt('.answer-big'))
  await main('Никто не выбыл · начать День 3')

  // ── Шаг 7: День 3 — выставлен один игрок, шериф ──
  await click('Пропустить балаган'); await click('Выбрать игрока №5')
  const first3 = (await table()).filter((p) => !p.out).map((p) => p.seat).find((s) => s >= 5)
  await main('Дать слово'); await click(`№${first3} выставляет…`); await click(`Выбрать игрока №${S}`)
  await stepNav('Оправдания'); await sleep(200)
  await main(`Оправдание №${S}`)
  check(7, 'один кандидат: голосования нет, главная кнопка «выгнан → прощание»', await exists(`№${S} выгнан → прощание`))
  await main(`№${S} выгнан → прощание`)
  check(7, 'шериф выгнан, шаг «Прощание»', (await where()) === 'День 3 · Прощание' && (await table()).find((p) => p.seat === S).out)
  await main(`Прощание №${S}`); await main('Город засыпает: Ночь 3')

  // ── Шаг 8: Ночь 3 и День 4 ──
  check(8, 'шаг шерифа серый: «выбыл · разбудить для вида»', await js(`[...document.querySelectorAll('.night-step')].some((b) => b.innerText.includes('Шериф') && b.innerText.includes('выбыл · разбудить для вида'))`))
  await click(`Выбрать игрока №${C[4]}`)
  await stepNav('Проститутка'); await sleep(200); await click(`Выбрать игрока №${G}`)
  await stepNav('Итог ночи'); await sleep(200)
  check(8, 'блок крёстного отца: «Никто не выбыл: выстрела не было»', (await txt('.answer-big')) === 'Никто не выбыл: выстрела не было', await txt('.answer-big'))
  await main('Никто не выбыл · начать День 4')
  await click('Пропустить балаган'); await click('Выбрать игрока №5')
  const alive4 = (await table()).filter((p) => !p.out).length
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
    && !(await js(`!!document.querySelector('.card-role, .answer, .card-picked, .card-mark-night')`)) && !(await has('Просыпается мафия —')) && (await has('Просыпается мафия')))
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
