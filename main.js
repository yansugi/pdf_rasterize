// PDF.jsの初期設定
pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";

// DOM要素の取得
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const convertBtn = document.getElementById("convertBtn");
const progressContainer = document.getElementById("progressContainer");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const resultSection = document.getElementById("resultSection");
const downloadBtn = document.getElementById("downloadBtn");
const errorMessage = document.getElementById("errorMessage");
const dpiSelect = document.getElementById("dpiSelect");
const qualitySlider = document.getElementById("qualitySlider");
const qualityValue = document.getElementById("qualityValue");
const formatSelect = document.getElementById("formatSelect");

let selectedFile = null;

// 品質スライダーの値表示更新
qualitySlider.addEventListener("input", (e) => {
  qualityValue.textContent = e.target.value;
});

// ドラッグ＆ドロップ処理
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  handleFileSelect(e.dataTransfer.files[0]);
});

fileInput.addEventListener("change", (e) => {
  handleFileSelect(e.target.files[0]);
});

function handleFileSelect(file) {
  if (!file) return;

  if (file.type !== "application/pdf") {
    showError("PDFファイルを選択してください。");
    return;
  }

  selectedFile = file;
  convertBtn.disabled = false;

  // ドロップゾーンの表示を更新
  dropZone.querySelector(".drop-text").textContent = `選択されたファイル: ${file.name}`;
  dropZone.querySelector(".drop-subtext").textContent = "別のファイルを選択するにはクリック";

  hideError();
  hideResult();
}

// 変換処理
convertBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  try {
    convertBtn.disabled = true;
    showProgress();
    hideError();
    hideResult();

    await convertPdfToRasterized(selectedFile);
  } catch (error) {
    console.error("変換エラー:", error);
    showError(`変換中にエラーが発生しました: ${error.message}`);
  } finally {
    convertBtn.disabled = false;
    hideProgress();
  }
});

async function convertPdfToRasterized(file) {
  const dpi = parseInt(dpiSelect.value);
  const quality = parseInt(qualitySlider.value) / 100;
  const format = formatSelect.value;

  updateProgress(0, "PDFを読み込み中...");

  // PDFファイルを読み込み
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

  updateProgress(10, `PDF読み込み完了 (${pdf.numPages}ページ)`);

  // 新しいPDFを作成
  const pdfDoc = await PDFLib.PDFDocument.create();

  // 各ページを処理
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    updateProgress(10 + ((pageNum - 1) * 80) / pdf.numPages, `ページ ${pageNum}/${pdf.numPages} を変換中...`);

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: dpi / 72 });

    // Canvas作成
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // PDFページをCanvasに描画
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };
    await page.render(renderContext).promise;

    // CanvasからBlob取得
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, `image/${format}`, quality);
    });

    // 画像データを新しいPDFに追加
    const imageBytes = await blob.arrayBuffer();
    let image;
    if (format === "jpeg") {
      image = await pdfDoc.embedJpg(imageBytes);
    } else {
      image = await pdfDoc.embedPng(imageBytes);
    }

    // 新しいページを作成して画像を挿入
    const pdfPage = pdfDoc.addPage([viewport.width, viewport.height]);
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
    });
  }

  updateProgress(90, "PDFを生成中...");

  // PDFを生成
  const pdfBytes = await pdfDoc.save();

  updateProgress(100, "変換完了！");

  // ダウンロードリンクを作成
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  downloadBtn.href = url;
  downloadBtn.download = `rasterized_${selectedFile.name}`;

  showResult();
}

function updateProgress(percent, message) {
  progressFill.style.width = `${percent}%`;
  progressText.textContent = message;
}

function showProgress() {
  progressContainer.style.display = "block";
}

function hideProgress() {
  progressContainer.style.display = "none";
}

function showResult() {
  resultSection.style.display = "block";
}

function hideResult() {
  resultSection.style.display = "none";
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = "block";
}

function hideError() {
  errorMessage.style.display = "none";
}

// ダウンロード完了後のクリーンアップ
downloadBtn.addEventListener("click", () => {
  setTimeout(() => {
    URL.revokeObjectURL(downloadBtn.href);
  }, 100);
});

// ファイルサイズ制限チェック
function checkFileSize(file) {
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    throw new Error("ファイルサイズが大きすぎます（50MB以下にしてください）");
  }
}

// エラーハンドリングの改善
window.addEventListener("error", (e) => {
  console.error("予期しないエラー:", e.error);
  showError("予期しないエラーが発生しました。ページを再読み込みして再試行してください。");
});

// メモリ使用量の監視（可能な場合）
function checkMemoryUsage() {
  if ("memory" in performance) {
    const memInfo = performance.memory;
    const usedMB = Math.round(memInfo.usedJSHeapSize / (1024 * 1024));
    const limitMB = Math.round(memInfo.jsHeapSizeLimit / (1024 * 1024));

    if (usedMB > limitMB * 0.8) {
      console.warn("メモリ使用量が高くなっています");
      showError("メモリ使用量が高くなっています。ブラウザを再起動することをお勧めします。");
    }
  }
}

// ブラウザ対応チェック
function checkBrowserSupport() {
  const features = [
    "FileReader" in window,
    "Blob" in window,
    "URL" in window && "createObjectURL" in URL,
    "Canvas" in window || "HTMLCanvasElement" in window,
  ];

  if (!features.every((feature) => feature)) {
    showError("お使いのブラウザは一部の機能をサポートしていません。最新のブラウザをご使用ください。");
    return false;
  }
  return true;
}

// 初期化処理
document.addEventListener("DOMContentLoaded", () => {
  if (!checkBrowserSupport()) {
    convertBtn.style.display = "none";
    dropZone.style.pointerEvents = "none";
    dropZone.style.opacity = "0.5";
  }
});

// 高度な設定オプション用の追加機能
function addAdvancedSettings() {
  const advancedToggle = document.createElement("button");
  advancedToggle.textContent = "詳細設定を表示";
  advancedToggle.className = "toggle-btn";
  advancedToggle.style.cssText = `
                background: transparent;
                border: 1px solid #ddd;
                padding: 8px 15px;
                border-radius: 5px;
                cursor: pointer;
                margin-top: 10px;
                font-size: 0.9em;
                color: #666;
                transition: all 0.3s ease;
            `;

  const advancedSettings = document.createElement("div");
  advancedSettings.id = "advancedSettings";
  advancedSettings.style.display = "none";
  advancedSettings.style.marginTop = "20px";
  advancedSettings.innerHTML = `
                <div class="setting-row">
                    <label for="compressionSelect">圧縮レベル:</label>
                    <select id="compressionSelect">
                        <option value="low">低圧縮（高品質）</option>
                        <option value="medium" selected>中圧縮（標準）</option>
                        <option value="high">高圧縮（軽量）</option>
                    </select>
                </div>
                <div class="setting-row">
                    <label for="colorModeSelect">カラーモード:</label>
                    <select id="colorModeSelect">
                        <option value="color" selected>カラー</option>
                        <option value="grayscale">グレースケール</option>
                    </select>
                </div>
            `;

  document.querySelector(".settings").appendChild(advancedToggle);
  document.querySelector(".settings").appendChild(advancedSettings);

  advancedToggle.addEventListener("click", () => {
    const isVisible = advancedSettings.style.display !== "none";
    advancedSettings.style.display = isVisible ? "none" : "block";
    advancedToggle.textContent = isVisible ? "詳細設定を表示" : "詳細設定を非表示";
  });
}

// ページ読み込み完了時に詳細設定を追加
window.addEventListener("load", () => {
  addAdvancedSettings();
});

// パフォーマンス最適化のためのバッチ処理
async function processPagesBatch(pdf, pdfDoc, batchSize = 3) {
  const totalPages = pdf.numPages;

  for (let i = 0; i < totalPages; i += batchSize) {
    const batch = [];
    const endIndex = Math.min(i + batchSize, totalPages);

    for (let j = i; j < endIndex; j++) {
      batch.push(processPage(pdf, pdfDoc, j + 1));
    }

    await Promise.all(batch);

    // メモリ使用量チェック
    checkMemoryUsage();

    // UI更新
    const progress = (endIndex / totalPages) * 80 + 10;
    updateProgress(progress, `処理中... ${endIndex}/${totalPages}ページ完了`);
  }
}

async function processPage(pdf, pdfDoc, pageNum) {
  // 個別ページ処理のロジックをここに移動
  // (上記のループ内のコードと同じ)
}

// ファイル情報表示の追加
function displayFileInfo(file) {
  const fileInfo = document.createElement("div");
  fileInfo.className = "file-info";
  fileInfo.style.cssText = `
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                margin: 15px 0;
                border: 1px solid #e9ecef;
            `;

  const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
  fileInfo.innerHTML = `
                <h4>📄 ファイル情報</h4>
                <p><strong>ファイル名:</strong> ${file.name}</p>
                <p><strong>サイズ:</strong> ${sizeInMB} MB</p>
                <p><strong>最終更新:</strong> ${new Date(file.lastModified).toLocaleString("ja-JP")}</p>
            `;

  // 既存のファイル情報があれば削除
  const existingInfo = document.querySelector(".file-info");
  if (existingInfo) {
    existingInfo.remove();
  }

  // 設定セクションの前に追加
  document.querySelector(".settings").parentNode.insertBefore(fileInfo, document.querySelector(".settings"));
}

// handleFileSelect関数を更新してファイル情報を表示
function handleFileSelectUpdated(file) {
  if (!file) return;

  if (file.type !== "application/pdf") {
    showError("PDFファイルを選択してください。");
    return;
  }

  try {
    checkFileSize(file);
  } catch (error) {
    showError(error.message);
    return;
  }

  selectedFile = file;
  convertBtn.disabled = false;

  // ドロップゾーンの表示を更新
  dropZone.querySelector(".drop-text").textContent = `✅ ${file.name}`;
  dropZone.querySelector(".drop-subtext").textContent = "別のファイルを選択するにはクリック";

  // ファイル情報を表示
  displayFileInfo(file);

  hideError();
  hideResult();
}

// 元のhandleFileSelectを新しい関数で置き換え
function handleFileSelect(file) {
  handleFileSelectUpdated(file);
}
