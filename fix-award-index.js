const mongoose = require('mongoose');
require('dotenv').config();

async function removeUniqueIndex() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/workspace');
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('awardrecords');

    // Drop unique index
    try {
      await collection.dropIndex('unique_student_award');
      console.log('✅ Dropped unique_student_award index');
    } catch (error) {
      console.log('ℹ️  Index not found or already dropped:', error.message);
    }

    // Tạo lại index không unique để duy trì performance
    try {
      await collection.createIndex(
        {
          awardCategory: 1,
          'subAward.type': 1,
          'subAward.label': 1,
          'subAward.schoolYear': 1,
          'students.student': 1,
        },
        {
          name: 'student_award_lookup',
          background: true
        }
      );
      console.log('✅ Created non-unique lookup index for performance');
    } catch (error) {
      console.log('⚠️  Could not create lookup index:', error.message);
    }

    console.log('🎉 Unique constraint removed! You can now create duplicate award records.');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

removeUniqueIndex();
