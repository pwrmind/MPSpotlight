// background.js
// Загрузка библиотеки Brain.js динамически в сервис-воркере
importScripts('brain-browser.min.js');

const config = {
  inputSize: 5,       // 5 ваших признаков
  outputSize: 1,      // Вероятность клика (0 до 1)
  hiddenLayers: [10], // Один скрытый слой (обычно 2 * inputSize или около того)
  activation: 'sigmoid' // Подходит для вероятностного вывода от 0 до 1
};

let net = new brain.NeuralNetwork(config);
let sessionData = []; 
let clickedProductIds = new Set(); 
// Инициализируем пустым Set, данные загрузим позже в loadState()
let VIEWED_IDS = new Set();
let isModelReady = false; 

/**
 * Загрузка модели и истории просмотров из локального хранилища при старте расширения
 */
async function loadState() {
    console.log("Загрузка состояния модели...");
    const storageData = await chrome.storage.local.get(['viewedIds', 'modelWeights']);
    
    VIEWED_IDS = new Set(storageData.viewedIds || []);

    if (storageData.modelWeights) {
        net.fromJSON(storageData.modelWeights);
        console.log("Модель Brain.js загружена из хранилища.");
    } else {
        console.log("Новая модель Brain.js инициализирована (пустая).");
        // При первой загрузке модель пустая, но готова к обучению.
    }
    
    isModelReady = true; // Модель готова к работе (предсказанию/обучению)
    console.log("Модель готова к использованию.");
}

/**
 * Сохранение весов модели в локальное хранилище после дообучения
 */
async function saveModelWeights() {
    const jsonModel = net.toJSON();
    await chrome.storage.local.set({ modelWeights: jsonModel });
    console.log("Веса модели сохранены.");
}

/**
 * Функция дообучения модели Brain.js
 */
/**
 * Функция дообучения модели Brain.js на собранных данных с балансировкой
 */
async function retrainModel() {
    if (sessionData.length === 0) return;

    let positiveExamples = [];
    let negativeExamples = [];

    // Разделяем примеры на положительные и отрицательные
    sessionData.forEach(item => {
        // --- ФОРМИРОВАНИЕ ВХОДНОГО ВЕКТОРА ПРЯМО ЗДЕСЬ ---
        const input = [
            item.price / 100000, // Нормализация цены
            item.rating / 5,     // Нормализация рейтинга
            item.position / 100, // Нормализация позиции
            item.isSponsored ? 1 : 0,
            item.wasViewed       // Признак того, что смотрели ранее
        ];
        // --------------------------------------------------

        const output = clickedProductIds.has(item.id) ? 1 : 0;
        const trainingExample = { input, output: [output] };

        if (output === 1) {
            positiveExamples.push(trainingExample);
        } else {
            negativeExamples.push(trainingExample);
        }
    });

    // === ЛОГИКА НЕДОСЕМПЛИРОВАНИЯ ===
    // Мы хотим, чтобы количество отрицательных примеров было не сильно больше положительных.
    const maxNegativeSamples = positiveExamples.length * 2; // Например, в 5 раз больше кликов
    
    let balancedNegativeExamples = [];
    if (negativeExamples.length > maxNegativeSamples) {
        // Перемешиваем и выбираем только нужное количество случайных примеров
        const shuffledNegatives = negativeExamples.sort(() => 0.5 - Math.random());
        balancedNegativeExamples = shuffledNegatives.slice(0, maxNegativeSamples);
    } else {
        balancedNegativeExamples = negativeExamples;
    }
    // ==================================

    // Объединяем сбалансированные данные
    const trainingData = [...positiveExamples, ...balancedNegativeExamples];

    // Перемешиваем итоговый набор, чтобы обучение шло эффективнее
    trainingData.sort(() => 0.5 - Math.random());
    
    console.log(`Начало дообучения. Положительных: ${positiveExamples.length}, Отрицательных (сбалансировано): ${balancedNegativeExamples.length}`);

    net.train(trainingData, {
        iterations: 1000, 
        log: true,
        errorThresh: 0.005
    });

    await saveModelWeights();
    sessionData = [];
    clickedProductIds.clear();
}

/**
 * Предсказывает вероятность интереса к товару ТОЛЬКО если модель готова
 */
function predictInterest(productData) {
    if (!isModelReady) {
        console.warn("Модель еще не готова. Предсказание пропущено.");
        return 0; // Возвращаем 0 или другое значение по умолчанию
    }

    const input = [
        productData.price / 100000, 
        productData.rating / 5,
        productData.position / 100,
        productData.isSponsored ? 1 : 0,
        productData.wasViewed
    ];
    const output = net.run(input); 
    return output;
}

/**
 * Обработчик сообщений от content.js
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'INIT_SESSION':
            sessionData = request.payload;
            sessionData.forEach(product => {
                if (VIEWED_IDS.has(product.id)) { // Используем исправленную переменную
                    product.wasViewed = 1;
                }
            });
            break;

        case 'USER_CLICK':
            clickedProductIds.add(request.payload.productId);
            VIEWED_IDS.add(request.payload.productId); // Используем исправленную переменную
            chrome.storage.local.set({ viewedIds: Array.from(VIEWED_IDS) });
            break;

        case 'SESSION_END':
            retrainModel();
            break;
            
        case 'PREDICT_INTEREST':
            // Добавляем проверку здесь, чтобы не обрабатывать весь массив, если модель не готова
            if (!isModelReady) {
                console.warn("Получен запрос на предсказание, но модель не готова.");
                sendResponse({ predictions: [] }); // Отправляем пустой ответ
                return true;
            }
            
            const predictions = request.payload.map(product => {
                // В predictInterest уже есть проверка, но лучше иметь её и здесь для оптимизации
                const probability = predictInterest(product); 
                return { id: product.id, probability: probability };
            });
            sendResponse({ predictions: predictions });
            return true;
    }
});

// Запускаем загрузку состояния при старте фонового скрипта
loadState();
