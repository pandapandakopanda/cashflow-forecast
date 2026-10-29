# Порядок выполнения задач — Cashflow Forecast

**Начало:** [FIN-01](https://github.com/pandapandakopanda/cashflow-forecast/issues/1).  
**Где все задачи:** [Issues](https://github.com/pandapandakopanda/cashflow-forecast/issues).  
**Макет:** [UI-REFERENCE.svg](./UI-REFERENCE.svg). **Палитра и список компонентов:** [UI-GUIDE.md](./UI-GUIDE.md). **API:** [API.md](./API.md). **Общие правила:** [SPEC.md](../SPEC.md).

## Как пользоваться

1. Открывай следующую задачу по порядку из списка ниже. Если указана зависимость — сначала сделай её.
2. В задаче есть готовые поля, URL, конкретные файлы, шаги и список «Проверить». **Придумывать бизнес-логику или контракт не нужно.**
3. Пиши код сама, проверяй чекбоксы и коммить результат.
4. Переноси карточку на своей GitHub Projects доске: **Ready → In progress → In review → Done**. Подробности реализации/непонятные моменты — обсудим отдельно.
5. Не надо добавлять в MVP новые страницы, аналитические отчёты, авторизацию, категории и другие функции сверх SPEC.md.

**Оценка только чистой работы по карточкам:** около 47–68 часов; изучение Redux Toolkit, RTK Query и исправление ошибок могут сделать реальный срок больше. Это ориентир, не требование уложиться любой ценой в две недели.

## Этап 1. Основа проекта (FIN-01–FIN-04)

Пока не делаем финансовый UI. Только запускаем клиент и сервер.

- [ ] [FIN-01 — Создать папки client и server](https://github.com/pandapandakopanda/cashflow-forecast/issues/1) (30–45 мин)
- [ ] [FIN-02 — Запустить React + Vite + TypeScript](https://github.com/pandapandakopanda/cashflow-forecast/issues/2) (45–60 мин)
- [ ] [FIN-03 — Подключить Tailwind и цвета макета](https://github.com/pandapandakopanda/cashflow-forecast/issues/3) (45–60 мин)
- [ ] [FIN-04 — Запустить Express и GET /api/health](https://github.com/pandapandakopanda/cashflow-forecast/issues/4) (45–60 мин)

## Этап 2. База и получение месяца (FIN-05–FIN-10)

Подготовим данные и первый GET по готовому контракту.

- [ ] [FIN-05 — Подключить проверку входных данных и формат ошибок](https://github.com/pandapandakopanda/cashflow-forecast/issues/5) (60–90 мин)
- [ ] [FIN-06 — Подключить SQLite к серверу](https://github.com/pandapandakopanda/cashflow-forecast/issues/6) (45–60 мин)
- [ ] [FIN-07 — Создать в SQLite таблицу начальных остатков](https://github.com/pandapandakopanda/cashflow-forecast/issues/7) (30–45 мин)
- [ ] [FIN-08 — Создать таблицу разовых операций](https://github.com/pandapandakopanda/cashflow-forecast/issues/8) (45–60 мин)
- [ ] [FIN-09 — Создать таблицы ежемесячных правил и исключений](https://github.com/pandapandakopanda/cashflow-forecast/issues/9) (60–90 мин)
- [ ] [FIN-10 — Сделать GET месячного плана](https://github.com/pandapandakopanda/cashflow-forecast/issues/10) (90–120 мин)

## Этап 3. API-запросы на запись (FIN-11–FIN-21)

Каждый endpoint отдельной небольшой задачей. После этапа API готов к подключению.

- [ ] [FIN-11 — Сделать PUT начального остатка месяца](https://github.com/pandapandakopanda/cashflow-forecast/issues/11) (45–60 мин)
- [ ] [FIN-12 — Сделать POST разовой операции](https://github.com/pandapandakopanda/cashflow-forecast/issues/12) (45–60 мин)
- [ ] [FIN-13 — Сделать PATCH разовой операции](https://github.com/pandapandakopanda/cashflow-forecast/issues/13) (45–60 мин)
- [ ] [FIN-14 — Сделать DELETE разовой операции](https://github.com/pandapandakopanda/cashflow-forecast/issues/14) (30–45 мин)
- [ ] [FIN-15 — Сделать GET ежемесячных правил](https://github.com/pandapandakopanda/cashflow-forecast/issues/15) (30–45 мин)
- [ ] [FIN-16 — Сделать POST ежемесячного правила](https://github.com/pandapandakopanda/cashflow-forecast/issues/16) (45–60 мин)
- [ ] [FIN-17 — Сделать PATCH ежемесячного правила](https://github.com/pandapandakopanda/cashflow-forecast/issues/17) (45–60 мин)
- [ ] [FIN-18 — Сделать DELETE ежемесячного правила](https://github.com/pandapandakopanda/cashflow-forecast/issues/18) (30–45 мин)
- [ ] [FIN-19 — Сделать PUT исключения одного месяца](https://github.com/pandapandakopanda/cashflow-forecast/issues/19) (60–90 мин)
- [ ] [FIN-20 — Сделать DELETE исключения месяца](https://github.com/pandapandakopanda/cashflow-forecast/issues/20) (30–45 мин)
- [ ] [FIN-21 — Сделать POST применения эксперимента одним запросом](https://github.com/pandapandakopanda/cashflow-forecast/issues/21) (120–180 мин)

## Этап 4. Утилиты, Redux и RTK Query (FIN-22–FIN-27)

Только конкретные конвертеры и запросы из docs/API.md.

- [ ] [FIN-22 — Создать конвертеры денег и дат](https://github.com/pandapandakopanda/cashflow-forecast/issues/22) (45–60 мин)
- [ ] [FIN-23 — Подключить Redux Toolkit store и типизированные хуки](https://github.com/pandapandakopanda/cashflow-forecast/issues/23) (45–60 мин)
- [ ] [FIN-24 — RTK Query: получить данные выбранного месяца](https://github.com/pandapandakopanda/cashflow-forecast/issues/24) (60–90 мин)
- [ ] [FIN-25 — RTK Query: mutation для начального остатка](https://github.com/pandapandakopanda/cashflow-forecast/issues/25) (45–60 мин)
- [ ] [FIN-26 — RTK Query: mutations разовых операций](https://github.com/pandapandakopanda/cashflow-forecast/issues/26) (60–90 мин)
- [ ] [FIN-27 — RTK Query: запросы ежемесячных правил](https://github.com/pandapandakopanda/cashflow-forecast/issues/27) (60–90 мин)

## Этап 5. Компоненты и формы (FIN-28–FIN-38)

Собираем экран по визуальному макету, компонент за компонентом.

- [ ] [FIN-28 — Создать компонент AppHeader](https://github.com/pandapandakopanda/cashflow-forecast/issues/28) (30–45 мин)
- [ ] [FIN-29 — Создать компонент MonthSwitcher](https://github.com/pandapandakopanda/cashflow-forecast/issues/29) (45–60 мин)
- [ ] [FIN-30 — Сверстать OpeningBalanceCard](https://github.com/pandapandakopanda/cashflow-forecast/issues/30) (30–45 мин)
- [ ] [FIN-31 — Сделать форму OpeningBalanceDialog](https://github.com/pandapandakopanda/cashflow-forecast/issues/31) (60–90 мин)
- [ ] [FIN-32 — Создать универсальную карточку SummaryCard](https://github.com/pandapandakopanda/cashflow-forecast/issues/32) (30–45 мин)
- [ ] [FIN-33 — Сделать общую оболочку модального окна](https://github.com/pandapandakopanda/cashflow-forecast/issues/33) (30–45 мин)
- [ ] [FIN-34 — Сделать OperationsList со списком платежей](https://github.com/pandapandakopanda/cashflow-forecast/issues/34) (60–90 мин)
- [ ] [FIN-35 — Сверстать форму разовой операции](https://github.com/pandapandakopanda/cashflow-forecast/issues/35) (60–90 мин)
- [ ] [FIN-36 — Подключить создание, изменение и удаление разовой операции](https://github.com/pandapandakopanda/cashflow-forecast/issues/36) (60–90 мин)
- [ ] [FIN-37 — Добавить режим «Ежемесячно» в форму операции](https://github.com/pandapandakopanda/cashflow-forecast/issues/37) (60–90 мин)
- [ ] [FIN-38 — Сделать выбор области редактирования регулярной операции](https://github.com/pandapandakopanda/cashflow-forecast/issues/38) (60–90 мин)

## Этап 6. Финансовый прогноз (FIN-39–FIN-41)

Формулы, селекторы, график.

- [ ] [FIN-39 — Сделать функцию расчёта дневного остатка](https://github.com/pandapandakopanda/cashflow-forecast/issues/39) (60–90 мин)
- [ ] [FIN-40 — Создать селекторы показателей прогноза](https://github.com/pandapandakopanda/cashflow-forecast/issues/40) (45–60 мин)
- [ ] [FIN-41 — Сверстать SVG-график ежедневного остатка](https://github.com/pandapandakopanda/cashflow-forecast/issues/41) (60–90 мин)

## Этап 7. Режим «Что, если?» (FIN-42–FIN-47)

Локальная копия, действия Redux, сравнение и серверное применение.

- [ ] [FIN-42 — Redux: создать копию месяца для эксперимента](https://github.com/pandapandakopanda/cashflow-forecast/issues/42) (60–90 мин)
- [ ] [FIN-43 — Redux: редактировать операции внутри эксперимента](https://github.com/pandapandakopanda/cashflow-forecast/issues/43) (60–90 мин)
- [ ] [FIN-44 — Сравнить итоговый и минимальный остатки двух планов](https://github.com/pandapandakopanda/cashflow-forecast/issues/44) (45–60 мин)
- [ ] [FIN-45 — Нарисовать вторую линию на графике эксперимента](https://github.com/pandapandakopanda/cashflow-forecast/issues/45) (30–45 мин)
- [ ] [FIN-46 — Сценарий: сброс и уход с несохранёнными изменениями](https://github.com/pandapandakopanda/cashflow-forecast/issues/46) (45–60 мин)
- [ ] [FIN-47 — RTK Query: применить эксперимент к основному плану](https://github.com/pandapandakopanda/cashflow-forecast/issues/47) (60–90 мин)

## Этап 8. Качество и публикация (FIN-48–FIN-56)

Состояния, мобильный UI, тесты, CI, README, безопасная демоверсия.

- [ ] [FIN-48 — Показать загрузку, пустые данные и ошибку API](https://github.com/pandapandakopanda/cashflow-forecast/issues/48) (45–60 мин)
- [ ] [FIN-49 — Привести главный экран к мобильной ширине](https://github.com/pandapandakopanda/cashflow-forecast/issues/49) (45–60 мин)
- [ ] [FIN-50 — Написать unit-тесты конвертеров и прогноза](https://github.com/pandapandakopanda/cashflow-forecast/issues/50) (60–90 мин)
- [ ] [FIN-51 — Написать интеграционные тесты Node.js API](https://github.com/pandapandakopanda/cashflow-forecast/issues/51) (90–120 мин)
- [ ] [FIN-52 — Проверить формы и ошибки компонентными тестами](https://github.com/pandapandakopanda/cashflow-forecast/issues/52) (45–60 мин)
- [ ] [FIN-53 — Сделать один E2E-тест полного сценария](https://github.com/pandapandakopanda/cashflow-forecast/issues/53) (60–90 мин)
- [ ] [FIN-54 — Подключить GitHub Actions для проверок](https://github.com/pandapandakopanda/cashflow-forecast/issues/54) (45–60 мин)
- [ ] [FIN-55 — Оформить README и скриншоты для работодателя](https://github.com/pandapandakopanda/cashflow-forecast/issues/55) (45–60 мин)
- [ ] [FIN-56 — Подготовить безопасную демонстрацию проекта](https://github.com/pandapandakopanda/cashflow-forecast/issues/56) (60–120 мин)

## Когда просить уточнение

Если в задаче **отсутствуют нужные данные** (например, не названо обязательное поле или поведение ошибки), это недостаток постановки. Не придумывай решение молча: уточним и дополним конкретную Issue / docs/API.md. Если неясно **как это сделать в коде**, можно отдельно разобрать принцип работы технологии без готового решения.
