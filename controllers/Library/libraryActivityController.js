const LibraryActivity = require('../../models/LibraryActivity');

// Lấy tất cả hoạt động thư viện
exports.getAllActivities = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, sortBy = 'date' } = req.query;
    
    const query = { isPublished: true };
    
    // Tìm kiếm theo title
    if (search) {
      query.$text = { $search: search };
    }
    
    // Sắp xếp
    let sort = {};
    switch (sortBy) {
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'oldest':
        sort = { createdAt: 1 };
        break;
      case 'date':
      default:
        sort = { date: -1 };
        break;
    }
    
    const activities = await LibraryActivity.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();
    
    const total = await LibraryActivity.countDocuments(query);
    
    res.status(200).json({
      activities,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error getting activities:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách hoạt động', error: error.message });
  }
};

// Lấy một hoạt động theo ID
exports.getActivityById = async (req, res) => {
  try {
    const { id } = req.params;
    const activity = await LibraryActivity.findById(id);
    
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    res.status(200).json(activity);
  } catch (error) {
    console.error('Error getting activity:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin hoạt động', error: error.message });
  }
};

// Tạo hoạt động mới
exports.createActivity = async (req, res) => {
  try {
    const { title, date, images, createdBy } = req.body;
    
    // Validation
    if (!title || !date || !createdBy) {
      return res.status(400).json({ message: 'Title, date và createdBy là bắt buộc' });
    }
    
    const newActivity = new LibraryActivity({
      title: title.trim(),
      date: new Date(date),
      images: images || [],
      createdBy
    });
    
    await newActivity.save();
    res.status(201).json(newActivity);
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ message: 'Lỗi khi tạo hoạt động', error: error.message });
  }
};

// Cập nhật hoạt động
exports.updateActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, date, images } = req.body;
    
    const updateData = {};
    if (title) updateData.title = title.trim();
    if (date) updateData.date = new Date(date);
    if (images) updateData.images = images;
    
    const updatedActivity = await LibraryActivity.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!updatedActivity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    res.status(200).json(updatedActivity);
  } catch (error) {
    console.error('Error updating activity:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật hoạt động', error: error.message });
  }
};

// Xóa hoạt động
exports.deleteActivity = async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedActivity = await LibraryActivity.findByIdAndDelete(id);
    
    if (!deletedActivity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    res.status(200).json({ message: 'Xóa hoạt động thành công' });
  } catch (error) {
    console.error('Error deleting activity:', error);
    res.status(500).json({ message: 'Lỗi khi xóa hoạt động', error: error.message });
  }
};

// Thêm ảnh vào hoạt động
exports.addImages = async (req, res) => {
  try {
    const { id } = req.params;
    const { images } = req.body;
    
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ message: 'Images phải là một mảng' });
    }
    
    const activity = await LibraryActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    activity.images.push(...images);
    await activity.save();
    
    res.status(200).json(activity);
  } catch (error) {
    console.error('Error adding images:', error);
    res.status(500).json({ message: 'Lỗi khi thêm ảnh', error: error.message });
  }
};

// Xóa ảnh khỏi hoạt động
exports.removeImage = async (req, res) => {
  try {
    const { id, imageId } = req.params;
    
    const activity = await LibraryActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    activity.images = activity.images.filter(img => img._id.toString() !== imageId);
    await activity.save();
    
    res.status(200).json(activity);
  } catch (error) {
    console.error('Error removing image:', error);
    res.status(500).json({ message: 'Lỗi khi xóa ảnh', error: error.message });
  }
}; 