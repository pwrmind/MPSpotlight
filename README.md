# Click‑Predictor Chrome Extension  

A lightweight Chrome/Edge extension that predicts the probability that a user will click on a product card on a marketplace (Wildberries, Ozon, etc.) and highlights the most interesting items in‑page.  
It runs **entirely in the browser** using **Brain.js** (a neural‑network library) and stores the model locally, so no data ever leaves the user’s device.

---  

## Table of Contents  

1. [Features](#features)  
2. [How It Works](#how-it-works)  
3. [Installation](#installation)  
4. [File Overview](#file-overview)  
5. [Configuration & Customisation](#configuration--customisation)  
6. [Data Flow & Storage](#data-flow--storage)  
7. [Training & Inference Details](#training--inference-details)  
8. [Development & Building](#development--building)  
9. [License](#license)  

---  

## Features  

| ✅ | Description |
|---|-------------|
| **On‑page product parsing** | `content.js` extracts price, rating, position, sponsor flag, etc. (selectors are placeholders – replace with the target marketplace). |
| **Local neural network** | Brain.js model with 5 inputs → 1 output (click probability). |
| **Incremental training** | After each browsing session the model is re‑trained on the collected data, with class‑balancing to avoid bias toward “no‑click”. |
| **Highlighting** | Cards are coloured (green → high interest, red → low) using a `box‑shadow` overlay. |
| **Zero‑server** | All weights are saved in `chrome.storage.local`; no network requests. |
| **Session handling** | `INIT_SESSION`, `USER_CLICK`, `SESSION_END` messages keep the model up‑to‑date. |
| **Extensible** | Add more input features, change network architecture, or plug a different ML library. |

---  

## How It Works  

1. **Background script (`background.js`)**  
   * Loads `brain-browser.min.js` in the service worker.  
   * On start → `loadState()` reads previously saved model weights and the set of already viewed product IDs from `chrome.storage.local`.  
   * Listens for messages from the content script:  
     * `INIT_SESSION` – receives the list of products on the current page, marks those already viewed.  
     * `USER_CLICK` – records a click, adds the product ID to the viewed set.  
     * `SESSION_END` – triggers `retrainModel()`.  
     * `PREDICT_INTEREST` – runs inference for each product and returns probabilities.  

2. **Content script (`content.js`)**  
   * Parses the DOM for product cards (`parseProductListings`).  
   * Sends the product array to the background (`INIT_SESSION`).  
   * Sets a `MutationObserver` to re‑parse when the page dynamically loads new items (SPA behaviour).  
   * Listens for click events on any `.product-card` and forwards the product ID (`USER_CLICK`).  
   * Requests predictions (`PREDICT_INTEREST`) and applies coloured `box‑shadow` overlays (`applyCardHighlighting`).  

3. **Model**  
   * **Inputs (5)** – price, rating, position, sponsor flag, “was viewed before”.  
   * **Output** – probability ∈ [0, 1] (sigmoid activation).  
   * **Training** – balanced dataset: all positive examples + up to `2×` the number of negatives (configurable).  
   * **Persistence** – `net.toJSON()` / `net.fromJSON()` stored in `chrome.storage.local`.  

---  

## Installation  

1. Clone or download the repository.  
2. Open Chrome → `chrome://extensions/`.  
3. Enable **Developer mode** (top‑right).  
4. Click **Load unpacked** and select the folder containing `manifest.json`, `background.js`, `content.js`, and `brain-browser.min.js`.  

The extension will appear in the toolbar (you may hide the icon – it works silently).  

---  

## File Overview  

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome extension manifest (v3). Declares background service worker, content script, permissions (`storage`, `activeTab`). |
| `background.js` | Service‑worker: model lifecycle, storage, message handling, training. |
| `content.js` | Runs in the page context: DOM parsing, click listening, prediction requests, UI highlighting. |
| `brain-browser.min.js` | Pre‑built Brain.js library for the browser (no external network load). |
| `README.md` | This document. |
| `icons/` | Optional extension icons (16/48/128 px). |

---  

## Configuration & Customisation  

### 1. Adjust selectors  

Both scripts contain placeholder selectors (`.product-card`, `.price__lower-price`, etc.). Replace them with the actual CSS selectors of the target marketplace.

```js
// Example replacement in content.js
const productElements = document.querySelectorAll('.my-marketplace .item-card');
```

### 2. Change model architecture  

Edit the `config` object in `background.js`:

```js
const config = {
  inputSize: 5,
  outputSize: 1,
  hiddenLayers: [10, 8],   // add more layers or neurons
  activation: 'sigmoid'
};
```

### 3. Add new features  

* Extend the input vector in `predictInterest` and `retrainModel` (add new normalized fields).  
* Update `inputSize` in the config accordingly.  

### 4. Tweak balancing  

`maxNegativeSamples = positiveExamples.length * 2;` – change the multiplier to control how many negative samples are kept.

### 5. Highlight colours  

Modify the RGBA values in `applyCardHighlighting` to match your visual preferences.

---  

## Data Flow & Storage  

```
[Page] --(content.js)--> background.js --(chrome.storage)--> local JSON model
```

* **Viewed IDs** – stored as an array under key `viewedIds`.  
* **Model weights** – stored under key `modelWeights`.  
* All data is **anonymous**; no network traffic occurs.  

---  

## Training & Inference Details  

| Step | Description |
|------|-------------|
| **Normalization** | Price ÷ 100 000, rating ÷ 5, position ÷ 100, sponsor → 0/1, wasViewed → 0/1. |
| **Label** | `1` if the product ID appears in `clickedProductIds`, else `0`. |
| **Balancing** | Negative examples trimmed to `2 × positiveCount`. |
| **Training** | `net.train(trainingData, {iterations:1000, errorThresh:0.005, log:true})`. |
| **Inference** | `net.run(normalizedInput)` → probability. |
| **Persistence** | After each training run `net.toJSON()` → `chrome.storage.local`. |

---  

## Development & Building  

1. **Run a local server** (optional) to test changes: `npx http-server ./ -c-1`.  
2. **Reload extension** from `chrome://extensions/` after each code change.  
3. **Debug**:  
   * Background: `chrome://serviceworker-internals/` → find your extension → **Inspect**.  
   * Content: open DevTools on any marketplace page → **Console** shows logs (`[MP] parseProductListings`, etc.).  

---  

## License  

MIT License – see `LICENSE` file.  

---  

*Happy hacking! 🎯*