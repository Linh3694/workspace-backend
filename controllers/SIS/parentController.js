const Parent = require("../../models/Parent");
const User = require("../../models/Users");
const Family = require("../../models/Family");

// Lấy danh sách tất cả phụ huynh
exports.getAllParents = async (req, res) => {
    try {
        const parents = await Parent.find().populate('user', 'active username phone');
        res.status(200).json(parents);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Lấy thông tin một phụ huynh theo ID
exports.getParentById = async (req, res) => {
    try {
        const parent = await Parent.findById(req.params.id);
        if (!parent) {
            return res.status(404).json({ message: 'Không tìm thấy phụ huynh' });
        }
        res.status(200).json(parent);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Tạo phụ huynh mới
exports.createParent = async (req, res) => {
    try {
        const { 
            user, 
            fullname, 
            phone, 
            email, 
            // Thêm các trường cho tạo User account
            createUserAccount, 
            username, 
            password 
        } = req.body;
        
        // Validate required fields
        if (!fullname || !email) {
            return res.status(400).json({ message: 'Fullname and email are required' });
        }

        // Validate user account creation fields
        if (createUserAccount) {
            if (!username || !password) {
                return res.status(400).json({ 
                    message: 'Username and password are required when creating user account' 
                });
            }
            
            // Check if username already exists
            const existingUser = await User.findOne({ 
                $or: [{ username }, { email }] 
            });
            if (existingUser) {
                return res.status(400).json({ 
                    message: 'Username or email already exists in user system' 
                });
            }
        }
        
        // Check if parent with same email already exists
        const existingParent = await Parent.findOne({ email });
        if (existingParent) {
            return res.status(400).json({ message: 'Parent with this email already exists' });
        }

        let createdUser = null;
        let parentData = { ...req.body };

        // Tạo User account nếu được yêu cầu
        if (createUserAccount) {
            try {
                createdUser = await User.create({
                    username,
                    password,
                    email,
                    fullname,
                    role: 'parent',
                    active: true,
                    phone
                });
                
                // Gán user ID vào parent data
                parentData.user = createdUser._id;
                console.log('✅ [CreateParent] User account created:', createdUser._id);
            } catch (userError) {
                console.error('❌ [CreateParent] Error creating user:', userError);
                return res.status(400).json({ 
                    message: 'Failed to create user account: ' + userError.message 
                });
            }
        }

        // Tạo Parent record
        const parent = new Parent(parentData);
        const savedParent = await parent.save();        
        
        // Populate user data nếu có
        const populatedParent = await Parent.findById(savedParent._id)
            .populate('user', 'active username email fullname role');
        
        console.log('✅ [CreateParent] Parent created successfully:', savedParent._id);
        
        res.status(201).json({
            parent: populatedParent,
            userCreated: !!createdUser,
            message: createdUser ? 
                'Parent và tài khoản User đã được tạo thành công' : 
                'Parent đã được tạo thành công'
        });
    } catch (err) {
        console.error('❌ [CreateParent] Error:', err);
        res.status(400).json({ message: err.message });
    }
};

// Tạo phụ huynh mới kèm tài khoản User
exports.createParentWithAccount = async (req, res) => {
    try {
        const { 
            fullname, 
            phone, 
            email, 
            username, 
            password,
            students = []
        } = req.body;
        
        // Validate required fields
        if (!fullname || !email || !username || !password) {
            return res.status(400).json({ 
                message: 'Fullname, email, username, and password are required' 
            });
        }

        // Check if username or email already exists
        const existingUser = await User.findOne({ 
            $or: [{ username }, { email }] 
        });
        if (existingUser) {
            return res.status(400).json({ 
                message: 'Username or email already exists in user system' 
            });
        }

        // Check if parent with same email already exists
        const existingParent = await Parent.findOne({ email });
        if (existingParent) {
            return res.status(400).json({ 
                message: 'Parent with this email already exists' 
            });
        }

        // Tạo User account
        const createdUser = await User.create({
            username,
            password,
            email,
            fullname,
            role: 'parent',
            active: true,
            phone
        });

        // Tạo Parent record
        const parent = await Parent.create({
            user: createdUser._id,
            fullname,
            phone,
            email,
            students
        });

        // Populate user data
        const populatedParent = await Parent.findById(parent._id)
            .populate('user', 'active username email fullname role')
            .populate('students', 'fullName studentCode');

        console.log('✅ [CreateParentWithAccount] Parent with account created:', parent._id);

        res.status(201).json({
            parent: populatedParent,
            user: {
                _id: createdUser._id,
                username: createdUser.username,
                email: createdUser.email,
                role: createdUser.role
            },
            message: 'Parent và tài khoản User đã được tạo thành công'
        });
    } catch (err) {
        console.error('❌ [CreateParentWithAccount] Error:', err);
        res.status(400).json({ message: err.message });
    }
};

// Cập nhật thông tin phụ huynh
exports.updateParent = async (req, res) => {
    try {
        const parent = await Parent.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!parent) {
            return res.status(404).json({ message: 'Không tìm thấy phụ huynh' });
        }
        res.status(200).json(parent);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// Xóa phụ huynh
exports.deleteParent = async (req, res) => {
    try {
        const parent = await Parent.findByIdAndDelete(req.params.id);
        // Xóa luôn user nếu phụ huynh có tài khoản
        if (parent && parent.user) {
            await User.findByIdAndDelete(parent.user);
        }
        // Remove dangling references from any Family documents
        await Family.updateMany(
            { "parents.parent": req.params.id },
            { $pull: { parents: { parent: req.params.id } } }
        );
        if (!parent) {
            return res.status(404).json({ message: 'Không tìm thấy phụ huynh' });
        }
        res.status(200).json({ message: 'Đã xóa phụ huynh thành công' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
