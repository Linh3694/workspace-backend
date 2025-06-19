// controllers/libraryController.js
const { Library, DocumentType, SeriesName, SpecialCode, Author } = require("../../models/LibraryModel");
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
    const { id } = req.params;
    const deletedLibrary = await Library.findByIdAndDelete(id);
    if (!deletedLibrary) {
      return res.status(404).json({ error: "Library not found" });
    }
    return res.status(200).json({ message: "Library deleted successfully" });
  } catch (error) {
    console.error("Error deleting library:", error);
    return res.status(500).json({ error: "Internal server error" });
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
    const existing = await SpecialCode.findOne({ code });
    if (existing) {
      return res.status(400).json({ error: "Mã này đã tồn tại." });
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
    
    // Kiểm tra xem có Special Code khác với cùng code này không (trừ chính record hiện tại)
    if (code) {
      const existing = await SpecialCode.findOne({ 
        code: code, 
        _id: { $ne: id } 
      });
      if (existing) {
        return res.status(400).json({ error: "Mã này đã tồn tại." });
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
      return res.status(400).json({ error: "Mã này đã tồn tại trong hệ thống." });
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
    
    // Yêu cầu có specialCode cho sách
    if (!req.body.specialCode) {
      return res.status(400).json({ error: 'Special code is required for the book.' });
    }
    const specialCode = req.body.specialCode;
    
    // Tính số thứ tự cho sách hiện có trong Library (mỗi Library có libraryCode riêng nên count độc lập)
    const count = library.books.length; // số sách hiện có trong Library
    const serialNumber = String(count + 1).padStart(3, '0'); // pad STT thành 3 chữ số, ví dụ: 001, 002, ...
    
    // Sinh mã mới theo cú pháp: <specialCode>.<LibraryCode>.<STT>
    req.body.generatedCode = `${specialCode}.${library.libraryCode}.${serialNumber}`;
    
    // Loại bỏ các trường đặc điểm sách khỏi book data vì đã chuyển lên library level
    delete req.body.isNewBook;
    delete req.body.isFeaturedBook;
    delete req.body.isAudioBook;
    
    // Thêm sách mới vào mảng books và lưu Library
    library.books.push(req.body);
    await library.save();
    
    return res.status(200).json(library);
  } catch (error) {
    console.error('Error adding book to library:', error);
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

// GET /libraries/featured-books - Lấy danh sách sách nổi bật
exports.getFeaturedBooks = async (req, res) => {
  try {
    const { limit = 4 } = req.query; // Default lấy 4 quyển
    
    const libraries = await Library.find({ isFeaturedBook: true }); // Lấy libraries có isFeaturedBook = true
    const allBooks = libraries.reduce((acc, library) => {
      const booksWithLibraryInfo = library.books.map(book => ({ 
        ...book.toObject(), 
        libraryId: library._id,
        libraryTitle: library.title,
        libraryCode: library.libraryCode,
        authors: library.authors, // Lấy authors từ library level
        category: library.category || book.documentType, // Lấy category
        coverImage: library.coverImage, // Lấy cover image từ library
        publishYear: book.publishYear,
        rating: Math.floor(Math.random() * 5) + 1, // Random rating 1-5 (tạm thời)
        borrowCount: book.borrowCount || 0,
        isNewBook: library.isNewBook, // Lấy từ library level
        isFeaturedBook: library.isFeaturedBook,
        isAudioBook: library.isAudioBook
      }));
      return acc.concat(booksWithLibraryInfo);
    }, []);
    
    // Sort sách nổi bật theo borrowCount và thời gian tạo
    const featuredBooks = allBooks
      .sort((a, b) => {
        // Ưu tiên sách được đánh dấu isFeaturedBook
        if (a.isFeaturedBook && !b.isFeaturedBook) return -1;
        if (!a.isFeaturedBook && b.isFeaturedBook) return 1;
        
        // Sau đó sort theo borrowCount từ cao xuống thấp
        return (b.borrowCount || 0) - (a.borrowCount || 0);
      })
      .slice(0, parseInt(limit));
    
    return res.status(200).json(featuredBooks);
  } catch (error) {
    console.error('Error fetching featured books:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /libraries/audio-books - Lấy danh sách sách nói
exports.getAudioBooks = async (req, res) => {
  try {
    const { limit = 4 } = req.query; // Default lấy 4 quyển
    
    const libraries = await Library.find({ isAudioBook: true }); // Lấy libraries có isAudioBook = true 
    const allBooks = libraries.reduce((acc, library) => {
      const booksWithLibraryInfo = library.books.map(book => ({ 
        ...book.toObject(), 
        libraryId: library._id,
        libraryTitle: library.title,
        libraryCode: library.libraryCode,
        authors: library.authors, // Lấy authors từ library level
        category: library.category || book.documentType, // Lấy category
        coverImage: library.coverImage, // Lấy cover image từ library
        publishYear: book.publishYear,
        rating: Math.floor(Math.random() * 5) + 1, // Random rating 1-5 (tạm thời)
        borrowCount: book.borrowCount || 0,
        isNewBook: library.isNewBook, // Lấy từ library level
        isFeaturedBook: library.isFeaturedBook,
        isAudioBook: library.isAudioBook,
        // Thêm thông tin đặc biệt cho sách nói
        duration: book.duration || `${Math.floor(Math.random() * 8) + 3}h ${Math.floor(Math.random() * 60)}m`, // Random duration nếu không có
        narrator: book.narrator || library.authors?.[0] || 'Chưa có thông tin người đọc' // Fallback narrator
      }));
      return acc.concat(booksWithLibraryInfo);
    }, []);
    
    // Sort sách nói theo rating và borrowCount
    const audioBooks = allBooks
      .sort((a, b) => {
        // Ưu tiên sách có rating cao
        if (a.rating !== b.rating) {
          return (b.rating || 0) - (a.rating || 0);
        }
        
        // Sau đó sort theo borrowCount từ cao xuống thấp
        return (b.borrowCount || 0) - (a.borrowCount || 0);
      })
      .slice(0, parseInt(limit));
    
    return res.status(200).json(audioBooks);
  } catch (error) {
    console.error('Error fetching audio books:', error);
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