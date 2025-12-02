// content.js

/**
 * Функция для парсинга данных о товарах на странице выдачи
 * !! ВАЖНО: Селекторы ниже - это ПРИМЕРЫ. Вам нужно будет заменить их
 * на актуальные CSS-селекторы конкретного маркетплейса (Ozon, Wildberries).
 * 
 * @returns {Array<Object>} Массив объектов с данными о товарах
 */

let isInitialize = false;

function parseProductListings() {
    console.log("[MP] parseProductListings");
    // ЗАМЕНИТЕ ЭТИ СЕЛЕКТОРЫ НА РЕАЛЬНЫЕ:
    const productElements = document.querySelectorAll('.product-card'); 
    const productsData = [];

    productElements.forEach((el, index) => {
        try {
            const productId = el.getAttribute('id');
            const priceEl = el.querySelector('.price__lower-price');
            const ratingEl = el.querySelector('.product-card__rating-wrap');
            const reviewsEl = el.querySelector('.product-card__count');

            if (!productId || !priceEl) return;

            // Очистка и преобразование данных в числа
            const price = parseFloat(priceEl.textContent.replace(/[^\d,\.]/g, '').replace(',', '.'));
            const rating = parseFloat(ratingEl ? ratingEl.textContent : '0');
            const reviewsCount = parseInt(reviewsEl ? reviewsEl.textContent.replace(/\D/g, '') : '0');
            const isSponsored = !!el.querySelector('.product-card__badge--sponsored');

            productsData.push({
                id: productId,
                price: price,
                rating: rating,
                reviews: reviewsCount,
                position: index + 1,
                isSponsored: isSponsored,
                wasViewed: 0 // Заполняется в background.js
            });
        } catch (error) {
            console.error("Ошибка парсинга товара:", error);
        }
    });

    return productsData;
}

/**
 * Отправка данных в фоновый скрипт background.js
 * @param {Array<Object>|Object|null} data Данные товаров или клика
 * @param {string} type Тип сообщения (INIT_SESSION, USER_CLICK, SESSION_END)
 */
function sendDataToBackground(data, type) {
    chrome.runtime.sendMessage({
        action: type,
        payload: data,
        url: window.location.href
    });
}

/**
 * Применение стилей подсветки к карточкам на основе предсказаний
 */
function applyCardHighlighting(predictions) {
    predictions.forEach(prediction => {
        // !! Используйте ваш актуальный селектор карточки, содержащий data-product-id
        const cardElement = document.querySelector(`.product-card[id="${prediction.id}"]`);
        if (cardElement) {
            const probability = prediction.probability;
            let highlightColor = 'transparent';

            if (probability >= 0.8) {
                highlightColor = 'rgba(0, 255, 0, 0.5)'; // Зеленый, очень интересно
            } else if (probability >= 0.5) {
                highlightColor = 'rgba(255, 255, 0, 0.4)'; // Желтый, возможно интересно
            } else if (probability >= 0.1) {
                highlightColor = 'rgba(0, 128, 255, 0.62)'; // Желтый, возможно интересно
            } else {
                highlightColor = 'rgba(255, 0, 0, 0.56)'; // Желтый, возможно интересно
            }

            // Применяем стиль box-shadow для подсветки
            cardElement.style.boxShadow = `0 0 10px 3px ${highlightColor}`;
            cardElement.style.transition = 'box-shadow 0.5s ease-in-out';
        }
    });
}

/**
 * Запрос предсказаний у фонового скрипта и применение стилей
 */
async function requestAndApplyPredictions(productsData) {
    chrome.runtime.sendMessage({
        action: 'PREDICT_INTEREST',
        payload: productsData
    }, (response) => {
        if (response && response.predictions) {
            applyCardHighlighting(response.predictions);
        }
    });
}

/**
 * Настройка слушателей кликов по товарам
 */
function setupClickListeners() {
    document.body.addEventListener('click', (event) => {
        const productCard = event.target.closest('.product-card');
        if (productCard) {
            const productId = productCard.getAttribute('id');
            if (productId) {
                sendDataToBackground({ productId: productId }, 'USER_CLICK');
            }
        }
    }, true);
}

/**
 * Инициализация логики на странице при загрузке/обновлении контента
 */
function initializeContentScript() {
    console.log("Поиск товаров на странице...");
    const productList = parseProductListings();
    
    if (productList.length > 0) {
        console.log(`Найдено ${productList.length} товаров. Инициализация.`);
        sendDataToBackground(productList, 'INIT_SESSION');
        // setupClickListeners() можно вызвать один раз при старте скрипта
        requestAndApplyPredictions(productList); 
    } else {
        console.warn("Товары не найдены при первой попытке.");
    }
}


// === ТОЧКА ВХОДА И НАБЛЮДАТЕЛЬ ===

// Функция для старта наблюдения за DOM
function observeDOMChanges() {
    // Вызываем инициализацию сразу, если товары уже есть
    initializeContentScript(); 

    // Выбираем целевой узел (контейнер, где появляются товары)
    // !! ЗАМЕНИТЕ '.products-container-selector' на реальный селектор контейнера товаров
    const targetNode = document.querySelector('.products-container-selector') || document.body;

    const config = { childList: true, subtree: true };

    const callback = function(mutationsList, observer) {
        for(const mutation of mutationsList) {
            // Проверяем, были ли добавлены новые узлы (товары)
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Как только видим, что что-то добавилось, перезапускаем инициализацию
                // Это поймает момент, когда SPA закончил рендеринг
                console.log("DOM изменился (новые товары?), переинициализация...");
                initializeContentScript();
                // Можно добавить логику для отписки от observer, если нужно только один раз
                // observer.disconnect(); 
            }
        }
    };

    const observer = new MutationObserver(callback);
    observer.observe(targetNode, config);
    console.log("Наблюдение за изменениями DOM активировано.");
}

// Запуск наблюдателя сразу, как только скрипт внедрен
observeDOMChanges();
setupClickListeners(); // Слушатели кликов можно повесить один раз на body

window.addEventListener('beforeunload', () => {
    sendDataToBackground(null, 'SESSION_END');
});
