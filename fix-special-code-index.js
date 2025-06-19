const mongoose = require('mongoose');

// Script để xóa unique index của collection specialcodes
async function removeUniqueIndex() {
  try {
    // Kết nối MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/workspace');
    console.log('✅ Kết nối MongoDB thành công');

    // Lấy collection specialcodes
    const db = mongoose.connection.db;
    const collection = db.collection('specialcodes');

    // Xem các index hiện tại
    const indexes = await collection.indexes();
    console.log('📋 Các index hiện tại:', indexes);

    // Tìm và xóa unique index trên trường 'code'
    const codeIndex = indexes.find(index => 
      index.key && index.key.code === 1 && index.unique === true
    );

    if (codeIndex) {
      console.log('🗑️ Đang xóa unique index:', codeIndex.name);
      await collection.dropIndex(codeIndex.name);
      console.log('✅ Đã xóa unique index thành công');
    } else {
      console.log('⚠️ Không tìm thấy unique index trên trường code');
    }

    // Kiểm tra các document trùng lặp
    const duplicates = await collection.aggregate([
      { $group: { _id: "$code", count: { $sum: 1 }, docs: { $push: "$_id" } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (duplicates.length > 0) {
      console.log('⚠️ Tìm thấy các document trùng lặp:', duplicates);
      
      // Xóa các bản sao (giữ lại bản đầu tiên)
      for (const dup of duplicates) {
        const docsToDelete = dup.docs.slice(1); // Giữ lại document đầu tiên
        console.log(`🗑️ Xóa ${docsToDelete.length} bản sao của code: ${dup._id}`);
        await collection.deleteMany({ _id: { $in: docsToDelete } });
      }
      console.log('✅ Đã xóa các bản sao trùng lặp');
    } else {
      console.log('✅ Không có document trùng lặp');
    }

    console.log('🎉 Hoàn tất xử lý!');
    
  } catch (error) {
    console.error('❌ Lỗi:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Đã ngắt kết nối MongoDB');
  }
}

// Chạy script
removeUniqueIndex(); 