const Document = require("../../models/Document");
const fs = require("fs");
const path = require("path");

// [GET] Lấy tất cả tài liệu từ DB và thư mục upload
exports.getAllDocuments = async (req, res) => {
  try {
    // 1️⃣ Lấy danh sách tài liệu từ database
    const docs = await Document.find().sort({ createdAt: -1 });

    // 2️⃣ Đọc danh sách file từ thư mục `/uploads/Reports`
    const reportsPath = path.join(__dirname, "../uploads/Reports");
    const reportsFiles = fs.existsSync(reportsPath) ? fs.readdirSync(reportsPath) : [];

    // 3️⃣ Đọc danh sách file từ thư mục `/uploads/Handovers`
    const handoversPath = path.join(__dirname, "../uploads/Handovers");
    const handoversFiles = fs.existsSync(handoversPath) ? fs.readdirSync(handoversPath) : [];

    // 4️⃣ Chuyển danh sách file thành object để hiển thị trong frontend
    const reportsDocs = reportsFiles.map((file) => ({
      ten: file,
      loai: "Report",
      phongBan: "Tự động từ hệ thống",
      file: `/uploads/Reports/${file}`,
      nguoiTao: "Hệ thống",
      trangThai: "Hoàn thành",
      chiPhi: null,
      createdAt: fs.statSync(path.join(reportsPath, file)).mtime,
    }));

    const handoversDocs = handoversFiles.map((file) => ({
      ten: file,
      loai: "Handover",
      phongBan: "Tự động từ hệ thống",
      file: `/uploads/Handovers/${file}`,
      nguoiTao: "Hệ thống",
      trangThai: "Hoàn thành",
      chiPhi: null,
      createdAt: fs.statSync(path.join(handoversPath, file)).mtime,
    }));

    // 5️⃣ Gộp danh sách tài liệu từ DB + thư mục file
    const allDocuments = [...docs, ...reportsDocs, ...handoversDocs];

    res.json(allDocuments);
  } catch (error) {
    console.error("Lỗi server khi lấy danh sách tài liệu:", error);
    res.status(500).json({ message: "Lỗi server khi lấy danh sách tài liệu." });
  }
};

// [POST] Tạo mới tài liệu
exports.createDocument = async (req, res) => {
  try {
    const { ten, loai, phongBan, nguoiTao, trangThai, chiPhi, thangSuDung } = req.body;

    // Nếu có file upload
    let filePath = "";
    if (req.file) {
      filePath = req.file.path; // "uploads/Document/xxxx_filename.pdf"
    }

    const newDoc = new Document({
      ten,
      loai,
      phongBan,
      nguoiTao,
      trangThai,
      chiPhi,
      file: filePath,
      thangSuDung,
    });

    const savedDoc = await newDoc.save();
    res.status(201).json(savedDoc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server khi tạo tài liệu." });
  }
};


// [GET] Lấy chi tiết 1 tài liệu
exports.getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findById(id);
    if (!doc) {
      return res.status(404).json({ message: "Không tìm thấy tài liệu." });
    }
    res.json(doc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server khi lấy chi tiết tài liệu." });
  }
};

// [PUT] Cập nhật tài liệu
exports.updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { ten, loai, phongBan, nguoiTao, trangThai, chiPhi, thangSuDung } = req.body;

    let updatedFields = {
      ten,
      loai,
      phongBan,
      nguoiTao,
      trangThai,
      chiPhi,
      thangSuDung,
    };

    // Nếu có file upload mới
    if (req.file) {
      updatedFields.file = req.file.path;
    }

    const updatedDoc = await Document.findByIdAndUpdate(id, updatedFields, {
      new: true,
    });

    if (!updatedDoc) {
      return res.status(404).json({ message: "Không tìm thấy tài liệu." });
    }

    res.json(updatedDoc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server khi cập nhật tài liệu." });
  }
};

// [DELETE] Xóa tài liệu
exports.deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Document.findByIdAndDelete(id);
    if (!doc) {
      return res.status(404).json({ message: "Không tìm thấy tài liệu." });
    }
    res.json({ message: "Đã xóa tài liệu thành công." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server khi xóa tài liệu." });
  }
};


exports.getDocumentFile = (req, res) => {
  const { folder, filename } = req.params;
  const filePath = path.join(__dirname, `../uploads/${folder}/${filename}`);

  // Kiểm tra file có tồn tại không
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("❌ Lỗi khi lấy file:", err);
      res.status(404).json({ message: "Không tìm thấy file tài liệu." });
    }
  });
};