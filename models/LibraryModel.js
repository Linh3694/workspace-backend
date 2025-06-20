// File: models/LibraryModel.js
const mongoose = require('mongoose');

const DocumentTypeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
});
const DocumentType = mongoose.model("DocumentType", DocumentTypeSchema);

const SeriesNameSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true, sparse: true },
});
const SeriesName = mongoose.model("SeriesName", SeriesNameSchema);

const SpecialCodeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  language: { type: String, required: true },
});
const SpecialCode = mongoose.model("SpecialCode", SpecialCodeSchema);

const AuthorSchema = new mongoose.Schema({
  name: { type: String, required: true },
});
const Author = mongoose.model("Author", AuthorSchema);

const IntroductionSchema = new mongoose.Schema(
  {
    youtubeLink: {
      type: String,
      default: '',
    },
    fmVoizLink: {
      type: String,
      default: '',
    },
    content: {
      type: String,
      default: '',
    },
  },
  { _id: false } // Không cần _id riêng cho sub-schema
);

// Sub-schema chứa thông tin của từng "Sách"
const BookDetailSchema = new mongoose.Schema(
  {
    isbn: {
      type: String,
      default: '',
    },
    documentIdentifier: {
      // Định danh tài liệu
      type: String,
      default: '',
    },
    bookTitle: {
      // Tên Sách
      type: String,
      default: '',
    },
    classificationSign: {
      // Ký hiệu phân loại tài liệu
      type: String,
      default: '',
    },
    publisherPlaceName: {
      // Tên nơi xuất bản
      type: String,
      default: '',
    },
    publisherName: {
      // Tên nhà xuất bản
      type: String,
      default: '',
    },
    publishYear: {
      // Năm xuất bản
      type: Number,
      default: null,
    },
    pages: {
      // Số trang
      type: Number,
      default: null,
    },
    attachments: {
      // Tài liệu đính kèm (nếu có), có thể để dạng mảng
      type: [String],
      default: [],
    },
    documentType: {
      // Loại tài liệu
      type: String,
      default: '',
    },
    coverPrice: {
      // Giá bìa
      type: Number,
      default: null,
    },
    language: {
      // Ngôn ngữ
      type: String,
      default: '',
    },
    catalogingAgency: {
      // Cơ quan Biên mục
      type: String,
      default: '',
    },
    storageLocation: {
      // Kho lưu giữ tài liệu
      type: String,
      default: '',
    },
    seriesName: {
      // Tên Tùng thư
      type: String,
      default: '',
    },
    specialCode: {
      // Đăng ký cá biệt của sách (ví dụ: BV1)
      type: String,
      default: '',
    },
    generatedCode: {
      // Mã tự động sinh ra cho sách: <specialCode>.<số thứ tự 4 chữ số>
      type: String,
      required: true,
      unique: true,
    },
      // Trạng thái mượn sách
   status: {
     type: String,
     enum: ["Sẵn sàng", "Đang mượn", "Quá hạn", "Đã đặt trước"],
     default: "Sẵn sàng",
   },

   // Học sinh đang mượn (nếu có Student model)
   borrowedBy: {
     type: mongoose.Schema.Types.ObjectId,
     ref: "Student", 
     default: null
   },

   // Ngày mượn
   borrowedDate: {
     type: Date,
     default: null   
    },
   // Ngày trả
   returnDate: {
     type: Date,
     default: null
   },
   borrowCount: {
   type: Number,
   default: 0,
 },
   // Thông tin đặc biệt cho sách nói
   duration: {
     // Thời lượng sách nói (ví dụ: "5h 30m")
     type: String,
     default: '',
   },
   narrator: {
     // Người đọc sách nói
     type: String,
     default: '',
   },
  },
  { _id: false } // Không tạo _id riêng cho mỗi BookDetail
);

// Schema chính
const LibrarySchema = new mongoose.Schema(
  {
    libraryCode: {
      // Mã định danh của Library, bắt đầu từ "0001"
      type: String,
      required: true,
      unique: true,
    },
    authors: {
      // Tác giả (có thể có nhiều)
      type: [String],
      default: [],
    },
    title: {
      // Tên Sách (chung cho đầu sách)
      type: String,
      required: true,
    },
    coverImage: {
      // Ảnh bìa
      type: String,
      default: '',
    },
    category: {
      // Thể loại
      type: String,
      default: '',
    },
    documentType: { 
      // Phân loại tài liệu
      type: String, 
      default: '' },
    
    seriesName: { 
      type: String, 
      default: '' },
    language: {
      // Ngôn ngữ (tổng quát)
      type: String,
      default: '',
    },
    // Tab "Mô tả"
    description: {
      linkEmbed: {
        type: String,
        default: '',
      },
      content: {
        type: String,
        default: '',
      }
    },
    
    // Tab "Giới thiệu sách"
    introduction: {
      linkEmbed: {
        type: String,
        default: '',
      },
      content: {
        type: String,
        default: '',
      }
    },
    
    // Tab "Sách nói"
    audioBook: {
      linkEmbed: {
        type: String,
        default: '',
      },
      content: {
        type: String,
        default: '',
      }
    },
    
    // Đặc điểm sách - chuyển lên từ BookDetailSchema
    isNewBook: {
      type: Boolean,
      default: false,
    },
    isFeaturedBook: {
      type: Boolean,
      default: false,
    },
    isAudioBook: {
      type: Boolean,
      default: false,
    },
    
    // Giới thiệu sách thường
    normalIntroduction: {
      type: IntroductionSchema,
      default: {},
    },

    // Giới thiệu sách nói
    audioIntroduction: {
      type: IntroductionSchema,
      default: {},
    },

    // Danh sách các bản "Sách" chi tiết
    books: {
      type: [BookDetailSchema],
      default: [],
    },
  },
  {
    timestamps: true, // Tuỳ chọn, tự động thêm createdAt, updatedAt
  }
);


module.exports = {
  DocumentType,
  SeriesName,
  SpecialCode,
  Author,
  Library: mongoose.model('Library', LibrarySchema),
};