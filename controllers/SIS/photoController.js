// controllers/photoController.js
const Photo = require("../../models/Photo");
const Student = require("../../models/Students");
const SchoolYear = require("../../models/SchoolYear");
const StudentClassEnrollment = require("../../models/StudentClassEnrollment");
const xlsx = require("xlsx");
const fs = require("fs");
const AdmZip = require("adm-zip");
const sharp = require("sharp");
const path = require("path");

// Hàm lấy năm học mới nhất của học sinh hoặc fallback về năm học mới nhất trong hệ thống
const getLatestSchoolYear = async (studentId) => {
  // 1. Lấy năm học mới nhất từ bảng StudentClassEnrollment
  const lastEnrollment = await StudentClassEnrollment
    .findOne({ student: studentId })
    .sort({ startDate: -1 })
    .populate("schoolYear");

  if (lastEnrollment && lastEnrollment.schoolYear) {
    return lastEnrollment.schoolYear._id;
  }

  // 2. Nếu không có, lấy năm học mới nhất từ SchoolYear
  const latestSchoolYear = await SchoolYear.findOne()
    .sort({ startDate: -1 }) // Lấy năm học có startDate mới nhất
    .select("_id");

  return latestSchoolYear ? latestSchoolYear._id : null;
};

/**
 * Upload ảnh cho 1 học sinh (theo năm học).
 * Nếu không truyền `student` trên body, hàm sẽ suy ra từ tên file.
 */
exports.uploadStudentPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    let { student, schoolYear } = req.body;
    const originalName = req.file.originalname; // Ví dụ: "HS001.jpg"
    const uploadedPath = req.file.path;         // Ví dụ: "uploads/Students/photo-1234567.jpg"

    // Nếu client không truyền `student`, ta suy ra từ tên file
    if (!student) {
      const baseName = path.parse(originalName).name; // Lấy phần "HS001"
      const foundStudent = await Student.findOne({ studentCode: baseName });

      if (!foundStudent) {
        if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
        return res
          .status(400)
          .json({ message: `Không tìm thấy học sinh: ${baseName}` });
      }
      student = foundStudent._id;
    }

    if (!schoolYear) {
      schoolYear = await getLatestSchoolYear(student);
      if (!schoolYear) {
        if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
        return res
          .status(400)
          .json({ message: "Không tìm thấy năm học hợp lệ" });
      }
    }

    const fileNameWebp = `photo-${Date.now()}.webp`;
    const outPath = `uploads/Students/${fileNameWebp}`;

    await sharp(uploadedPath).webp({ quality: 80 }).toFile(outPath);

    // Xóa ảnh gốc
    if (fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }

    // Kiểm tra xem đã có ảnh trùng student + schoolYear chưa
    let existingPhoto = await Photo.findOne({ student, schoolYear });
    if (existingPhoto) {
      // Xoá ảnh cũ
      if (fs.existsSync(existingPhoto.photoUrl)) {
        fs.unlinkSync(existingPhoto.photoUrl);
      }
      // Cập nhật url mới
      existingPhoto.photoUrl = outPath;
      await existingPhoto.save();
      return res.status(200).json(existingPhoto);
    } else {
      // Tạo Photo mới
      const newPhoto = await Photo.create({
        student,
        class: null,
        schoolYear,
        photoUrl: outPath,
      });
      return res.status(201).json(newPhoto);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.getAllPhotos = async (req, res) => {
  try {
    const photos = await Photo.find()
      .populate("student")
      .populate("class")     // populate thêm lớp
      .populate("schoolYear");
    return res.json(photos);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.getPhotoById = async (req, res) => {
  try {
    const { id } = req.params;
    const photo = await Photo.findById(id)
      .populate("student")
      .populate("class")
      .populate("schoolYear");
    if (!photo) {
      return res.status(404).json({ message: "Photo not found" });
    }
    return res.json(photo);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

exports.deletePhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Photo.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Photo not found" });
    }
    // Nếu muốn xoá file vật lý
    // if (fs.existsSync(deleted.photoUrl)) fs.unlinkSync(deleted.photoUrl);
    return res.json({ message: "Photo deleted successfully" });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

/**
 * Bulk upload Photos từ file .zip
 * - Logic cũ: dựa vào tên file => tìm học sinh => lưu photo.
 * - Có thể mở rộng để nhận diện class (nếu file .zip dành cho lớp).
 */
exports.bulkUploadPhotosFromZip = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No ZIP file uploaded" });
    }

    const zipPath = req.file.path;
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    const outputDir = "uploads/Students/";
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const now = new Date();
    let defaultSY = await SchoolYear.findOne({
      startDate: { $lte: now },
      endDate: { $gte: now },
    }).sort({ startDate: -1 });
    if (!defaultSY) {
      defaultSY = await SchoolYear.findOne().sort({ startDate: -1 });
    }
    let totalEntries = 0;
    let skippedDirs = 0;
    let skippedSysFiles = 0;
    let skippedNonImages = 0;
    let noStudentFound = 0;
    let createdPhotos = 0;
    let updatedPhotos = 0;
    for (const entry of zipEntries) {
      totalEntries++;

      const fileName = entry.entryName;
      if (entry.isDirectory) {
        skippedDirs++;
        continue;
      }
      if (fileName.includes("__MACOSX") || fileName.endsWith(".DS_Store")) {
        skippedSysFiles++;
        continue;
      }
      const lower = fileName.toLowerCase();
      if (
        !lower.endsWith(".jpg") &&
        !lower.endsWith(".jpeg") &&
        !lower.endsWith(".png")
      ) {
        skippedNonImages++;
        continue;
      }
      const splitted = fileName.split("/");
      const justFile = splitted[splitted.length - 1];
      const baseName = justFile.split(".")[0];

      const student = await Student.findOne({ studentCode: baseName });
      if (!student) {
        noStudentFound++;
        continue;
      }
      const fileBuffer = entry.getData();
      const outName = `${baseName}-${Date.now()}.webp`;
      const outPath = `${outputDir}${outName}`;
      await sharp(fileBuffer).webp({ quality: 80 }).toFile(outPath);

      let photo = await Photo.findOne({
        student: student._id,
        schoolYear: defaultSY._id,
      });
      if (!photo) {
        photo = new Photo({
          student: student._id,
          class: null, 
          schoolYear: defaultSY._id,
          photoUrl: outPath,
        });
        await photo.save();
        createdPhotos++;
     } else {
        if (fs.existsSync(photo.photoUrl)) {
        fs.unlinkSync(photo.photoUrl);
      }
        photo.photoUrl = outPath;
        await photo.save();
        updatedPhotos++;
      }
    }

    // Kết thúc, trả về thống kê cho Frontend
    return res.json({
      message: "Bulk upload từ ZIP thành công!",
      totalEntries,
      skippedDirs,
      skippedSysFiles,
      skippedNonImages,
      noStudentFound,
      createdPhotos,
      updatedPhotos,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  } finally {
    // Xoá file ZIP sau khi xử lý xong
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
};


exports.uploadClassPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    let { classId, schoolYear } = req.body; 
    if (!classId) {
      return res.status(400).json({ message: "Thiếu classId" });
    }

    // Kiểm tra class có tồn tại không
    const foundClass = await require("../../models/Class").findById(classId);
    if (!foundClass) {
      // Xoá file vừa upload để tránh rác
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Không tìm thấy Class." });
    }

    // Nếu không truyền schoolYear => lấy thẳng schoolYear từ lớp
    // (hoặc fallback logic như findOne({ startDate <= now <= endDate }) tuỳ bạn)
    if (!schoolYear) {
      if (foundClass.schoolYear) {
        schoolYear = foundClass.schoolYear;
      } else {
        // Hoặc fallback: 
        const latestSY = await SchoolYear.findOne().sort({ startDate: -1 });
        if (!latestSY) {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(400).json({ message: "Không tìm thấy năm học hợp lệ" });
        }
        schoolYear = latestSY._id;
      }
    }

    const uploadedPath = req.file.path;
    const fileNameWebp = `class-photo-${Date.now()}.webp`;
    const outPath = `uploads/Students/${fileNameWebp}`;

    await sharp(uploadedPath)
      .webp({ quality: 80 })
      .toFile(outPath);

    // Xoá ảnh gốc
    if (fs.existsSync(uploadedPath)) {
      fs.unlinkSync(uploadedPath);
    }

    // Tạo bản ghi Photo
    const newPhoto = await Photo.create({
      student: null, // null vì là ảnh của lớp
      class: foundClass._id,
      schoolYear,
      photoUrl: outPath,
    });

    return res.status(201).json(newPhoto);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// Ở cuối file controllers/photoController.js
exports.bulkUploadClassPhotosFromZip = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No ZIP file uploaded" });
    }

    // Giải nén file ZIP
    const zipPath = req.file.path;
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    // Thư mục chứa ảnh
    const outputDir = "uploads/Students/";
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Xác định fallback SchoolYear nếu lớp không có
    const fallbackSY = await SchoolYear.findOne()
      .sort({ startDate: -1 })
      .select("_id");

    // Lặp qua từng file trong ZIP
    let countUploaded = 0;
    for (const entry of zipEntries) {
      const fileName = entry.entryName;
    
      // 1) Bỏ qua thư mục (entry.isDirectory = true)
      if (entry.isDirectory) {
        continue;
      }
    
      // 2) Bỏ qua file .DS_Store, __MACOSX,... 
      // (nếu fileName chứa "__MACOSX", hoặc kết thúc là ".DS_Store"... thì skip)
      if (fileName.includes("__MACOSX") || fileName.endsWith(".DS_Store")) {
        continue;
      }
    
      // 3) Bỏ qua file không có đuôi .jpg/.jpeg/.png (tùy bạn)
      const lower = fileName.toLowerCase();
      if (!lower.endsWith(".jpg") && !lower.endsWith(".jpeg") && !lower.endsWith(".png")) {
        continue;
      }
    
      // Nếu qua được các chốt chặn trên => đây là file ảnh hợp lệ
      // => Tiến hành parse baseName
      const splitted = fileName.split("/");
      // Lấy "WS12010001.jpg" phần cuối
      const justFile = splitted[splitted.length - 1]; 
      const baseName = justFile.split(".")[0]; 
      console.log(fileName, "=> baseName:", baseName);

      // Tìm class theo className = baseName
      const foundClass = await require("../models/Class").findOne({
        className: baseName,
      });
      if (!foundClass) {
        // Không tìm thấy => bỏ qua (hoặc tùy logic, bạn có thể báo lỗi)
        console.log(`Không tìm thấy class: ${baseName}`);
        continue;
      }

      // Lấy schoolYear từ lớp, nếu lớp chưa gán => xài fallbackSY
      const syId = foundClass.schoolYear || fallbackSY?._id;
      if (!syId) {
        console.log(`Class ${foundClass.className} chưa gán schoolYear và không có fallback`);
        continue;
      }

      // Bung file ra memory
      const fileBuffer = entry.getData();
      // Convert sang webp
      const outName = `${baseName}-${Date.now()}.webp`;
      const outPath = `${outputDir}${outName}`;
      await sharp(fileBuffer).webp({ quality: 80 }).toFile(outPath);

      // Tạo (hoặc update) Photo
      // Ở đây, ta tạo mới => 1 lớp có thể có nhiều ảnh theo năm học.
      const newPhoto = new Photo({
        student: null,
        class: foundClass._id,
        schoolYear: syId,
        photoUrl: outPath,
      });
      await newPhoto.save();

      countUploaded++;
    }

    return res.json({
      message: "Bulk upload Class Photos từ ZIP thành công!",
      total: countUploaded,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  } finally {
    // Xoá file ZIP sau khi xử lý xong
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
};