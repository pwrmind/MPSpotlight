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
async function retrainModel() {
    if (sessionData.length === 0) return;

    const trainingData = sessionData.map(item => {
        const input = [
            item.price / 100000,
            item.rating / 5,
            item.position / 100,
            item.isSponsored ? 1 : 0,
            item.wasViewed // Признак того, что смотрели ранее
        ];
        const output = clickedProductIds.has(item.id) ? 1 : 0;
        
        return { input, output: [output] };
    });

    console.log(`Начало дообучения на ${trainingData.length} примерах...`);
    net.train(trainingData, {
        iterations: 1000,
        log: true,
        errorThresh: 0.005
    });
    console.log("Дообучение завершено.");

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
