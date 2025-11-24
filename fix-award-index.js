const mongoose = require('mongoose');
require('dotenv').config();

async function fixIndex() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/workspace');
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('awardrecords');

    // Drop old index
    try {
      await collection.dropIndex('unique_student_award');
      console.log('✅ Dropped old index');
    } catch (error) {
      console.log('ℹ️  Old index not found or already dropped');
    }

    // Create new index with partial filter - chỉ áp dụng cho documents có students.student là ObjectId
    await collection.createIndex(
      {
        awardCategory: 1,
        'subAward.type': 1,
        'subAward.label': 1,
        'subAward.schoolYear': 1,
        'students.student': 1,
      },
      {
        unique: true,
        name: 'unique_student_award',
        partialFilterExpression: {
          'students.student': { $type: 'objectId' }
        }
      }
    );

    console.log('✅ Created new index successfully');
    console.log('🎉 Index fix completed! You can now create award records without duplicate key errors.');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixIndex();
