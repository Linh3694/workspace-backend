// backend/models/AwardCategory.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const SubAwardSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["month", "semester", "year", "custom", "custom_with_description"],
      required: true,
    },
    schoolYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolYear",
    },
    month: { type: Number },
    semester: { type: Number },
    year: { type: Number },
    label: { type: String },
    labelEng: { type: String },
    description: { type: String },
    descriptionEng: { type: String },
    awardCount: { type: Number, required: true, default: 0 },
    priority: { type: Number, default: 0 }
  },
  { _id: false }
);

const AwardCategorySchema = new Schema({
  name: { type: String, required: true },   
  nameEng: { type: String, required: true },   // Ví dụ: "Học bổng Tài năng"
  description: { type: String },     
  descriptionEng: { type: String },          // Mô tả chung
  coverImage: { type: String },                // Đường dẫn ảnh cover (upload qua middleware)
  subAwards: [SubAwardSchema],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AwardCategory", AwardCategorySchema);