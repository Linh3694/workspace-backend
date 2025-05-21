// controllers/pdfController.js
const Pdf = require("../../models/Pdf");
const { convertPdfToImages } = require("../../utils/convertPdfToImages");
const fs = require("fs");
const path = require("path");
const viewCache = {};

// routes/flippage.js
exports.checkCustomeNameUrl = async (req, res) => {
  const { customName } = req.params;
  
  try {
    const fileExists = await Pdf.exists({ customName }); // ✅ Sửa thành Pdf.exists(...)
    if (!fileExists) {
      return res.status(404).json({ exists: false, message: "customName không tồn tại" });
    }
    return res.json({ exists: true });
  } catch (error) {
    console.error("Lỗi kiểm tra customName:", error);
    return res.status(500).json({ exists: false, error: "Lỗi server" });
  }
};


exports.checkCustomName = async (req, res) => {
  try {
    const { customName } = req.params;

    if (!customName || customName.trim() === "") {
      return res.status(400).json({ message: "Đường dẫn không được để trống.", valid: false });
    }

    const sanitizedCustomName = customName
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-");

    const existingPdf = await Pdf.findOne({ customName: sanitizedCustomName });

    if (existingPdf) {
      return res.status(400).json({ message: "Đường dẫn đã tồn tại.", valid: false });
    }

    res.json({ message: "Đường dẫn hợp lệ", valid: true });
  } catch (err) {
    console.error("❌ Lỗi khi kiểm tra customName:", err);
    res.status(500).json({ message: "Lỗi server", valid: false });
  }
};

function decodeAndNormalizeFileName(str) {
  if (!str) return "";
  const decoded = Buffer.from(str, "latin1").toString("utf8");
  // Nếu kết quả giải mã chứa ký tự thay thế "�", trả về chuỗi gốc (giả sử chuỗi đó đã được fix)
  if (decoded.includes("�")) {
    return str;
  }
  return decoded.normalize("NFC");
}
exports.fixAllFileNames = async (req, res) => {
  try {
    // Lấy tất cả PDF
    const pdfs = await Pdf.find();

    let countFixed = 0;

    for (const pdf of pdfs) {
      const original = pdf.fileName;
      // Thử giải mã & normalize
      const fixed = decodeAndNormalizeFileName(original);

      // Nếu tên mới khác tên cũ, cập nhật
      if (fixed !== original) {
        pdf.fileName = fixed;
        await pdf.save();
        countFixed++;
      }
    }

    return res.json({
      message: `Đã kiểm tra ${pdfs.length} file. Đã sửa ${countFixed} tên file bị lỗi.`,
    });
  } catch (err) {
    console.error("❌ Lỗi fixAllFileNames:", err);
    return res.status(500).json({ error: "Lỗi server khi sửa tên file." });
  }
};

exports.fixMissingViews = async (req, res) => {
  try {
    // Update tất cả các PDF mà chưa có trường clickCount (hoặc trường này không tồn tại)
    const result = await Pdf.updateMany(
      { clickCount: { $exists: false } },
      { $set: { clickCount: 0 } }
    );
    return res.json({
      message: `Đã cập nhật ${result.modifiedCount || result.nModified} tài liệu, thêm trường clickCount.`,
    });
  } catch (error) {
    console.error("❌ Lỗi cập nhật views:", error);
    return res.status(500).json({ error: "Lỗi server khi cập nhật views." });
  }
};

exports.uploadPdf = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file uploaded." });
    }

    // Đường dẫn file PDF đã lưu (Multer đã lưu với tên là: <timestamp>-<originalname>)
    const pdfFilePath = req.file.path;
    const folderName = path.basename(pdfFilePath, path.extname(pdfFilePath));

    // Lấy uploader từ req.user (đảm bảo middleware auth đã gắn req.user)
    const uploaderId = req.user?._id;
    if (!uploaderId) {
      return res.status(400).json({ error: "Không xác định được người tải lên." });
    }

    // Lấy bookmarks từ body nếu có (JSON string)
    const bookmarks = req.body.bookmarks ? JSON.parse(req.body.bookmarks) : [];
    console.log("Bookmarks:", bookmarks);

    // Xử lý customName: normalize, loại bỏ dấu và chuyển khoảng trắng thành dấu gạch ngang
    let customName = req.body.customName
      ?.trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-") || folderName;

    // Kiểm tra trùng lặp customName trong DB
    const existingPdf = await Pdf.findOne({ customName });
    if (existingPdf) {
      return res.status(400).json({ error: `File với customName "${customName}" đã tồn tại! Hãy chọn tên khác.` });
    }

    // Convert PDF -> Ảnh (sử dụng hàm convertPdfToImages, truyền folderName để lưu ảnh)
    await convertPdfToImages(pdfFilePath, folderName, 150);

    console.log("originalName:", req.file.originalname);
    const fixedFileName = decodeAndNormalizeFileName(req.file.originalname);
    console.log("fixedFileName:", fixedFileName);

    // Tạo mới đối tượng Pdf và lưu vào MongoDB
    const newPdf = new Pdf({
      fileName: fixedFileName,
      customName,
      folderName,
      uploader: uploaderId,
      active: true,
      bookmarks, // Lưu danh sách bookmarks nếu có
    });

    await newPdf.save();
    res.json({ folderName, customName });
  } catch (err) {
    console.error("❌ Error converting PDF:", err);
    res.status(500).json({ error: "Lỗi convert PDF" });
  }
};

exports.getImages = async (req, res) => {
  try {
    const { customName } = req.params;
    console.log("🔍 API nhận customName:", customName);
    
    // Tìm PDF trong DB
    const pdfData = await Pdf.findOne({ customName });
    if (!pdfData) {
      return res.status(404).json({
        error: `Không tìm thấy PDF với customName: "${customName}"`,
      });
    }
    console.log("📂 Folder name trong DB:", pdfData.folderName);

    // Kiểm tra trạng thái active
    if (!pdfData.active) {
      return res.status(403).json({ error: "Tài liệu này đã bị vô hiệu hóa." });
    }

    // Lấy IP của client (nếu có proxy, sử dụng header x-forwarded-for)
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    const cacheKey = `${clientIp}-${customName}`;
    const now = Date.now();
    const threshold = 60 * 1000; // 60 giây

    // Nếu chưa có key trong cache hoặc thời gian đã vượt quá threshold, tăng clickCount
    if (!viewCache[cacheKey] || now - viewCache[cacheKey] > threshold) {
      viewCache[cacheKey] = now;
      pdfData.clickCount = (pdfData.clickCount || 0) + 1;
      await pdfData.save();
    }

    // Xác định thư mục chứa ảnh PDF
    const imageDir = path.join(__dirname, "..", "..", "public", "uploads", "pdf-images");
    if (!fs.existsSync(imageDir)) {
      return res.status(404).json({
        error: `Không tìm thấy thư mục ảnh cho PDF "${customName}"`,
      });
    }

    // Lọc các file ảnh .png bắt đầu với folderName
    const allFiles = fs.readdirSync(imageDir);
    const imageFiles = allFiles.filter(
      (file) =>
        file.startsWith(pdfData.folderName) && file.endsWith(".png")
    );
    if (imageFiles.length === 0) {
      return res.status(404).json({
        error: `Không tìm thấy ảnh cho PDF "${customName}"`,
      });
    }

    // Tạo URL cho các ảnh
    const imageUrls = imageFiles.map((file) => {
      return `${req.protocol}://${req.get("host")}/uploads/pdf-images/${file}`;
    });

    res.json({ images: imageUrls });
  } catch (err) {
    console.error("❌ Lỗi khi lấy ảnh:", err);
    res.status(500).json({ error: "Lỗi server khi lấy ảnh." });
  }
};

exports.getAllPdfs = async (req, res) => {
  try {
    const pdfs = await Pdf.find()
      .populate("uploader", "fullname email avatarUrl") // 🔥 Lấy thông tin User
      .sort({ uploadDate: -1 });
    res.json(
      pdfs.map((pdf) => ({
        _id: pdf._id,
        fileName: pdf.fileName,
        customName: pdf.customName,
        folderName: pdf.folderName,
        bookmarks: pdf.bookmarks,        // <-- thêm dòng này
        uploader: pdf.uploader
          ? {
              _id: pdf.uploader._id,
              fullname: pdf.uploader.fullname,
              email: pdf.uploader.email,
              avatar: pdf.uploader.avatarUrl
                ? `${pdf.uploader.avatarUrl}`
                : "",
            }
          : null,
        active: pdf.active,
        uploadDate: new Date(pdf.uploadDate).toLocaleString(),
        clickCount : pdf.clickCount,
      }))
    );
  } catch (err) {
    console.error("❌ Lỗi khi lấy danh sách PDF:", err);
    res.status(500).json({ error: "Lỗi khi tải danh sách file." });
  }
};

exports.updatePdf = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      newCustomName,   // Nếu muốn cập nhật customName
      bookmarks,       // Nếu muốn cập nhật bookmarks
      active,          // Nếu muốn cập nhật trạng thái active
      ...otherFields   // Các trường khác, nếu có
    } = req.body;

    // Tạo đối tượng chứa dữ liệu cần update
    const updateData = { ...otherFields };

    // 1) Nếu có truyền newCustomName -> chuẩn hóa & kiểm tra trùng
    if (newCustomName && newCustomName.trim() !== "") {
      const sanitizedCustomName = newCustomName
        .trim()
        .toLowerCase()
        .normalize("NFD") // Loại bỏ dấu Tiếng Việt
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-");

      // Kiểm tra trùng lặp
      const existingPdf = await Pdf.findOne({ customName: sanitizedCustomName });
      if (existingPdf && existingPdf._id.toString() !== id) {
        return res.status(400).json({
          error: `CustomName "${sanitizedCustomName}" đã tồn tại!`,
        });
      }

      // Thêm vào updateData
      updateData.customName = sanitizedCustomName;
    }

    // 2) Nếu có bookmarks -> cập nhật
    if (Array.isArray(bookmarks)) {
      updateData.bookmarks = bookmarks;
    }

    // 3) Nếu có active -> cập nhật
    // (Có thể kiểm tra kiểu dữ liệu boolean nếu cần)
    if (typeof active !== "undefined") {
      updateData.active = active;
    }

    // 4) Thực hiện cập nhật
    const updatedPdf = await Pdf.findByIdAndUpdate(id, updateData, {
      new: true, // Trả về document đã cập nhật
    });

    if (!updatedPdf) {
      return res.status(404).json({ error: "Không tìm thấy tài liệu để cập nhật." });
    }

    // 5) Trả về kết quả
    return res.json({
      message: "Cập nhật thành công!",
      updatedPdf,
    });
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật PDF:", err);
    return res.status(500).json({ error: "Lỗi server khi cập nhật PDF." });
  }
};

exports.deletePdf = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Kiểm tra xem tài liệu có tồn tại không
    const pdfData = await Pdf.findById(id);
    if (!pdfData) {
      return res.status(404).json({ error: "Không tìm thấy tài liệu." });
    }

    // ❌ Nếu muốn xóa vĩnh viễn:
    // await Pdf.findByIdAndDelete(id);

    // ✅ Nếu muốn "xóa mềm" (disable file)
    pdfData.active = false;
    await pdfData.save();

    res.json({ message: "Tài liệu đã bị vô hiệu hóa!" });
  } catch (err) {
    console.error("❌ Lỗi khi xóa tài liệu:", err);
    res.status(500).json({ error: "Lỗi server khi xóa tài liệu." });
  }
};

exports.permanentlyDeletePdf = async (req, res) => {
  try {
    const { id } = req.params;

    // Kiểm tra xem tài liệu có tồn tại không
    const pdfData = await Pdf.findById(id);
    if (!pdfData) {
      return res.status(404).json({ error: "Không tìm thấy tài liệu." });
    }

    // Xoá các file ảnh liên quan
    const imageDir = path.join(__dirname, "..", "..", "public", "uploads", "pdf-images");
    const imageFiles = fs.readdirSync(imageDir).filter((file) => file.startsWith(pdfData.folderName));
    imageFiles.forEach((file) => fs.unlinkSync(path.join(imageDir, file)));

    // Xoá PDF khỏi DB
    await Pdf.findByIdAndDelete(id);

    res.json({ message: "Tài liệu đã bị xóa vĩnh viễn!" });
  } catch (err) {
    console.error("❌ Lỗi khi xóa vĩnh viễn tài liệu:", err);
    res.status(500).json({ error: "Lỗi server khi xóa tài liệu." });
  }
};

exports.toggleActiveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    // Kiểm tra nếu tài liệu có tồn tại không
    const pdf = await Pdf.findById(id);
    if (!pdf) {
      return res.status(404).json({ error: "Không tìm thấy tài liệu." });
    }

    // Cập nhật trạng thái active
    pdf.active = active;
    await pdf.save();

    res.json({ message: `Trạng thái cập nhật thành công!`, active: pdf.active });
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật trạng thái:", err);
    res.status(500).json({ error: "Lỗi server khi cập nhật trạng thái." });
  }
};

exports.getBookmarks = async (req, res) => {
  try {
    const { customName } = req.params;
    const pdfData = await Pdf.findOne({ customName });

    if (!pdfData) {
      return res.status(404).json({ error: "Không tìm thấy tài liệu." });
    }

    res.json({ bookmarks: pdfData.bookmarks });
  } catch (err) {
    console.error("❌ Lỗi khi lấy bookmarks:", err);
    res.status(500).json({ error: "Lỗi server khi lấy bookmarks." });
  }
};

exports.updateBookmarks = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookmarks } = req.body;

    if (!Array.isArray(bookmarks)) {
      return res.status(400).json({ error: "Bookmarks phải là một mảng." });
    }

    const pdfData = await Pdf.findByIdAndUpdate(
      id,
      { bookmarks },
      { new: true }
    );

    if (!pdfData) {
      return res.status(404).json({ error: "Không tìm thấy tài liệu để cập nhật." });
    }

    res.json({ message: "Cập nhật bookmarks thành công!", bookmarks: pdfData.bookmarks });
  } catch (err) {
    console.error("❌ Lỗi khi cập nhật bookmarks:", err);
    res.status(500).json({ error: "Lỗi server khi cập nhật bookmarks." });
  }
};  

exports.getPdfStatus = async (req, res) => {
  const { customName } = req.params;
  try {
    const pdfData = await Pdf.findOne({ customName });
    if (!pdfData) {
      return res.status(404).json({ error: "Không tìm thấy PDF", active: false });
    }
    return res.json({ active: pdfData.active });
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái PDF:", error);
    return res.status(500).json({ error: "Lỗi server", active: false });
  }
};