import { useState } from 'preact/hooks';
import {
  SunIcon,
  MoonIcon,
  MapPinIcon,
  NewspaperIcon,
  SparklesIcon,
  LockIcon,
  ArrowRightIcon,
} from './icons';
import { PrivacyModal } from './PrivacyModal';

export type Language = 'ru' | 'tg';

interface LandingPageProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onAccept: () => void;
  initialLang?: Language;
}

export function LandingPage({
  theme,
  onToggleTheme,
  onAccept,
  initialLang = 'ru',
}: LandingPageProps) {
  const [lang, setLang] = useState<Language>(initialLang);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  const t = {
    ru: {
      badge: 'Официальный монитор Таджикистана',
      tagline: 'Национальная информационная платформа',
      heroTitlePrefix: 'Единый монитор событий и',
      heroTitleHighlight: 'официальных новостей',
      heroTitleSuffix: 'Таджикистана',
      heroDesc:
        'Верифицированные сводки государственных ведомств, интерактивная карта районов, оперативные предупреждения КЧС, температура воздуха и финансовая статистика в реальном времени.',
      enterBtn: 'Перейти к монитору',
      privacyBtn: 'Политика конфиденциальности',
      bentoTitle: 'Ключевые возможности платформы',
      bentoSubtitle: 'Разработано по принципам точности, чистоты данных и уважения к пользователю.',

      feature1Title: 'Только ведомственные первоисточники',
      feature1Desc:
        'Прямая агрегация новостей НИАТ «Ховар», КЧС Таджикистана, Агентства статистики, Гидрометцентра и Нацбанка (НБТ). Без слухов, фейков и кликбейта.',

      feature2Title: 'Умная карта 5 регионов и 68 районов',
      feature2Desc:
        'Иерархическое масштабирование городов и сёл без нагромождения надписей. Автоматический фокус на очагах предупреждений и границы OpenStreetMap.',

      feature3Title: 'Фактический ИИ-анализ первоисточников',
      feature3Desc:
        'Искусственный интеллект генерирует краткие выжимки строго по тексту официальных сообщений с прозрачными ссылками на первоисточники.',

      feature4Title: '100% Приватность и без рекламы',
      feature4Desc:
        'Никаких рекламных трекеров, маркетинговых пикселей и навязчивых баннеров. Чистый независимый интерфейс для граждан и исследователей.',

      footerRights: 'Все права защищены · Национальная панель мониторинга Таджикистана',
      footerGeodata: 'Картографические данные: © OpenStreetMap contributors · ODbL',
      directEnter: 'В монитор',
    },
    tg: {
      badge: 'Монитори расмии Тоҷикистон',
      tagline: 'Платформаи миллии иттилоотӣ',
      heroTitlePrefix: 'Монитори ягонаи рӯйдодҳо ва',
      heroTitleHighlight: 'ахбори расмии',
      heroTitleSuffix: 'Тоҷикистон',
      heroDesc:
        'Гузоришҳои тасдиқшудаи мақомоти давлатӣ, харитаи интерактивии ноҳияҳо, огоҳиҳои фаврии Кумитаи ҳолатҳои фавқулодда, ҳарорати ҳаво ва омори молиявӣ дар вақти воқеӣ.',
      enterBtn: 'Ба монитор гузаред',
      privacyBtn: 'Сиёсати махфият',
      bentoTitle: 'Имкониятҳои асосии платформа',
      bentoSubtitle: 'Бар асоси дақиқӣ, поксозии маълумот ва эҳтиром ба корбар сохта шудааст.',

      feature1Title: 'Танҳо сарчашмаҳои расмии давлатӣ',
      feature1Desc:
        'Ҷамъоварии мустақими хабарҳо аз АМИТ «Ховар», КҲФ-и Тоҷикистон, Агентии омор, Хадамоти обуҳавосанҷӣ ва Бонки миллии Тоҷикистон (БМТ). Бе овозаҳо ва спам.',

      feature2Title: 'Харитаи 5 минтақа ва 68 ноҳия',
      feature2Desc:
        'Миқёсбандии мураттаби шаҳру деҳот бе нофаҳмӣ ва навиштаҷоти зиёдатӣ. Тамаркузи худкор ба минтақаҳои изтирорӣ ва ҳудудҳои расмии OpenStreetMap.',

      feature3Title: 'Таҳлили далелҳо бо зеҳни сунъӣ',
      feature3Desc:
        'Зеҳни сунъӣ хулосаҳои кӯтоҳро танҳо бар асоси матни паёмҳои расмӣ бо пайвандҳои мустақим ба сарчашмаҳо таҳия мекунад.',

      feature4Title: '100% Махфият ва бидуни таблиғ',
      feature4Desc:
        'Ҳеҷ гуна пайгирӣ, пикселҳои маркетингӣ ва баннерҳои таблиғотӣ нест. Интерфейси озод ва мустақил барои шаҳрвандон ва муҳаққиқон.',

      footerRights: 'Ҳамаи ҳуқуқҳо маҳфузанд · Панели миллии мониторинги Тоҷикистон',
      footerGeodata: 'Маълумоти харита: © Саҳмгузорони OpenStreetMap · ODbL',
      directEnter: 'Ба монитор',
    },
  }[lang];

  const handleOpenPrivacy = () => {
    setIsPrivacyModalOpen(true);
  };

  const handleAcceptPrivacy = () => {
    setIsPrivacyModalOpen(false);
    onAccept();
  };

  return (
    <div class="landing-viewport">
      {/* Background ambient lighting */}
      <div class="landing-ambient-glow" aria-hidden="true" />

      {/* Top Navigation Bar */}
      <header class="landing-header">
        <div class="landing-header-inner">
          <div class="landing-brand">
            <img src="/logo.png" alt="Tajikistan Monitor Logo" class="landing-logo-img" />
            <div class="landing-brand-text">
              <strong>Tajikistan Monitor</strong>
              <span>{t.tagline}</span>
            </div>
          </div>

          <div class="landing-header-actions">
            {/* Language Switcher */}
            <div class="landing-lang-switch" role="group" aria-label="Интихоби забон / Выбор языка">
              <button
                type="button"
                class={`landing-lang-btn${lang === 'ru' ? ' is-active' : ''}`}
                onClick={() => setLang('ru')}
              >
                RU
              </button>
              <button
                type="button"
                class={`landing-lang-btn${lang === 'tg' ? ' is-active' : ''}`}
                onClick={() => setLang('tg')}
              >
                TJ
              </button>
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              class="landing-icon-btn"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              aria-label="Смена темы"
            >
              {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>

            {/* Direct Enter Button */}
            <button
              type="button"
              class="landing-nav-enter-btn"
              onClick={handleOpenPrivacy}
            >
              <span>{t.directEnter}</span>
              <ArrowRightIcon size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Scroll Area */}
      <main class="landing-main">
        {/* Hero Section */}
        <section class="landing-hero-section">
          <div class="landing-pill-tag">
            <span class="landing-pill-dot" />
            <span>{t.badge}</span>
          </div>

          <h1 class="landing-hero-title">
            {t.heroTitlePrefix} <span class="landing-hero-gradient">{t.heroTitleHighlight}</span> {t.heroTitleSuffix}
          </h1>

          <p class="landing-hero-desc">{t.heroDesc}</p>

          <div class="landing-hero-cta-group">
            <button
              type="button"
              class="landing-btn-primary"
              onClick={handleOpenPrivacy}
            >
              <span>{t.enterBtn}</span>
              <ArrowRightIcon size={16} />
            </button>

            {/* <button
              type="button"
              class="landing-btn-secondary"
              onClick={handleOpenPrivacy}
            >
              <ShieldCheckIcon size={16} />
              <span>{t.privacyBtn}</span>
            </button> */}
          </div>
        </section>

        {/* Bento Grid: 4 Core Features */}
        <section class="landing-bento-section">
          <div class="landing-section-heading">
            <h2>{t.bentoTitle}</h2>
            <p>{t.bentoSubtitle}</p>
          </div>

          <div class="landing-bento-grid">
            <div class="landing-bento-card">
              <div class="landing-card-icon-wrap accent-blue">
                <NewspaperIcon size={22} />
              </div>
              <h3>{t.feature1Title}</h3>
              <p>{t.feature1Desc}</p>
            </div>

            <div class="landing-bento-card">
              <div class="landing-card-icon-wrap accent-green">
                <MapPinIcon size={22} />
              </div>
              <h3>{t.feature2Title}</h3>
              <p>{t.feature2Desc}</p>
            </div>

            <div class="landing-bento-card">
              <div class="landing-card-icon-wrap accent-purple">
                <SparklesIcon size={22} />
              </div>
              <h3>{t.feature3Title}</h3>
              <p>{t.feature3Desc}</p>
            </div>

            <div class="landing-bento-card">
              <div class="landing-card-icon-wrap accent-amber">
                <LockIcon size={22} />
              </div>
              <h3>{t.feature4Title}</h3>
              <p>{t.feature4Desc}</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer class="landing-footer">
        <div class="landing-footer-inner">
          <p>© 2026 Tajikistan Monitor · {t.footerRights}</p>
          <small>{t.footerGeodata}</small>
        </div>
      </footer>

      {/* Privacy Agreement Modal */}
      <PrivacyModal
        isOpen={isPrivacyModalOpen}
        lang={lang}
        onClose={() => setIsPrivacyModalOpen(false)}
        onAccept={handleAcceptPrivacy}
      />
    </div>
  );
}
