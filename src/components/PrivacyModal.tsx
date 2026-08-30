import { useState, useEffect } from 'preact/hooks';
import { CloseIcon, ShieldCheckIcon, CheckIcon } from './icons';
import type { Language } from './LandingPage';

interface PrivacyModalProps {
  isOpen: boolean;
  lang: Language;
  onClose: () => void;
  onAccept: () => void;
}

export function PrivacyModal({ isOpen, lang, onClose, onAccept }: PrivacyModalProps) {
  const [isAgreed, setIsAgreed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAgreed(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const t = {
    ru: {
      title: 'Политика конфиденциальности и условия использования',
      subtitle: 'Версия 2.4 · Последнее обновление: Август 2026',
      close: 'Закрыть',
      checkboxLabel: 'Я прочитал и принимаю условия использования и политику конфиденциальности',
      acceptBtn: 'Перейти к монитору',
      cancelBtn: 'Отмена',

      section1Title: '1. Общие положения и назначение сервиса',
      section1Text:
        'Веб-приложение Tajikistan Monitor («Сервис») представляет собой независимый агрегатор открытых официальных данных Республики Таджикистан. Сервис не является коммерческой организацией, не собирает персональные данные граждан для продажи и не передаёт сведения рекламным сетям.',

      section2Title: '2. Сбор и обработка данных о местоположении',
      section2Text:
        'Сервис может запрашивать или использовать ваше приблизительное местоположение (город или район), исключительно для следующих технических целей: расчёт и отображение локальной температуры воздуха (°C), предоставление точного прогноза погоды и своевременное оповещение о штормовых и чрезвычайных предупреждениях в выбранном регионе. Точные GPS-координаты пользователя не сохраняются в постоянных базах данных и не привязываются к вашей личности.',

      section3Title: '3. Локальное хранение на устройстве пользователя',
      section3Text:
        'Вся служебная информация, необходимая для комфортной работы (выбранная тема оформления интерфейса, язык отображения RU/TJ, фильтры карты и статус принятия настоящего соглашения), сохраняется исключительно локально в памяти вашего браузера с использованием механизма localStorage. Данная информация никогда не отправляется на сторонние аналитические сервера.',

      section4Title: '4. Техническая информация веб-запросов',
      section4Text:
        'При обращении к серверам приложений в автоматическом режиме обрабатываются стандартные системные заголовки (User-Agent, тип браузера, время отправки запроса). Данные параметры используются исключительно для защиты сетевой инфраструктуры от DDoS-атак, оптимизации скорости загрузки контента и балансировки нагрузки.',

      section5Title: '5. Отсутствие рекламы, трекеров и сторонних SDK',
      section5Text:
        'В программном коде платформы полностью отсутствуют сторонние рекламные сети (Google AdSense, Яндекс.Директ и др.), маркетинговые пиксели, трекеры социальных сетей и скрытые скрипты профилирования. Сервис ориентирован на чистоту информации и безопасность каждого пользователя.',

      section6Title: '6. Отказ от ответственности и достоверность первоисточников',
      section6Text:
        'Все новостные сообщения, гидрометеорологические сводки, курсы валют и сообщения о ЧС транслируются в режиме реального времени напрямую из официальных ведомственных источников (НИАТ «Ховар», КЧС РТ, Агентство статистики, НБТ, Агентство по гидрометеорологии). Администрация сервиса обеспечивает техническую целостность доставки информации, но не несёт ответственности за содержание первоисточников.',
    },
    tg: {
      title: 'Сиёсати махфият ва шартҳои истифодабарӣ',
      subtitle: 'Нусхаи 2.4 · Навсозии охирин: Августи 2026',
      close: 'Пӯшидан',
      checkboxLabel: 'Ман бо шартҳои истифодабарӣ ва сиёсати махфият шинос шудам ва онҳоро қабул мекунам',
      acceptBtn: 'Ба монитор гузаред',
      cancelBtn: 'Бекор кардан',

      section1Title: '1. Муқаррароти умумӣ ва ҳадафи барнома',
      section1Text:
        'Барномаи интернетии Tajikistan Monitor («Хизматрасонӣ») як агрегатори мустақили маълумоти кушодаи расмии Ҷумҳурии Тоҷикистон мебошад. Ин лоиҳа тиҷоратӣ набуда, маълумоти шахсии корбаронро ҷамъоварӣ намекунад ва ба шабакаҳои таблиғотӣ намедиҳад.',

      section2Title: '2. Истифодаи маълумот оид ба ҷойгиршавӣ',
      section2Text:
        'Барнома метавонад ҷойгиршавии тахминии шуморо (шаҳр ё ноҳия) танҳо бо чунин мақсадҳои техникӣ истифода барад: ҳисоб ва нишон додани дараҷаи ҳарорати ҳаво (°C), пешгӯии дақиқи обу ҳаво ва огоҳсозии саривақтӣ оид ба ҳолатҳои фавқулодда дар минтақаи интихобшуда. Координатаҳои дақиқи GPS дар пойгоҳи додаҳо захира намешаванд.',

      section3Title: '3. Нигоҳдории маҳаллӣ дар дастгоҳи корбар',
      section3Text:
        'Ҳамаи танзимоти интихобкардаи шумо (намуди торик ё равшан, забони интерфейс RU/TJ, филтрҳои харита ва ҳолати розигӣ) танҳо дар хотираи браузери шумо (localStorage) нигоҳ дошта шуда, ба дигар серверҳо фиристода намешаванд.',

      section4Title: '4. Маълумоти техникии дархостҳо',
      section4Text:
        'Ҳангоми истифодаи барнома танҳо маълумоти техникии стандартии браузер (User-Agent, намуди дастгоҳ, вақти дархост) барои таъмини амният, пешгирии ҳамлаҳои шабакавӣ ва интиқоли босуръати маълумот коркард мешавад.',

      section5Title: '5. Набудани таблиғот ва пайгирии пинҳонӣ',
      section5Text:
        'Дар коди барнома ҳеҷ гуна шабакаҳои таблиғотӣ, пикселҳои маркетингӣ ва пайгирони шабакаҳои иҷтимоӣ вуҷуд надоранд. Барнома барои амният ва дастрасии озоди шаҳрвандон ба иттилооти тоза пешбинӣ шудааст.',

      section6Title: '6. Масъулият ва сарчашмаҳои расмӣ',
      section6Text:
        'Ҳамаи хабарҳо, огоҳиҳои обу ҳаво, қурби асъор ва ҳолатҳои фавқулодда мустақиман аз сарчашмаҳои расмии давлатӣ (АМИТ «Ховар», КҲФ-и ҶТ, Агентии омор, БМТ, Хадамоти обуҳавосанҷӣ) дастрас карда мешаванд.',
    },
  }[lang];

  return (
    <div class="modal-backdrop privacy-modal-backdrop" onClick={onClose}>
      <section class="privacy-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div class="privacy-modal-header">
          <div class="privacy-modal-title-group">
            <div class="privacy-modal-icon-badge">
              <ShieldCheckIcon size={20} />
            </div>
            <div>
              <h3>{t.title}</h3>
              <small>{t.subtitle}</small>
            </div>
          </div>
          <button type="button" class="modal-close-btn" onClick={onClose} aria-label={t.close}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div class="privacy-modal-body">
          <div class="privacy-doc-section">
            <h4>{t.section1Title}</h4>
            <p>{t.section1Text}</p>
          </div>

          <div class="privacy-doc-section">
            <h4>{t.section2Title}</h4>
            <p>{t.section2Text}</p>
          </div>

          <div class="privacy-doc-section">
            <h4>{t.section3Title}</h4>
            <p>{t.section3Text}</p>
          </div>

          <div class="privacy-doc-section">
            <h4>{t.section4Title}</h4>
            <p>{t.section4Text}</p>
          </div>

          <div class="privacy-doc-section">
            <h4>{t.section5Title}</h4>
            <p>{t.section5Text}</p>
          </div>

          <div class="privacy-doc-section">
            <h4>{t.section6Title}</h4>
            <p>{t.section6Text}</p>
          </div>
        </div>

        {/* Checkbox agreement bar */}
        <div class="privacy-agreement-checkbox-bar">
          <label class="privacy-checkbox-label">
            <input
              type="checkbox"
              class="privacy-checkbox-input"
              checked={isAgreed}
              onChange={(e) => setIsAgreed(e.currentTarget.checked)}
            />
            <span class="privacy-checkbox-custom" aria-hidden="true">
              <CheckIcon size={13} strokeWidth={3} />
            </span>
            <span class="privacy-checkbox-text">{t.checkboxLabel}</span>
          </label>
        </div>

        <div class="privacy-modal-footer">
          <button type="button" class="privacy-btn-cancel" onClick={onClose}>
            {t.cancelBtn}
          </button>
          <button
            type="button"
            class={`privacy-btn-accept${!isAgreed ? ' is-disabled' : ''}`}
            onClick={isAgreed ? onAccept : undefined}
            disabled={!isAgreed}
          >
            <CheckIcon size={18} strokeWidth={2.5} />
            <span>{t.acceptBtn}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
