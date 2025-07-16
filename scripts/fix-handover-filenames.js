const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Import models
const Laptop = require('../models/Laptop');
const Tool = require('../models/Tool');
const Projector = require('../models/Projector');
const Monitor = require('../models/Monitor');
const Printer = require('../models/Printer');

// Hàm sanitize tên file giống như trong controllers
const sanitizeFileName = (originalName) => {
  if (!originalName) return originalName;
  let temp = originalName.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // bỏ dấu
  temp = temp.replace(/\s+/g, "_"); // chuyển dấu cách -> _
  return temp;
};

// Hàm cập nhật document names trong assignmentHistory
const updateDocumentNames = async (Model, modelName) => {
  console.log(`🔄 Đang cập nhật ${modelName}...`);
  
  const items = await Model.find({});
  let updatedCount = 0;
  
  for (const item of items) {
    let hasChanges = false;
    
    for (const history of item.assignmentHistory) {
      if (history.document && history.document.includes(' ')) {
        const sanitizedName = sanitizeFileName(history.document);
        
        // Kiểm tra xem file với tên sanitized có tồn tại không
        const sanitizedPath = path.join(__dirname, "../uploads/Handovers", sanitizedName);
        
        if (fs.existsSync(sanitizedPath)) {
          console.log(`  ✅ Cập nhật: "${history.document}" -> "${sanitizedName}"`);
          history.document = sanitizedName;
          hasChanges = true;
        } else {
          console.log(`  ⚠️ File không tồn tại: ${sanitizedPath}`);
        }
      }
    }
    
    if (hasChanges) {
      await item.save();
      updatedCount++;
    }
  }
  
  console.log(`✅ Đã cập nhật ${updatedCount} ${modelName}`);
  return updatedCount;
};

// Hàm chính
const main = async () => {
  try {
    // Kết nối MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/workspace', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('🔗 Đã kết nối MongoDB');
    
    // Cập nhật từng model
    let totalUpdated = 0;
    
    totalUpdated += await updateDocumentNames(Laptop, 'Laptops');
    totalUpdated += await updateDocumentNames(Tool, 'Tools');
    totalUpdated += await updateDocumentNames(Projector, 'Projectors');
    totalUpdated += await updateDocumentNames(Monitor, 'Monitors');
    totalUpdated += await updateDocumentNames(Printer, 'Printers');
    
    console.log(`\n🎉 Hoàn thành! Đã cập nhật tổng cộng ${totalUpdated} thiết bị`);
    
  } catch (error) {
    console.error('❌ Lỗi:', error);
  } finally {
    // Đóng kết nối
    await mongoose.connection.close();
    console.log('📛 Đã đóng kết nối MongoDB');
  }
};

// Chạy script
main(); 