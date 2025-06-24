// controllers/libraryController.js
const { Library, DocumentType, SeriesName, SpecialCode, Author } = require("../../models/LibraryModel");
const xlsx = require('xlsx');
/// Helper
async function syncAuthors(authorsArray) {
  if (!Array.isArray(authorsArray)) return;
  for (let authorName of authorsArray) {
    const trimmed = authorName.trim();
    if (!trimmed) continue;
    const existing = await Author.findOne({ name: trimmed });
    if (!existing) {
      await Author.create({ name: trimmed });
    }
  }
}

// CREATE - Tạo mới Library
exports.createLibrary = async (req, res) => {
  try {
    // Parse authors từ FormData nếu là string JSON
    if (typeof req.body.authors === 'string') {
      try {
        req.body.authors = JSON.parse(req.body.authors);
      } catch (e) {
        // Nếu không parse được JSON, thử split bằng dấu phẩy (fallback)
        req.body.authors = req.body.authors.split(',').map(author => author.trim()).filter(Boolean);
      }
    }
    
    // Convert string boolean values từ FormData về boolean
    if (typeof req.body.isNewBook === 'string') {
      req.body.isNewBook = req.body.isNewBook === 'true';
    }
    if (typeof req.body.isFeaturedBook === 'string') {
      req.body.isFeaturedBook = req.body.isFeaturedBook === 'true';
    }
    if (typeof req.body.isAudioBook === 'string') {
      req.body.isAudioBook = req.body.isAudioBook === 'true';
    }
    
    // Đảm bảo các trường mô tả được khởi tạo đúng với cấu trúc mới
    if (!req.body.description || typeof req.body.description !== 'object') {
      req.body.description = {
        linkEmbed: '',
        content: ''
      };
    }
    if (!req.body.introduction || typeof req.body.introduction !== 'object') {
      req.body.introduction = {
        linkEmbed: '',
        content: ''
      };
    }
    if (!req.body.audioBook || typeof req.body.audioBook !== 'object') {
      req.body.audioBook = {
        linkEmbed: '',
        content: ''
      };
    }

    const newLibrary = new Library(req.body);
 
    // If there is a books array, remove any book with a null/undefined or duplicate generatedCode
    if (newLibrary.books && Array.isArray(newLibrary.books)) {
      const uniqueBooks = [];
      const codeSet = new Set();
      for (const b of newLibrary.books) {
        if (!b.generatedCode) continue;
        if (codeSet.has(b.generatedCode)) continue; // skip duplicates
        codeSet.add(b.generatedCode);
        uniqueBooks.push(b);
      }
      newLibrary.books = uniqueBooks;
    }
 
    // Find the library with the highest libraryCode
    const lastLibrary = await Library.findOne().sort({ libraryCode: -1 });
    let nextCode = "0001";
    if (lastLibrary && lastLibrary.libraryCode) {
      const currentCodeNumber = parseInt(lastLibrary.libraryCode, 10);
      const nextCodeNumber = currentCodeNumber + 1;
      nextCode = String(nextCodeNumber).padStart(4, "0");
    }
    newLibrary.libraryCode = nextCode;
 
    await syncAuthors(newLibrary.authors);
    const savedLibrary = await newLibrary.save();
    return res.status(201).json(savedLibrary);
  } catch (error) {
    console.error("Error creating library:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Bulk create libraries
exports.bulkCreateLibraries = async (req, res) => {
  try {
    const { libraries } = req.body;

    if (!libraries || !Array.isArray(libraries) || libraries.length === 0) {
      return res.status(400).json({ error: 'Libraries array is required and must not be empty' });
    }

    // Find the library with the highest libraryCode to continue numbering
    const lastLibrary = await Library.findOne().sort({ libraryCode: -1 });
    let nextCodeNumber = 1;
    if (lastLibrary && lastLibrary.libraryCode) {
      nextCodeNumber = parseInt(lastLibrary.libraryCode, 10) + 1;
    }

    const newLibraries = [];
    const errors = [];

    for (let i = 0; i < libraries.length; i++) {
      const libraryData = libraries[i];
      
      try {
        // Validate required fields
        if (!libraryData.title || !libraryData.title.trim()) {
          errors.push(`Dòng ${i + 1}: Thiếu tên đầu sách`);
          continue;
        }

        // Parse authors if it's a string
        if (typeof libraryData.authors === 'string') {
          try {
            libraryData.authors = JSON.parse(libraryData.authors);
          } catch (e) {
            libraryData.authors = libraryData.authors.split(',').map(author => author.trim()).filter(Boolean);
          }
        }

        // Convert string boolean values
        if (typeof libraryData.isNewBook === 'string') {
          libraryData.isNewBook = libraryData.isNewBook === 'true';
        }
        if (typeof libraryData.isFeaturedBook === 'string') {
          libraryData.isFeaturedBook = libraryData.isFeaturedBook === 'true';
        }
        if (typeof libraryData.isAudioBook === 'string') {
          libraryData.isAudioBook = libraryData.isAudioBook === 'true';
        }

        // Ensure description objects have proper structure
        if (!libraryData.description || typeof libraryData.description !== 'object') {
          libraryData.description = { linkEmbed: '', content: '' };
        }
        if (!libraryData.introduction || typeof libraryData.introduction !== 'object') {
          libraryData.introduction = { linkEmbed: '', content: '' };
        }
        if (!libraryData.audioBook || typeof libraryData.audioBook !== 'object') {
          libraryData.audioBook = { linkEmbed: '', content: '' };
        }

        // Generate library code
        const libraryCode = String(nextCodeNumber).padStart(4, "0");
        nextCodeNumber++;

        const newLibrary = new Library({
          ...libraryData,
          libraryCode,
          books: [] // Initialize with empty books array
        });

        // Sync authors
        await syncAuthors(newLibrary.authors);
        
        const savedLibrary = await newLibrary.save();
        newLibraries.push(savedLibrary);

      } catch (error) {
        errors.push(`Dòng ${i + 1}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Có lỗi trong dữ liệu bulk upload', 
        details: errors,
        successCount: newLibraries.length,
        totalCount: libraries.length
      });
    }

    return res.status(201).json({
      message: `Đã tạo thành công ${newLibraries.length} đầu sách`,
      libraries: newLibraries
    });

  } catch (error) {
    console.error('Error bulk creating libraries:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Bulk create libraries from Excel template
exports.bulkCreateLibrariesFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng tải lên file Excel" });
    }

    // Đọc file Excel từ buffer với encoding UTF-8
    const workbook = xlsx.read(req.file.buffer, { 
      type: 'buffer',
      cellText: false,
      cellDates: true,
      raw: false,
      codepage: 65001 // UTF-8 encoding
    });
    
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]; // Đọc Sheet1
    const data = xlsx.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: '', // Default value cho empty cells
      blankrows: false // Skip blank rows
    });

    if (!data || data.length === 0) {
      return res.status(400).json({ message: "Không có dữ liệu trong file Excel" });
    }

    // Find the library with the highest libraryCode to continue numbering
    const lastLibrary = await Library.findOne().sort({ libraryCode: -1 });
    let nextCodeNumber = 1;
    if (lastLibrary && lastLibrary.libraryCode) {
      nextCodeNumber = parseInt(lastLibrary.libraryCode, 10) + 1;
    }

    const newLibraries = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      try {
        // Clean và validate dữ liệu trước khi mapping
        const cleanTitle = row["Tên đầu sách"] ? String(row["Tên đầu sách"]).trim() : '';
        const cleanAuthors = row["Tác giả"] ? String(row["Tác giả"]).trim() : '';
        
        // Skip nếu title rỗng hoặc chứa ký tự lạ
        if (!cleanTitle || cleanTitle.includes('') || cleanTitle.includes('PK')) {
          errors.push(`Dòng ${i + 1}: Tên đầu sách không hợp lệ hoặc bị lỗi encoding`);
          continue;
        }

        // Mapping từ tên cột Excel sang field của Library model
        const libraryData = {
          title: cleanTitle,
          authors: cleanAuthors ? cleanAuthors.split(',').map(author => author.trim()).filter(Boolean) : [],
          category: row["Thể loại"] ? String(row["Thể loại"]).trim() : '',
          language: row["Ngôn ngữ"] ? String(row["Ngôn ngữ"]).trim() : 'Tiếng Việt',
          documentType: row["Phân loại tài liệu"] ? String(row["Phân loại tài liệu"]).trim() : '',
          seriesName: row["Tùng thư"] ? String(row["Tùng thư"]).trim() : '',
          isNewBook: String(row["Sách mới"]).toLowerCase() === 'true',
          isFeaturedBook: String(row["Nổi bật"]).toLowerCase() === 'true',
          isAudioBook: String(row["Sách nói"]).toLowerCase() === 'true',
          description: {
            linkEmbed: row["Link mô tả"] ? String(row["Link mô tả"]).trim() : '',
            content: row["Nội dung mô tả"] ? String(row["Nội dung mô tả"]).trim() : ''
          },
          introduction: {
            linkEmbed: row["Link giới thiệu"] ? String(row["Link giới thiệu"]).trim() : '',
            content: row["Nội dung giới thiệu"] ? String(row["Nội dung giới thiệu"]).trim() : ''
          },
          audioBook: {
            linkEmbed: row["Link sách nói"] ? String(row["Link sách nói"]).trim() : '',
            content: row["Nội dung sách nói"] ? String(row["Nội dung sách nói"]).trim() : ''
          }
        };

        // Validate required fields
        if (!libraryData.title || !libraryData.title.trim()) {
          errors.push(`Dòng ${i + 1}: Thiếu tên đầu sách`);
          continue;
        }

        // Generate library code
        const libraryCode = String(nextCodeNumber).padStart(4, "0");
        nextCodeNumber++;

        const newLibrary = new Library({
          ...libraryData,
          libraryCode,
          books: [] // Initialize with empty books array
        });

        // Sync authors
        await syncAuthors(newLibrary.authors);
        
        const savedLibrary = await newLibrary.save();
        newLibraries.push(savedLibrary);

      } catch (error) {
        errors.push(`Dòng ${i + 1}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Có lỗi trong dữ liệu Excel', 
        details: errors,
        successCount: newLibraries.length,
        totalCount: data.length
      });
    }

    return res.status(201).json({
      message: `Đã tạo thành công ${newLibraries.length} đầu sách từ file Excel`,
      libraries: newLibraries
    });

  } catch (error) {
    console.error('Error bulk creating libraries from Excel:', error);
    return res.status(500).json({ 
      message: 'Lỗi khi xử lý file Excel',
      error: error.message 
    });
  }
};

// READ - Lấy danh sách tất cả Library
exports.getAllLibraries = async (req, res) => {
  try {
    const libraries = await Library.find();
    return res.status(200).json(libraries);
  } catch (error) {
    console.error("Error getting libraries:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// READ - Lấy chi tiết 1 Library theo ID
exports.getLibraryById = async (req, res) => {
  try {
    const { id } = req.params;
    const library = await Library.findById(id);
    if (!library) {
      return res.status(404).json({ error: "Library not found" });
    }
    return res.status(200).json(library);
  } catch (error) {
    console.error("Error getting library by ID:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// UPDATE - Cập nhật Library theo ID
exports.updateLibrary = async (req, res) => {
  console.log(req.body);
  console.log(req.params);

  try {
    const { id } = req.params;
    
    // Parse authors từ FormData nếu là string JSON
    if (typeof req.body.authors === 'string') {
      try {
        req.body.authors = JSON.parse(req.body.authors);
      } catch (e) {
        // Nếu không parse được JSON, thử split bằng dấu phẩy (fallback)
        req.body.authors = req.body.authors.split(',').map(author => author.trim()).filter(Boolean);
      }
    }
    
    // Convert string boolean values từ FormData về boolean
    if (typeof req.body.isNewBook === 'string') {
      req.body.isNewBook = req.body.isNewBook === 'true';
    }
    if (typeof req.body.isFeaturedBook === 'string') {
      req.body.isFeaturedBook = req.body.isFeaturedBook === 'true';
    }
    if (typeof req.body.isAudioBook === 'string') {
      req.body.isAudioBook = req.body.isAudioBook === 'true';
    }
    
    // Đảm bảo các trường mô tả được xử lý đúng với cấu trúc mới
    if (req.body.description !== undefined) {
      if (typeof req.body.description !== 'object') {
        req.body.description = {
          linkEmbed: '',
          content: req.body.description || ''
        };
      }
    }
    if (req.body.introduction !== undefined) {
      if (typeof req.body.introduction !== 'object') {
        req.body.introduction = {
          linkEmbed: '',
          content: req.body.introduction || ''
        };
      }
    }
    if (req.body.audioBook !== undefined) {
      if (typeof req.body.audioBook !== 'object') {
        req.body.audioBook = {
          linkEmbed: '',
          content: req.body.audioBook || ''
        };
      }
    }
    
    const updatedLibrary = await Library.findByIdAndUpdate(id, req.body, {
      new: true, 
    });
        await syncAuthors(updatedLibrary.authors);
    if (!updatedLibrary) {
      return res.status(404).json({ error: "Library not found" });
    }
    return res.status(200).json({
      ...updatedLibrary.toObject(),
      filePath: updatedLibrary.coverImage || ""
    });
  } catch (error) {
    console.error("Error updating library:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// DELETE - Xóa Library theo ID
exports.deleteLibrary = async (req, res) => {
  try {
    const library = await Library.findByIdAndDelete(req.params.id);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    return res.status(200).json({ message: 'Library deleted successfully' });
  } catch (error) {
    console.error('Error deleting library:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /libraries/:id/upload-cover - Upload cover image for specific library
exports.updateLibraryCoverImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { coverImage } = req.body; // This comes from the middleware after processing the file
    
    if (!coverImage) {
      return res.status(400).json({ error: "Không có ảnh bìa để cập nhật" });
    }
    
    const updatedLibrary = await Library.findByIdAndUpdate(
      id, 
      { coverImage }, 
      { new: true }
    );
    
    if (!updatedLibrary) {
      return res.status(404).json({ error: "Không tìm thấy đầu sách" });
    }
    
    return res.status(200).json({
      message: "Cập nhật ảnh bìa thành công",
      library: {
        _id: updatedLibrary._id,
        title: updatedLibrary.title,
        libraryCode: updatedLibrary.libraryCode,
        coverImage: updatedLibrary.coverImage
      }
    });
  } catch (error) {
    console.error("Error updating library cover image:", error);
    return res.status(500).json({ error: "Lỗi server khi cập nhật ảnh bìa" });
  }
};

// --------------------------------------------

// Document Type Controllers
exports.getAllDocumentTypes = async (req, res) => {
  try {
    const types = await DocumentType.find();
    return res.status(200).json(types);
  } catch (error) {
    console.error("Error fetching document types:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.createDocumentType = async (req, res) => {
  try {
    const { name, code } = req.body;

    // Kiểm tra trùng mã trước khi tạo mới
    const existing = await DocumentType.findOne({ code });
    if (existing) {
      return res.status(400).json({ error: "Mã này đã tồn tại." });
    }

    const newType = new DocumentType({ name, code });
    await newType.save();
    return res.status(201).json(newType);
  } catch (error) {
    console.error("Error creating document type:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.updateDocumentType = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedDocType = await DocumentType.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedDocType) {
      return res.status(404).json({ error: "Document Type not found" });
    }
    return res.status(200).json(updatedDocType);
  } catch (error) {
    console.error("Error updating document type:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteDocumentType = async (req, res) => {
  try {
    const { id } = req.params;
    await DocumentType.findByIdAndDelete(id);
    return res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("Error deleting document type:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// --------------------------------------------
// SeriesName Controllers

exports.getAllSeriesNames = async (req, res) => {
  try {
    const seriesNames = await SeriesName.find();
    return res.status(200).json(seriesNames);
  } catch (error) {
    console.error("Error fetching series names:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.createSeriesName = async (req, res) => {
  try {
    const { name, code } = req.body;
    
    // Tự động generate code từ name nếu không có code
    let generatedCode = code;
    if (!generatedCode) {
      // Tạo code từ name: loại bỏ dấu, chuyển thành uppercase, thay space thành underscore
      generatedCode = name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9_]/g, "");
      
      // Thêm timestamp để đảm bảo unique
      generatedCode += "_" + Date.now().toString().slice(-4);
    }
    
    // Kiểm tra trùng code
    const existingByCode = await SeriesName.findOne({ code: generatedCode });
    if (existingByCode) {
      return res.status(400).json({ error: "Mã này đã tồn tại." });
    }
    
    // Kiểm tra trùng name
    const existingByName = await SeriesName.findOne({ name });
    if (existingByName) {
      return res.status(400).json({ error: "Tên tùng thư này đã tồn tại." });
    }
    
    const newSeries = new SeriesName({ name, code: generatedCode });
    await newSeries.save();
    return res.status(201).json(newSeries);
  } catch (error) {
    console.error("Error creating series name:", error);
    if (error.code === 11000) {
      return res.status(400).json({ error: "Dữ liệu đã tồn tại trong hệ thống." });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.updateSeriesName = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedSeries = await SeriesName.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedSeries) {
      return res.status(404).json({ error: "Series not found" });
    }
    return res.status(200).json(updatedSeries);
  } catch (error) {
    console.error("Error updating series name:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteSeriesName = async (req, res) => {
  try {
    const { id } = req.params;
    await SeriesName.findByIdAndDelete(id);
    return res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("Error deleting series name:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -------------------- Special Code Controllers -------------------- //

exports.getAllSpecialCodes = async (req, res) => {
  try {
    const codes = await SpecialCode.find();
    return res.status(200).json(codes);
  } catch (error) {
    console.error("Error fetching special codes:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.createSpecialCode = async (req, res) => {
  try {
    const { code, name, language } = req.body;
    // Kiểm tra trùng mã đặc biệt (name) trước khi tạo mới
    const existing = await SpecialCode.findOne({ name });
    if (existing) {
      return res.status(400).json({ error: "Mã đặc biệt này đã tồn tại." });
    }
    const newCode = new SpecialCode({ code, name, language });
    await newCode.save();
    return res.status(201).json(newCode);
  } catch (error) {
    console.error("Error creating special code:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
exports.updateSpecialCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, language } = req.body;
    
    // Kiểm tra xem có Special Code khác với cùng mã đặc biệt (name) này không (trừ chính record hiện tại)
    if (name) {
      const existing = await SpecialCode.findOne({ 
        name: name, 
        _id: { $ne: id } 
      });
      if (existing) {
        return res.status(400).json({ error: "Mã đặc biệt này đã tồn tại." });
      }
    }
    
    const updatedCode = await SpecialCode.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedCode) {
      return res.status(404).json({ error: "Special Code not found" });
    }
    return res.status(200).json(updatedCode);
  } catch (error) {
    console.error("Error updating special code:", error);
    
    // Xử lý lỗi duplicate key
    if (error.code === 11000) {
      return res.status(400).json({ error: "Mã đặc biệt này đã tồn tại trong hệ thống." });
    }
    
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteSpecialCode = async (req, res) => {
  try {
    const { id } = req.params;
    await SpecialCode.findByIdAndDelete(id);
    return res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("Error deleting special code:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


exports.getBooksFromLibrary = async (req, res) => {
  try {
    const { libraryId } = req.params;
    const library = await Library.findById(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    return res.status(200).json(library.books);
  } catch (error) {
    console.error('Error retrieving books from library:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /libraries/:libraryId/books
exports.addBookToLibrary = async (req, res) => {
  try {
    const { libraryId } = req.params;
    const library = await Library.findById(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }
    
    // Yêu cầu có specialCodeId để tìm mã đặc biệt trong database
    if (!req.body.specialCodeId) {
      return res.status(400).json({ error: 'Special code ID is required for the book.' });
    }
    
    // Tìm SpecialCode trong database để lấy mã đặc biệt (name)
    const specialCodeRecord = await SpecialCode.findById(req.body.specialCodeId);
    if (!specialCodeRecord) {
      return res.status(400).json({ error: 'Special code not found.' });
    }
    
    const specialCode = specialCodeRecord.name; // name chính là mã đặc biệt (như BV1, TL2...)
    
    // Lấy số lượng sách cần tạo (mặc định là 1)
    const copyCount = req.body.copyCount || 1;
    
    // Validate copyCount
    if (copyCount < 1 || copyCount > 100) {
      return res.status(400).json({ error: 'Copy count must be between 1 and 100' });
    }
    
    // Tính số thứ tự bắt đầu cho sách hiện có trong Library
    let currentCount = library.books.length;
    
    // Loại bỏ các trường không cần thiết khỏi book data
    const bookData = { ...req.body };
    delete bookData.specialCodeId;
    delete bookData.copyCount;
    delete bookData.isNewBook;
    delete bookData.isFeaturedBook;
    delete bookData.isAudioBook;
    
    // Tạo nhiều sách dựa trên copyCount
    const newBooks = [];
    for (let i = 0; i < copyCount; i++) {
      currentCount++;
      const serialNumber = String(currentCount).padStart(3, '0'); // pad STT thành 3 chữ số
      
      const newBook = {
        ...bookData,
        generatedCode: `${specialCode}.${library.libraryCode}.${serialNumber}`,
        specialCode: specialCode,
        catalogingAgency: bookData.catalogingAgency || 'WIS',
        publishYear: bookData.publishYear ? Number(bookData.publishYear) : null,
        pages: bookData.pages ? Number(bookData.pages) : null,
        coverPrice: bookData.coverPrice ? Number(bookData.coverPrice) : null,
      };
      
      newBooks.push(newBook);
    }
    
    // Thêm tất cả sách mới vào mảng books và lưu Library
    library.books.push(...newBooks);
    await library.save();
    
    return res.status(200).json({
      message: `Đã thêm thành công ${copyCount} sách`,
      library,
      addedBooks: newBooks
    });
  } catch (error) {
    console.error('Error adding book to library:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /libraries/:libraryId/books/bulk - Bulk add books to library
exports.bulkAddBooksToLibrary = async (req, res) => {
  try {
    const { libraryId } = req.params;
    const { books } = req.body; // Array of book objects

    if (!books || !Array.isArray(books) || books.length === 0) {
      return res.status(400).json({ error: 'Books array is required and must not be empty' });
    }

    const library = await Library.findById(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    // Get all special codes for validation
    const specialCodes = await SpecialCode.find({});
    const specialCodeMap = {};
    specialCodes.forEach(sc => {
      specialCodeMap[sc._id.toString()] = sc;
    });

    const newBooks = [];
    const errors = [];
    let currentCount = library.books.length; // Bắt đầu từ số sách hiện có

    for (let i = 0; i < books.length; i++) {
      const bookData = books[i];
      
      try {
        // Validate required fields
        if (!bookData.specialCodeId) {
          errors.push(`Dòng ${i + 1}: Thiếu mã đặc biệt`);
          continue;
        }

        const specialCode = specialCodeMap[bookData.specialCodeId];
        if (!specialCode) {
          errors.push(`Dòng ${i + 1}: Mã đặc biệt không hợp lệ`);
          continue;
        }

        // Tính số thứ tự cho sách mới
        currentCount++;
        const serialNumber = String(currentCount).padStart(3, '0');
        const generatedCode = `${specialCode.name}.${library.libraryCode}.${serialNumber}`;

        // Remove library-level properties from book data
        delete bookData.isNewBook;
        delete bookData.isFeaturedBook;
        delete bookData.isAudioBook;
        delete bookData.specialCodeId; // Remove after using

        const newBook = {
          ...bookData,
          specialCode: specialCode.name,
          generatedCode,
          catalogingAgency: bookData.catalogingAgency || 'WIS', // Default value
          publishYear: bookData.publishYear ? Number(bookData.publishYear) : null,
          pages: bookData.pages ? Number(bookData.pages) : null,
          coverPrice: bookData.coverPrice ? Number(bookData.coverPrice) : null,
        };

        newBooks.push(newBook);
      } catch (error) {
        errors.push(`Dòng ${i + 1}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ 
        error: 'Có lỗi trong dữ liệu bulk upload', 
        details: errors,
        successCount: newBooks.length,
        totalCount: books.length
      });
    }

    // Add all valid books to library
    library.books.push(...newBooks);
    await library.save();

    return res.status(201).json({
      message: `Đã thêm thành công ${newBooks.length} sách`,
      library,
      addedBooks: newBooks
    });

  } catch (error) {
    console.error('Error bulk adding books to library:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /libraries/:libraryId/books/:bookIndex
exports.updateBookInLibrary = async (req, res) => {
  try {
    const { libraryId, bookIndex } = req.params;
    const library = await Library.findById(libraryId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    if (!library.books[bookIndex]) {
      return res.status(404).json({ error: 'Book detail not found in this library' });
    }

    // Loại bỏ các trường đặc điểm sách khỏi book data vì đã chuyển lên library level
    delete req.body.isNewBook;
    delete req.body.isFeaturedBook;
    delete req.body.isAudioBook;

    // Gộp thuộc tính cũ và mới
    library.books[bookIndex] = {
      ...library.books[bookIndex]._doc, 
      ...req.body,
    };

    await library.save();
    return res.status(200).json(library);
  } catch (error) {
    console.error('Error updating book in library:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PUT /libraries/books/:bookCode - Update book by generatedCode
exports.updateBookByCode = async (req, res) => {
  try {
    const { bookCode } = req.params;
    const decodedBookCode = decodeURIComponent(bookCode);

    // Loại bỏ các trường đặc điểm sách khỏi book data vì đã chuyển lên library level
    delete req.body.isNewBook;
    delete req.body.isFeaturedBook;
    delete req.body.isAudioBook;

    // Tìm library có books.generatedCode = decodedBookCode
    const library = await Library.findOne({ "books.generatedCode": decodedBookCode });
    if (!library) {
      return res.status(404).json({ error: "Book not found in any library" });
    }

    // Tìm book trong library
    const bookIndex = library.books.findIndex(b => b.generatedCode === decodedBookCode);
    if (bookIndex === -1) {
      return res.status(404).json({ error: "Book not found in library" });
    }

    // Gộp thuộc tính cũ và mới
    library.books[bookIndex] = {
      ...library.books[bookIndex]._doc,
      ...req.body,
    };

    await library.save();
    return res.status(200).json({ message: "Updated book successfully", book: library.books[bookIndex] });
  } catch (error) {
    console.error("Error updating book by code:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// DELETE /libraries/books/:bookCode
exports.deleteBookByCode = async (req, res) => {
  try {
    const { bookCode } = req.params;
    const decodedBookCode = decodeURIComponent(bookCode);

    // Tìm library có books.generatedCode = decodedBookCode
    const library = await Library.findOne({ "books.generatedCode": decodedBookCode });
    if (!library) {
      return res.status(404).json({ error: "Book not found in any library" });
    }

    // Filter bỏ sách có generatedCode trùng
    library.books = library.books.filter(b => b.generatedCode !== decodedBookCode);

    await library.save();
    return res.status(200).json({ message: "Deleted book successfully" });
  } catch (error) {
    console.error("Error deleting book by code:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAllBooks = async (req, res) => {
  try {
    const libraries = await Library.find();
    const allBooks = libraries.reduce((acc, library) => {
      const booksWithLibraryId = library.books.map(book => ({ 
        ...book.toObject(), 
        libraryId: library._id,
        isNewBook: library.isNewBook, // Lấy từ library level
        isFeaturedBook: library.isFeaturedBook,
        isAudioBook: library.isAudioBook
      }));
      return acc.concat(booksWithLibraryId);
    }, []);
    return res.status(200).json(allBooks);
  } catch (error) {
    console.error('Error fetching all books:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /libraries/new-books - Lấy danh sách thư viện mới
exports.getNewBooks = async (req, res) => {
  try {
    const { limit = 4 } = req.query; // Default lấy 4 quyển
    
    console.log('🔍 [getNewBooks] Starting query for isNewBook: true');
    const libraries = await Library.find({ isNewBook: true }).sort({ createdAt: -1 }).limit(parseInt(limit)); // Lấy libraries có isNewBook = true
    console.log('📚 [getNewBooks] Found libraries:', libraries.length);
    console.log('📚 [getNewBooks] Libraries data:', JSON.stringify(libraries.map(lib => ({ id: lib._id, title: lib.title, isNewBook: lib.isNewBook })), null, 2));
    
    // Chuyển đổi libraries thành format cho frontend
    const newLibraries = libraries.map(library => {
      // Tạo dữ liệu cho mỗi library (có thể có nhiều books hoặc không có book nào)
      const libraryData = {
        _id: library._id,
        libraryId: library._id,
        libraryCode: library.libraryCode,
        libraryTitle: library.title,
        bookTitle: library.title, // Fallback cho compatibility
        title: library.title,
        authors: library.authors,
        category: library.category,
        coverImage: library.coverImage,
        documentType: library.documentType,
        seriesName: library.seriesName,
        isNewBook: library.isNewBook,
        isFeaturedBook: library.isFeaturedBook,
        isAudioBook: library.isAudioBook,
        totalBooks: library.books ? library.books.length : 0,
        rating: Math.floor(Math.random() * 5) + 1, // Random rating 1-5 (tạm thời)
        borrowCount: 0, // Default
        publishYear: new Date(library.createdAt).getFullYear(), // Lấy năm tạo library
        generatedCode: library.libraryCode, // Để tránh lỗi khi frontend map
      };
      
      return libraryData;
    });
    
    return res.status(200).json(newLibraries);
  } catch (error) {
    console.error('Error fetching new libraries:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /libraries/featured-books - Lấy danh sách thư viện nổi bật
exports.getFeaturedBooks = async (req, res) => {
  try {
    const { limit = 4 } = req.query; // Default lấy 4 thư viện
    
    console.log('🔍 [getFeaturedBooks] Starting query for isFeaturedBook: true');
    const libraries = await Library.find({ isFeaturedBook: true }).sort({ createdAt: -1 }).limit(parseInt(limit)); // Lấy libraries có isFeaturedBook = true
    console.log('📚 [getFeaturedBooks] Found libraries:', libraries.length);
    console.log('📚 [getFeaturedBooks] Libraries data:', JSON.stringify(libraries.map(lib => ({ id: lib._id, title: lib.title, isFeaturedBook: lib.isFeaturedBook })), null, 2));
    
    // Chuyển đổi libraries thành format cho frontend - tương tự như getNewBooks
    const featuredLibraries = libraries.map(library => {
      // Tạo dữ liệu cho mỗi library (có thể có nhiều books hoặc không có book nào)
      const libraryData = {
        _id: library._id,
        libraryId: library._id,
        libraryCode: library.libraryCode,
        libraryTitle: library.title,
        bookTitle: library.title, // Fallback cho compatibility
        title: library.title,
        authors: library.authors,
        category: library.category,
        coverImage: library.coverImage,
        documentType: library.documentType,
        seriesName: library.seriesName,
        isNewBook: library.isNewBook,
        isFeaturedBook: library.isFeaturedBook,
        isAudioBook: library.isAudioBook,
        totalBooks: library.books ? library.books.length : 0,
        rating: Math.floor(Math.random() * 5) + 1, // Random rating 1-5 (tạm thời)
        borrowCount: 0, // Default
        publishYear: new Date(library.createdAt).getFullYear(), // Lấy năm tạo library
        generatedCode: library.libraryCode, // Để tránh lỗi khi frontend map
      };
      
      return libraryData;
    });
    
    return res.status(200).json(featuredLibraries);
  } catch (error) {
    console.error('Error fetching featured libraries:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /libraries/audio-books - Lấy danh sách thư viện sách nói
exports.getAudioBooks = async (req, res) => {
  try {
    const { limit = 4 } = req.query; // Default lấy 4 thư viện
    
    console.log('🔍 [getAudioBooks] Starting query for isAudioBook: true');
    const libraries = await Library.find({ isAudioBook: true }).sort({ createdAt: -1 }).limit(parseInt(limit)); // Lấy libraries có isAudioBook = true
    console.log('📚 [getAudioBooks] Found libraries:', libraries.length);
    console.log('📚 [getAudioBooks] Libraries data:', JSON.stringify(libraries.map(lib => ({ id: lib._id, title: lib.title, isAudioBook: lib.isAudioBook })), null, 2));
    
    // Chuyển đổi libraries thành format cho frontend - tương tự như getNewBooks và getFeaturedBooks
    const audioLibraries = libraries.map(library => {
      // Tạo dữ liệu cho mỗi library (có thể có nhiều books hoặc không có book nào)
      const libraryData = {
        _id: library._id,
        libraryId: library._id,
        libraryCode: library.libraryCode,
        libraryTitle: library.title,
        bookTitle: library.title, // Fallback cho compatibility
        title: library.title,
        authors: library.authors,
        category: library.category,
        coverImage: library.coverImage,
        documentType: library.documentType,
        seriesName: library.seriesName,
        isNewBook: library.isNewBook,
        isFeaturedBook: library.isFeaturedBook,
        isAudioBook: library.isAudioBook,
        totalBooks: library.books ? library.books.length : 0,
        rating: Math.floor(Math.random() * 5) + 1, // Random rating 1-5 (tạm thời)
        borrowCount: 0, // Default
        publishYear: new Date(library.createdAt).getFullYear(), // Lấy năm tạo library
        generatedCode: library.libraryCode, // Để tránh lỗi khi frontend map
        // Thêm thông tin đặc biệt cho sách nói
        duration: `${Math.floor(Math.random() * 8) + 3}h ${Math.floor(Math.random() * 60)}m`, // Random duration
        narrator: library.authors?.[0] || 'Chưa có thông tin người đọc' // Fallback narrator
      };
      
      return libraryData;
    });
    
    return res.status(200).json(audioLibraries);
  } catch (error) {
    console.error('Error fetching audio libraries:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// -------------------- Author Controllers -------------------- //

// GET /libraries/authors - Lấy danh sách tất cả tác giả
exports.getAllAuthors = async (req, res) => {
  try {
    const authors = await Author.find();
    return res.status(200).json(authors);
  } catch (error) {
    console.error("Error fetching authors:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// POST /libraries/authors - Tạo mới tác giả
exports.createAuthor = async (req, res) => {
  try {
    const { name } = req.body;
    const newAuthor = new Author({ name });
    await newAuthor.save();
    return res.status(201).json(newAuthor);
  } catch (error) {
    console.error("Error creating author:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// PUT /libraries/authors/:id - Cập nhật thông tin tác giả
exports.updateAuthor = async (req, res) => {
  try {
    const { id } = req.params;
    // Lấy record tác giả cũ để biết tên cũ
    const oldAuthor = await Author.findById(id);
    if (!oldAuthor) {
      return res.status(404).json({ error: "Author not found" });
    }

    // Cập nhật tác giả với dữ liệu mới
    const updatedAuthor = await Author.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedAuthor) {
      return res.status(404).json({ error: "Author not found" });
    }

    // Đồng bộ lại tên tác giả trong tất cả các Library có chứa tên cũ
    await Library.updateMany(
      { authors: oldAuthor.name },
      { $set: { "authors.$[elem]": updatedAuthor.name } },
      { arrayFilters: [{ elem: oldAuthor.name }] }
    );

    return res.status(200).json(updatedAuthor);
  } catch (error) {
    console.error("Error updating author:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// DELETE /libraries/authors/:id - Xóa tác giả
exports.deleteAuthor = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAuthor = await Author.findByIdAndDelete(id);
    if (!deletedAuthor) {
      return res.status(404).json({ error: "Author not found" });
    }
    return res.status(200).json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("Error deleting author:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};


/// Hàm mượn sách

exports.borrowBook = async (req, res) => {
  try {
    const { libraryId, bookIndex } = req.params;
    const { studentId } = req.body; 
    // studentId này gửi từ client, trỏ tới _id của Student.

    // Tìm Library
    const library = await Library.findById(libraryId);
    if (!library) {
      return res.status(404).json({ error: "Library not found" });
    }

    // Kiểm tra xem bookIndex hợp lệ không
    if (!library.books[bookIndex]) {
      return res.status(404).json({ error: "Book detail not found in this library" });
    }

    // Lấy reference tới book
    const book = library.books[bookIndex];

    // Kiểm tra nếu sách đang ở trạng thái Sẵn sàng
    if (book.status !== "Sẵn sàng") {
      return res.status(400).json({ error: "Book is not available for borrowing" });
    }

    // Cập nhật thông tin mượn
    book.status = "Đang mượn";
    book.borrowedBy = studentId || null; // Hoặc req.body.studentName nếu bạn không dùng ObjectId
    book.borrowedDate = new Date();
    book.returnDate = null; // Chưa trả

    await library.save();
    return res.status(200).json(library);
  } catch (error) {
    console.error("Error borrowing book:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.returnBook = async (req, res) => {
  try {
    const { libraryId, bookIndex } = req.params;

    const library = await Library.findById(libraryId);
    if (!library) {
      return res.status(404).json({ error: "Library not found" });
    }

    if (!library.books[bookIndex]) {
      return res.status(404).json({ error: "Book detail not found in this library" });
    }

    const book = library.books[bookIndex];

    // Kiểm tra nếu sách đang ở trạng thái Đang mượn
    if (book.status !== "Đang mượn") {
      return res.status(400).json({ error: "Book is not in 'Đang mượn' state" });
    }

    // Cập nhật thông tin trả
    book.status = "Sẵn sàng";    // hoặc "Đã mượn" nếu bạn muốn kết thúc vòng đời
    book.returnDate = new Date(); 
    // borrowedBy và borrowedDate vẫn giữ để biết ai vừa mượn.
    // Hoặc bạn có thể reset borrowedBy = null nếu cần

    await library.save();
    return res.status(200).json(library);
  } catch (error) {
    console.error("Error returning book:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Lấy mọi Library + books + lookup sang Student, Class, Photo
exports.getAllLibrariesFull = async (req, res) => {
  try {
    const records = await Library.aggregate([
      // (1) Tách mảng books để xử lý lookup
      {
        $unwind: {
          path: "$books",
          preserveNullAndEmptyArrays: true,
        },
      },
      // (2) Lookup thông tin Student
      {
        $lookup: {
          from: "students",
          localField: "books.borrowedBy",
          foreignField: "_id",
          as: "borrowedStudent",
        },
      },
      // (3) Lookup Enrollment để lấy thông tin Class
      {
        $lookup: {
          from: "studentclassenrollments",
          let: { stuId: "$books.borrowedBy" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$student", "$$stuId"] },
              },
            },
            {
              $lookup: {
                from: "classes",
                localField: "class",
                foreignField: "_id",
                as: "classInfo",
              },
            },
            { $unwind: { path: "$classInfo", preserveNullAndEmptyArrays: true } },
          ],
          as: "studentEnroll",
        },
      },
      // (4) Lookup Photo
      {
        $lookup: {
          from: "photos",
          let: { sId: "$books.borrowedBy" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$student", "$$sId"] },
              },
            },
            // Tùy nếu bạn cần match schoolYear: 
            // { $match: { $expr: { $eq: ["$schoolYear", "xxxx"] } } }
          ],
          as: "studentPhoto",
        },
      },
      // (5) Gom thông tin Student, Class, Photo vào trường books
      {
        $addFields: {
          "books.borrowedStudent": {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$borrowedStudent",
                  as: "bs",
                  cond: { $eq: ["$$bs._id", "$books.borrowedBy"] },
                },
              },
              0,
            ],
          },
          "books.studentEnroll": {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$studentEnroll",
                  as: "en",
                  cond: { $eq: ["$$en.student", "$books.borrowedBy"] },
                },
              },
              0,
            ],
          },
          "books.studentPhoto": {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$studentPhoto",
                  as: "ph",
                  cond: { $eq: ["$$ph.student", "$books.borrowedBy"] },
                },
              },
              0,
            ],
          },
        },
      },
      // (6) Gộp các books lại về thành 1 mảng
      {
        $group: {
          _id: "$_id",
          libraryCode: { $first: "$libraryCode" },
          authors: { $first: "$authors" },
          title: { $first: "$title" },
          coverImage: { $first: "$coverImage" },
          category: { $first: "$category" },
          documentType: { $first: "$documentType" },
          seriesName: { $first: "$seriesName" },
          language: { $first: "$language" },
          description: { $first: "$description" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          books: { $push: "$books" },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    return res.status(200).json(records);
  } catch (error) {
    console.error("Error in getAllLibrariesFull:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.borrowMultipleBooks = async (req, res) => {
  try {
    // req.body gồm:
    // {
    //   studentId: "...", // hoặc studentName, ...
    //   borrowedBooks: [
    //     { libraryId: "...", bookCode: "BV1.0001.001" },
    //     { libraryId: "...", bookCode: "BV1.0001.002" },
    //     ...
    //   ]
    // }
    const { studentId, borrowedBooks } = req.body;
    if (!borrowedBooks || !Array.isArray(borrowedBooks)) {
      return res.status(400).json({ error: "Invalid borrowedBooks format" });
    }

    // Lặp qua từng sách, cập nhật status = 'Đang mượn', borrowedBy = studentId, borrowedDate = now
    for (let item of borrowedBooks) {
      const { libraryId, bookCode } = item;
      const library = await Library.findById(libraryId);
      if (!library) continue; // hoặc báo lỗi

      // Tìm sách trong library.books
      const book = library.books.find((bk) => bk.generatedCode === bookCode);
      if (!book) continue;

      // Chỉ update nếu status hiện tại là 'Sẵn sàng'
      if (book.status === "Sẵn sàng") {
        book.status = "Đang mượn";
        book.borrowedBy = studentId || null;
        book.borrowedDate = new Date();
        book.returnDate = null; // reset trả
        library.borrowCount = (library.borrowCount || 0) + 1;

      }
      await library.save();
    }

    return res.status(200).json({ message: "Borrowed successfully" });
  } catch (error) {
    console.error("Error in borrowMultipleBooks:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// GET /books/detail/:slug - Lấy chi tiết sách theo slug
exports.getBookDetailBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    console.log('🔍 [getBookDetailBySlug] Searching for slug:', slug);
    
    // Function to create slug from title (same as frontend)
    const createSlug = (title) => {
      if (!title) return '';
      return title
        .toLowerCase()
        .replace(/[áàạảãâấầậẩẫăắằặẳẵ]/g, 'a')
        .replace(/[éèẹẻẽêếềệểễ]/g, 'e')
        .replace(/[íìịỉĩ]/g, 'i')
        .replace(/[óòọỏõôốồộổỗơớờợởỡ]/g, 'o')
        .replace(/[úùụủũưứừựửữ]/g, 'u')
        .replace(/[ýỳỵỷỹ]/g, 'y')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
        .replace(/^-+|-+$/g, '');
    };

    // Tìm tất cả libraries
    const libraries = await Library.find();
    let foundLibrary = null;
    let foundBook = null;

    // Tìm kiếm trong tất cả libraries và books
    for (const library of libraries) {
      // Kiểm tra slug của library title
      if (createSlug(library.title) === slug) {
        foundLibrary = library;
        // Nếu tìm thấy library match, lấy book đầu tiên hoặc tạo book data từ library
        if (library.books && library.books.length > 0) {
          foundBook = library.books[0]; // Lấy book đầu tiên
        }
        break;
      }

      // Kiểm tra slug trong các books của library
      if (library.books) {
        for (const book of library.books) {
          if (book.title && createSlug(book.title) === slug) {
            foundLibrary = library;
            foundBook = book;
            break;
          }
        }
        if (foundBook) break;
      }
    }

    if (!foundLibrary) {
      console.log('❌ [getBookDetailBySlug] No library found for slug:', slug);
      return res.status(404).json({ error: "Book not found" });
    }

    console.log('✅ [getBookDetailBySlug] Found library:', foundLibrary.title);

    // Tạo response data từ library và book (nếu có)
    const bookDetail = {
      _id: foundBook?._id || foundLibrary._id,
      libraryId: foundLibrary._id,
      libraryCode: foundLibrary.libraryCode,
      title: foundBook?.title || foundLibrary.title,
      authors: foundLibrary.authors || [],
      // Cấu trúc mới cho 3 tab
      description: foundLibrary.description || { linkEmbed: '', content: 'Chưa có mô tả' },
      introduction: foundLibrary.introduction || { linkEmbed: '', content: 'Chưa có giới thiệu' },
      audioBook: foundLibrary.audioBook || { linkEmbed: '', content: 'Chưa có thông tin sách nói' },
      publishYear: foundBook?.publishYear || new Date(foundLibrary.createdAt).getFullYear(),
      genre: foundLibrary.documentType || foundLibrary.category || "Chưa phân loại",
      category: foundLibrary.category || foundLibrary.documentType,
      borrowCount: foundBook?.borrowCount || 0,
      totalBorrowCount: foundLibrary.borrowCount || 0,
      language: foundBook?.language || foundLibrary.language || "Tiếng Việt",
      coverImage: foundLibrary.coverImage,
      isOnline: foundBook?.isOnline || false,
      onlineLink: foundBook?.onlineLink || foundLibrary.audioBook?.linkEmbed || "Mở sách online",
      isAudioBook: foundLibrary.isAudioBook || false,
      isNewBook: foundLibrary.isNewBook || false,
      isFeaturedBook: foundLibrary.isFeaturedBook || false,
      rating: foundBook?.rating || Math.floor(Math.random() * 5) + 1,
      documentType: foundLibrary.documentType,
      seriesName: foundLibrary.seriesName,
      generatedCode: foundBook?.generatedCode || foundLibrary.libraryCode,
      status: foundBook?.status || "Sẵn sàng"
    };

    return res.status(200).json(bookDetail);
  } catch (error) {
    console.error('Error fetching book detail by slug:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /books/related - Lấy sách liên quan theo category
exports.getRelatedBooks = async (req, res) => {
  try {
    const { category, limit = 10 } = req.query;
    console.log('🔍 [getRelatedBooks] Searching for category:', category, 'with limit:', limit);
    
    if (!category || category.trim() === '') {
      // Nếu không có category, lấy random books
      const libraries = await Library.find().limit(parseInt(limit));
      const relatedBooks = libraries.map(library => ({
        _id: library._id,
        title: library.title,
        authors: library.authors,
        category: library.category || library.documentType,
        coverImage: library.coverImage,
        borrowCount: library.borrowCount || 0,
        totalBorrowCount: library.borrowCount || 0
      }));
      return res.status(200).json(relatedBooks);
    }

    // Tìm libraries có category tương tự
    const libraries = await Library.find({
      $or: [
        { category: new RegExp(category, 'i') },
        { documentType: new RegExp(category, 'i') },
        { seriesName: new RegExp(category, 'i') }
      ]
    }).limit(parseInt(limit));

    console.log('📚 [getRelatedBooks] Found libraries:', libraries.length);

    // Chuyển đổi libraries thành format cho related books
    const relatedBooks = libraries.map(library => ({
      _id: library._id,
      title: library.title,
      authors: library.authors,
      category: library.category || library.documentType || "Chưa phân loại",
      coverImage: library.coverImage,
      borrowCount: library.borrowCount || 0,
      totalBorrowCount: library.borrowCount || 0,
      isAudioBook: library.isAudioBook,
      isNewBook: library.isNewBook,
      isFeaturedBook: library.isFeaturedBook
    }));

    // Nếu không tìm thấy sách liên quan, lấy random books
    if (relatedBooks.length === 0) {
      console.log('⚠️ [getRelatedBooks] No related books found, getting random books');
      const randomLibraries = await Library.find().limit(parseInt(limit));
      const randomBooks = randomLibraries.map(library => ({
        _id: library._id,
        title: library.title,
        authors: library.authors,
        category: library.category || library.documentType || "Chưa phân loại",
        coverImage: library.coverImage,
        borrowCount: library.borrowCount || 0,
        totalBorrowCount: library.borrowCount || 0
      }));
      return res.status(200).json(randomBooks);
    }

    return res.status(200).json(relatedBooks);
  } catch (error) {
    console.error('Error fetching related books:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /libraries/:libraryId/book-count - Kiểm tra số lượng BookDetail trước khi xóa
exports.getBookCountForDelete = async (req, res) => {
  try {
    const { libraryId } = req.params;
    const library = await Library.findById(libraryId);
    
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    const bookCount = library.books ? library.books.length : 0;
    
    return res.status(200).json({
      libraryId: library._id,
      libraryTitle: library.title,
      bookCount: bookCount,
      books: library.books.map(book => ({
        generatedCode: book.generatedCode,
        title: book.bookTitle || book.title || library.title,
        status: book.status || 'Sẵn sàng'
      }))
    });
  } catch (error) {
    console.error('Error getting book count for delete:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};