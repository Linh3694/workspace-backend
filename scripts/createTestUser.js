const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Users = require('../models/Users');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://10.1.34.162:27017/inventory", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000,
        });
        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Create test user
const createTestUser = async () => {
    try {
        // Xóa user test nếu có
        await Users.deleteOne({ email: 'test@wellspring.edu.vn' });
        console.log('Đã xóa user test cũ (nếu có)');

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123456', salt);

        // Tạo user test với employeeCode phù hợp với attendance data
        const testUser = new Users({
            fullname: 'Test User WT88EN',
            email: 'test@wellspring.edu.vn',
            password: hashedPassword,
            role: 'user',
            employeeCode: 'WT88EN', // EmployeeCode có attendance data
            department: 'Test Department',
            jobTitle: 'Test Job',
            avatar: 'https://via.placeholder.com/150',
            isActive: true,
            needProfileUpdate: false
        });

        await testUser.save();
        console.log('Đã tạo user test với employeeCode: WT88EN');
        console.log('Email: test@wellspring.edu.vn');
        console.log('Password: 123456');

        // Tạo thêm một user test khác
        const testUser2 = new Users({
            fullname: 'Test User WT20PE',
            email: 'test2@wellspring.edu.vn',
            password: hashedPassword,
            role: 'admin',
            employeeCode: 'WT20PE', // EmployeeCode khác có attendance data
            department: 'Test Department',
            jobTitle: 'Test Admin',
            avatar: 'https://via.placeholder.com/150',
            isActive: true,
            needProfileUpdate: false
        });

        await testUser2.save();
        console.log('Đã tạo user test 2 với employeeCode: WT20PE');
        console.log('Email: test2@wellspring.edu.vn');
        console.log('Password: 123456');

    } catch (error) {
        console.error('Lỗi khi tạo user test:', error);
    }
};

// Run script
const runScript = async () => {
    await connectDB();
    await createTestUser();
    await mongoose.connection.close();
    console.log('Đã đóng kết nối database');
    process.exit(0);
};

// Run if called directly
if (require.main === module) {
    runScript();
}

module.exports = { createTestUser }; 