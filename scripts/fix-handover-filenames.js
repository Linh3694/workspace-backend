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
    // Kiểm tra MONGO_URI
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ Lỗi: MONGO_URI không được thiết lập');
      console.log('💡 Hướng dẫn: Đặt MONGO_URI=mongodb://app:wellspring@172.16.20.130:27017/workspace?authSource=workspace');
      process.exit(1);
    }
    
    console.log('🔗 Đang kết nối MongoDB...');
    console.log(`📍 URI: ${mongoUri.replace(/\/\/.*@/, '//*****@')}`); // Ẩn password
    
    // Kết nối MongoDB (loại bỏ deprecated options)
    await mongoose.connect(mongoUri);
    
    console.log('✅ Đã kết nối MongoDB thành công');
    
    // Cập nhật từng model
    let totalUpdated = 0;
    
    totalUpdated += await updateDocumentNames(Laptop, 'Laptops');
    totalUpdated += await updateDocumentNames(Tool, 'Tools');
    totalUpdated += await updateDocumentNames(Projector, 'Projectors');
    totalUpdated += await updateDocumentNames(Monitor, 'Monitors');
    totalUpdated += await updateDocumentNames(Printer, 'Printers');
    
    console.log(`\n🎉 Hoàn thành! Đã cập nhật tổng cộng ${totalUpdated} thiết bị`);
    
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    if (error.name === 'MongooseServerSelectionError') {
      console.log('💡 Hướng dẫn:');
      console.log('   1. Kiểm tra MONGO_URI có đúng không');
      console.log('   2. Kiểm tra kết nối mạng tới MongoDB server');
      console.log('   3. Kiểm tra MongoDB server có đang chạy không');
    }
  } finally {
    // Đóng kết nối
    await mongoose.connection.close();
    console.log('📛 Đã đóng kết nối MongoDB');
  }
};

// Chạy script
main(); 