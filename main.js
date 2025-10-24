// PDF.js設定
pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";

// DOM要素取得
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileInfo = document.getElementById("fileInfo");
const convertBtn = document.getElementById("convertBtn");
const progress = document.getElementById("progress");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const downloadArea = document.getElementById("downloadArea");
const downloadBtn = document.getElementById("downloadBtn");
const advancedToggle = document.getElementById("advancedToggle");
const advancedSettings = document.getElementById("advancedSettings");

// 設定要素
const resolution = document.getElementById("resolution");
const quality = document.getElementById("quality");
const qualityValue = document.getElementById("qualityValue");
const format = document.getElementById("format");
const doubleRasterize = document.getElementById("doubleRasterize");
const antiOCR = document.getElementById("antiOCR");
const noiseLevel = document.getElementById("noiseLevel");
const noiseLevelValue = document.getElementById("noiseLevelValue");

let selectedFile = null;

// 詳細設定の表示切替
advancedToggle.addEventListener("click", function () {
  const isHidden = advancedSettings.style.display === "none" || !advancedSettings.style.display;
  advancedSettings.style.display = isHidden ? "block" : "none";
  this.textContent = isHidden ? "詳細設定を非表示" : "詳細設定を表示";
});

// スライダーの値表示更新
quality.addEventListener("input", function () {
  qualityValue.textContent = this.value + " %";
});

noiseLevel.addEventListener("input", function () {
  noiseLevelValue.textContent = this.value;
});

// ドラッグ&ドロップイベント
dropZone.addEventListener("dragover", function (e) {
  e.preventDefault();
  this.classList.add("dragover");
});

dropZone.addEventListener("dragleave", function (e) {
  e.preventDefault();
  this.classList.remove("dragover");
});

dropZone.addEventListener("drop", function (e) {
  e.preventDefault();
  this.classList.remove("dragover");
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].type === "application/pdf") {
    handleFileSelect(files[0]);
  } else {
    showError("PDFファイルを選択してください");
  }
});

// クリックでファイル選択
dropZone.addEventListener("click", function () {
  fileInput.click();
});

fileInput.addEventListener("change", function (e) {
  if (e.target.files.length > 0) {
    handleFileSelect(e.target.files[0]);
  }
});

// ファイル選択処理
function handleFileSelect(file) {
  selectedFile = file;

  // ファイル情報表示
  const fileSize = (file.size / 1024 / 1024).toFixed(2);
  fileInfo.innerHTML = `
                <strong>📄 ${file.name}</strong><br>
                サイズ: ${fileSize} MB
            `;
  fileInfo.style.display = "block";

  // 変換ボタン有効化
  convertBtn.disabled = false;

  // ダウンロードエリア非表示
  downloadArea.style.display = "none";
}

// 変換ボタンクリック
convertBtn.addEventListener("click", async function () {
  if (!selectedFile) return;

  try {
    // UI状態更新
    convertBtn.disabled = true;
    progress.style.display = "block";
    downloadArea.style.display = "none";
    hideMessages();

    await processFile();
  } catch (error) {
    console.error("変換エラー:", error);
    showError("変換中にエラーが発生しました: " + error.message);
  } finally {
    convertBtn.disabled = false;
    progress.style.display = "none";
  }
});

// ファイル処理メイン関数の修正版
async function processFile() {
  updateProgress(0, "PDFファイルを読み込み中...");

  const arrayBuffer = await selectedFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  const totalPages = pdf.numPages;

  updateProgress(20, `${totalPages}ページのPDFを解析中...`);

  // 設定値取得
  const scale = parseFloat(resolution.value);
  const jpegQuality = parseFloat(quality.value) / 100;
  const outputFormat = format.value;
  const useDoubleRasterize = doubleRasterize.checked;
  const useAntiOCR = antiOCR.checked;
  const noise = parseInt(noiseLevel.value);

  // 新しいPDFドキュメント作成（最初は仮のサイズ）
  const { jsPDF } = window.jspdf;
  let newPdf = null;
  let firstPage = true;

  // 各ページを処理
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    updateProgress(20 + ((pageNum - 1) / totalPages) * 60, `ページ ${pageNum}/${totalPages} を処理中...`);

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Canvas作成
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // PDFページをCanvasに描画
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    // Anti-OCR処理
    if (useAntiOCR) {
      applyAntiOCR(context, canvas.width, canvas.height, noise);
    }

    // 2重ラスタライズ
    if (useDoubleRasterize) {
      await applyDoubleRasterize(canvas, context);
    }

    // 画像データ取得
    const imageFormat = outputFormat === "png" ? "image/png" : "image/jpeg";
    const imageData = canvas.toDataURL(imageFormat, jpegQuality);

    // PDFページサイズ計算 (mm)
    const pdfWidth = viewport.width * 0.75; // px to pt
    const pdfHeight = viewport.height * 0.75;
    const mmWidth = pdfWidth * 0.352778; // pt to mm
    const mmHeight = pdfHeight * 0.352778;

    // 向き判定
    const isLandscape = viewport.width > viewport.height;

    if (firstPage) {
      // 最初のページで正しい向きでPDFを初期化
      if (isLandscape) {
        newPdf = new jsPDF("landscape", "mm", [mmHeight, mmWidth]);
      } else {
        newPdf = new jsPDF("portrait", "mm", [mmWidth, mmHeight]);
      }
      // デフォルトの空白ページを削除
      newPdf.deletePage(1);
      firstPage = false;
    }

    // ページを追加（各ページの向きに応じて）
    if (isLandscape) {
      newPdf.addPage([mmHeight, mmWidth], "landscape");
      newPdf.addImage(imageData, outputFormat.toUpperCase(), 0, 0, mmWidth, mmHeight);
    } else {
      newPdf.addPage([mmWidth, mmHeight], "portrait");
      newPdf.addImage(imageData, outputFormat.toUpperCase(), 0, 0, mmWidth, mmHeight);
    }
  }

  updateProgress(90, "PDFファイルを生成中...");

  // PDFファイル生成
  const pdfBlob = newPdf.output("blob");
  const downloadUrl = URL.createObjectURL(pdfBlob);

  // ダウンロードリンク設定
  const originalName = selectedFile.name.replace(".pdf", "");
  const newFileName = `${originalName}_rasterized.pdf`;

  downloadBtn.href = downloadUrl;
  downloadBtn.download = newFileName;

  updateProgress(100, "変換完了！");

  // 結果表示
  setTimeout(() => {
    progress.style.display = "none";
    downloadArea.style.display = "block";
    showSuccess(`${totalPages}ページのPDFを正常にラスタライズしました（向きを保持）`);
  }, 500);
}

// Anti-OCR処理
function applyAntiOCR(context, width, height, noiseLevel) {
  if (noiseLevel === 0) return;

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  // ノイズ強度
  const noiseStrength = noiseLevel * 2;

  for (let i = 0; i < data.length; i += 4) {
    // RGB値に微細なノイズを追加
    const noise = (Math.random() - 0.5) * noiseStrength;
    data[i] = Math.max(0, Math.min(255, data[i] + noise)); // R
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise)); // G
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise)); // B
  }

  // ランダムピクセルの追加
  for (let j = 0; j < (width * height * noiseLevel) / 1000; j++) {
    const randomIndex = Math.floor(Math.random() * (data.length / 4)) * 4;
    const brightness = Math.random() * 50 + 200;
    data[randomIndex] = brightness;
    data[randomIndex + 1] = brightness;
    data[randomIndex + 2] = brightness;
  }

  context.putImageData(imageData, 0, 0);
}

// 2重ラスタライズ処理
async function applyDoubleRasterize(canvas, context) {
  // 一度画像として出力
  const tempImageData = canvas.toDataURL("image/jpeg", 0.98);

  // 新しい画像として読み込み
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = function () {
      // Canvasをクリア
      context.clearRect(0, 0, canvas.width, canvas.height);
      // 画像を再描画
      context.drawImage(img, 0, 0);
      resolve();
    };
    img.src = tempImageData;
  });
}

// 進捗更新
function updateProgress(percent, message) {
  progressFill.style.width = percent + "%";
  progressText.textContent = message;
}

// エラー表示
function showError(message) {
  hideMessages();
  const errorDiv = document.createElement("div");
  errorDiv.className = "error";
  errorDiv.innerHTML = `<strong>❌ エラー:</strong> ${message}`;
  fileInfo.parentNode.insertBefore(errorDiv, fileInfo.nextSibling);
}

// 成功表示
function showSuccess(message) {
  hideMessages();
  const successDiv = document.createElement("div");
  successDiv.className = "success";
  successDiv.innerHTML = `<strong>✅ 成功:</strong> ${message}`;
  fileInfo.parentNode.insertBefore(successDiv, fileInfo.nextSibling);
}

// メッセージ非表示
function hideMessages() {
  const messages = document.querySelectorAll(".error, .success");
  messages.forEach((msg) => msg.remove());
}
