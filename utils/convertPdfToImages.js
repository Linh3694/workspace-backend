const util = require("util");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const execAsync = util.promisify(exec);

async function convertPdfToImages(pdfPath, baseName, dpi = 150) {
  try {
    // Thư mục đích
    const pdfImagesDir = path.join(__dirname, "../public/uploads/pdf-images");
    // Đảm bảo tồn tại
    if (!fs.existsSync(pdfImagesDir)) {
      fs.mkdirSync(pdfImagesDir, { recursive: true });
    }

    // Tạo đường dẫn output. pdftocairo sẽ tự thêm -1, -2... vào
    const outputPath = path.join(pdfImagesDir, baseName);

    const cmd = `pdftocairo -png -r ${dpi} "${pdfPath}" "${outputPath}"`;
    console.log(`📌 Running command: ${cmd}`);
    await execAsync(cmd);

    // Tìm các file ảnh vừa tạo
    const allFiles = fs.readdirSync(pdfImagesDir);
    const imageFiles = allFiles
      .filter((file) => file.startsWith(baseName) && file.endsWith(".png"))
      .map((file) => path.join(pdfImagesDir, file));

    if (imageFiles.length === 0) {
      throw new Error("Không có ảnh nào được tạo từ PDF.");
    }

    return imageFiles;
  } catch (error) {
    console.error("❌ Lỗi khi chạy Poppler:", error);
    throw error;
  }
}

module.exports = { convertPdfToImages };