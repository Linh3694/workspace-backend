const LibraryActivity = require('../../models/LibraryActivity');
const { convertToWebp } = require('../../middleware/uploadLibraryImage');
const path = require('path');

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
    const { title, description, date, images, days, createdBy } = req.body;
    
    // Validation
    if (!title || !date || !createdBy) {
      return res.status(400).json({ message: 'Title, date và createdBy là bắt buộc' });
    }
    
    const newActivity = new LibraryActivity({
      title: title.trim(),
      description: description || '',
      date: new Date(date),
      images: images || [],
      days: days || [],
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
    const { title, description, date, images, days } = req.body;
    
    const updateData = {};
    if (title) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description;
    if (date) updateData.date = new Date(date);
    if (images) updateData.images = images;
    if (days) updateData.days = days;
    
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

// Toggle trạng thái xuất bản
exports.togglePublished = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;
    
    const updatedActivity = await LibraryActivity.findByIdAndUpdate(
      id,
      { isPublished },
      { new: true, runValidators: true }
    );
    
    if (!updatedActivity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    res.status(200).json({
      message: `${isPublished ? 'Xuất bản' : 'Ẩn'} hoạt động thành công`,
      activity: updatedActivity
    });
  } catch (error) {
    console.error('Error toggling published status:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái xuất bản', error: error.message });
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

// Upload ảnh (không gắn vào hoạt động cụ thể)
exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Không có file nào được upload' });
    }

    const uploadedImages = [];
    
    for (const file of req.files) {
      try {
        // Convert ảnh sang WebP và lưu
        const filePath = await convertToWebp(file.buffer, file.originalname);
        
        // Tạo URL để truy cập ảnh - sử dụng relative path
        const imageUrl = `/uploads/Library/${path.basename(filePath)}`;
        
        uploadedImages.push({
          url: imageUrl,
          originalName: file.originalname,
          size: file.size
        });
      } catch (convertError) {
        console.error('Error converting image:', convertError);
        continue; // Bỏ qua ảnh lỗi, tiếp tục với ảnh khác
      }
    }

    if (uploadedImages.length === 0) {
      return res.status(400).json({ message: 'Không thể xử lý ảnh nào' });
    }

    res.status(200).json({
      message: `Upload thành công ${uploadedImages.length} ảnh`,
      images: uploadedImages
    });
  } catch (error) {
    console.error('Error uploading images:', error);
    res.status(500).json({ message: 'Lỗi khi upload ảnh', error: error.message });
  }
};

// Upload ảnh và gắn vào hoạt động cụ thể
exports.uploadImagesForActivity = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Không có file nào được upload' });
    }

    // Kiểm tra hoạt động có tồn tại không
    const activity = await LibraryActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }

    const uploadedImages = [];
    
    for (const file of req.files) {
      try {
        // Convert ảnh sang WebP và lưu
        const filePath = await convertToWebp(file.buffer, file.originalname);
        
        // Tạo URL để truy cập ảnh - sử dụng relative path
        const imageUrl = `/uploads/Library/${path.basename(filePath)}`;
        
        const imageData = {
          url: imageUrl,
          caption: req.body.caption || '',
          uploadedAt: new Date()
        };
        
        uploadedImages.push(imageData);
      } catch (convertError) {
        console.error('Error converting image:', convertError);
        continue; // Bỏ qua ảnh lỗi, tiếp tục với ảnh khác
      }
    }

    if (uploadedImages.length === 0) {
      return res.status(400).json({ message: 'Không thể xử lý ảnh nào' });
    }

    // Thêm ảnh vào hoạt động
    activity.images.push(...uploadedImages);
    await activity.save();

    res.status(200).json({
      message: `Upload thành công ${uploadedImages.length} ảnh`,
      activity
    });
  } catch (error) {
    console.error('Error uploading images for activity:', error);
    res.status(500).json({ message: 'Lỗi khi upload ảnh cho hoạt động', error: error.message });
  }
};

// ===================
// QUẢN LÝ DAYS
// ===================

// Thêm ngày mới vào hoạt động
exports.addDay = async (req, res) => {
  try {
    const { id } = req.params;
    const { dayNumber, date, title, description, images } = req.body;
    
    if (!dayNumber || !date) {
      return res.status(400).json({ message: 'dayNumber và date là bắt buộc' });
    }
    
    const activity = await LibraryActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    // Kiểm tra dayNumber có bị trùng không
    const existingDay = activity.days.find(day => day.dayNumber === dayNumber);
    if (existingDay) {
      return res.status(400).json({ message: `Ngày thứ ${dayNumber} đã tồn tại` });
    }
    
    const newDay = {
      dayNumber,
      date: new Date(date),
      title: title || `Ngày ${dayNumber}`,
      description: description || '',
      images: images || []
    };
    
    activity.days.push(newDay);
    await activity.save();
    
    res.status(201).json({
      message: 'Thêm ngày thành công',
      activity,
      addedDay: activity.days[activity.days.length - 1]
    });
  } catch (error) {
    console.error('Error adding day:', error);
    res.status(500).json({ message: 'Lỗi khi thêm ngày', error: error.message });
  }
};

// Cập nhật thông tin ngày
exports.updateDay = async (req, res) => {
  try {
    const { id, dayId } = req.params;
    const { dayNumber, date, title, description, images } = req.body;
    
    const activity = await LibraryActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    const dayIndex = activity.days.findIndex(day => day._id.toString() === dayId);
    if (dayIndex === -1) {
      return res.status(404).json({ message: 'Không tìm thấy ngày' });
    }
    
    // Kiểm tra dayNumber có bị trùng với ngày khác không
    if (dayNumber && dayNumber !== activity.days[dayIndex].dayNumber) {
      const existingDay = activity.days.find(day => day.dayNumber === dayNumber && day._id.toString() !== dayId);
      if (existingDay) {
        return res.status(400).json({ message: `Ngày thứ ${dayNumber} đã tồn tại` });
      }
    }
    
    // Cập nhật thông tin
    if (dayNumber) activity.days[dayIndex].dayNumber = dayNumber;
    if (date) activity.days[dayIndex].date = new Date(date);
    if (title) activity.days[dayIndex].title = title;
    if (description !== undefined) activity.days[dayIndex].description = description;
    if (images) activity.days[dayIndex].images = images;
    
    await activity.save();
    
    res.status(200).json({
      message: 'Cập nhật ngày thành công',
      activity,
      updatedDay: activity.days[dayIndex]
    });
  } catch (error) {
    console.error('Error updating day:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật ngày', error: error.message });
  }
};

// Xóa ngày khỏi hoạt động
exports.deleteDay = async (req, res) => {
  try {
    const { id, dayId } = req.params;
    
    const activity = await LibraryActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    const initialLength = activity.days.length;
    activity.days = activity.days.filter(day => day._id.toString() !== dayId);
    
    if (activity.days.length === initialLength) {
      return res.status(404).json({ message: 'Không tìm thấy ngày' });
    }
    
    await activity.save();
    
    res.status(200).json({
      message: 'Xóa ngày thành công',
      activity
    });
  } catch (error) {
    console.error('Error deleting day:', error);
    res.status(500).json({ message: 'Lỗi khi xóa ngày', error: error.message });
  }
};

// Toggle trạng thái xuất bản của ngày
exports.toggleDayPublished = async (req, res) => {
  try {
    const { id, dayId } = req.params;
    const { isPublished } = req.body;
    
    const activity = await LibraryActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    const dayIndex = activity.days.findIndex(day => day._id.toString() === dayId);
    if (dayIndex === -1) {
      return res.status(404).json({ message: 'Không tìm thấy ngày' });
    }
    
    activity.days[dayIndex].isPublished = isPublished;
    await activity.save();
    
    res.status(200).json({
      message: `${isPublished ? 'Xuất bản' : 'Ẩn'} ngày thành công`,
      activity,
      updatedDay: activity.days[dayIndex]
    });
  } catch (error) {
    console.error('Error toggling day published status:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật trạng thái xuất bản ngày', error: error.message });
  }
};

// Thêm ảnh vào ngày cụ thể
exports.addImagesToDay = async (req, res) => {
  try {
    const { id, dayId } = req.params;
    const { images } = req.body;
    
    if (!images || !Array.isArray(images)) {
      return res.status(400).json({ message: 'Images phải là một mảng' });
    }
    
    const activity = await LibraryActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    const dayIndex = activity.days.findIndex(day => day._id.toString() === dayId);
    if (dayIndex === -1) {
      return res.status(404).json({ message: 'Không tìm thấy ngày' });
    }
    
    activity.days[dayIndex].images.push(...images);
    await activity.save();
    
    res.status(200).json({
      message: 'Thêm ảnh thành công',
      activity,
      day: activity.days[dayIndex]
    });
  } catch (error) {
    console.error('Error adding images to day:', error);
    res.status(500).json({ message: 'Lỗi khi thêm ảnh vào ngày', error: error.message });
  }
};

// Upload ảnh cho ngày cụ thể
exports.uploadImagesForDay = async (req, res) => {
  try {
    const { id, dayId } = req.params;
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Không có file nào được upload' });
    }

    const activity = await LibraryActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    const dayIndex = activity.days.findIndex(day => day._id.toString() === dayId);
    if (dayIndex === -1) {
      return res.status(404).json({ message: 'Không tìm thấy ngày' });
    }

    const uploadedImages = [];
    
    for (const file of req.files) {
      try {
        const filePath = await convertToWebp(file.buffer, file.originalname);
        const imageUrl = `/uploads/Library/${path.basename(filePath)}`;
        
        const imageData = {
          url: imageUrl,
          caption: req.body.caption || '',
          uploadedAt: new Date()
        };
        
        uploadedImages.push(imageData);
      } catch (convertError) {
        console.error('Error converting image:', convertError);
        continue;
      }
    }

    if (uploadedImages.length === 0) {
      return res.status(400).json({ message: 'Không thể xử lý ảnh nào' });
    }

    activity.days[dayIndex].images.push(...uploadedImages);
    await activity.save();

    res.status(200).json({
      message: `Upload thành công ${uploadedImages.length} ảnh cho ngày ${activity.days[dayIndex].dayNumber}`,
      activity,
      day: activity.days[dayIndex]
    });
  } catch (error) {
    console.error('Error uploading images for day:', error);
    res.status(500).json({ message: 'Lỗi khi upload ảnh cho ngày', error: error.message });
  }
};

// Xóa ảnh khỏi ngày
exports.removeImageFromDay = async (req, res) => {
  try {
    const { id, dayId, imageId } = req.params;
    
    const activity = await LibraryActivity.findById(id);
    if (!activity) {
      return res.status(404).json({ message: 'Không tìm thấy hoạt động' });
    }
    
    const dayIndex = activity.days.findIndex(day => day._id.toString() === dayId);
    if (dayIndex === -1) {
      return res.status(404).json({ message: 'Không tìm thấy ngày' });
    }
    
    activity.days[dayIndex].images = activity.days[dayIndex].images.filter(
      img => img._id.toString() !== imageId
    );
    await activity.save();
    
    res.status(200).json({
      message: 'Xóa ảnh thành công',
      activity,
      day: activity.days[dayIndex]
    });
  } catch (error) {
    console.error('Error removing image from day:', error);
    res.status(500).json({ message: 'Lỗi khi xóa ảnh khỏi ngày', error: error.message });
  }
}; 